<?php
declare(strict_types=1);

require_once __DIR__ . '/lib.php';

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Strict']);
    session_start();
}

if (empty($_SESSION['lb_uid'])) {
    lb_json(['ok' => false, 'error' => 'No autenticado.'], 401);
}

$pdo    = lb_pdo();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? '';

// ── GET ──────────────────────────────────────────────────────────────────────
if ($method === 'GET') {

    // Carga datos de una venta para preseleccionar productos en el formulario
    if ($action === 'ref_venta') {
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) lb_json(['ok' => false, 'error' => 'id requerido.'], 422);

        $st = $pdo->prepare(
            'SELECT v.id_venta, DATE_FORMAT(v.fecha,\'%Y-%m-%d %H:%i\') AS fecha, v.total,
                    d.id_detalle, d.idProducto AS id_producto, p.nombre AS producto,
                    d.cantidad, d.precio AS precio_unitario
             FROM ventas v
             JOIN detalle_venta d ON d.id_venta = v.id_venta
             JOIN Producto p ON p.idProducto = d.idProducto
             WHERE v.id_venta = ?'
        );
        $st->execute([$id]);
        $rows = $st->fetchAll();
        if (!$rows) lb_json(['ok' => false, 'error' => "Venta #$id no encontrada."], 404);

        $cabecera = ['id_venta' => $rows[0]['id_venta'], 'fecha' => $rows[0]['fecha'], 'total' => $rows[0]['total']];
        $detalle  = array_map(fn($r) => [
            'id_producto'    => (int) $r['id_producto'],
            'producto'       => $r['producto'],
            'cantidad'       => (int) $r['cantidad'],
            'precio_unitario'=> (float) $r['precio_unitario'],
        ], $rows);
        lb_json(['ok' => true, 'cabecera' => $cabecera, 'detalle' => $detalle]);
    }

    // Carga datos de una compra para preseleccionar productos
    if ($action === 'ref_compra') {
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) lb_json(['ok' => false, 'error' => 'id requerido.'], 422);

        $st = $pdo->prepare(
            'SELECT c.idCompra, DATE_FORMAT(c.fecha,\'%Y-%m-%d\') AS fecha,
                    d.idProducto AS id_producto, p.nombre AS producto,
                    d.cantidad, d.precioCompra AS precio_unitario
             FROM Compra c
             JOIN DetalleCompra d ON d.idCompra = c.idCompra
             JOIN Producto p ON p.idProducto = d.idProducto
             WHERE c.idCompra = ?'
        );
        $st->execute([$id]);
        $rows = $st->fetchAll();
        if (!$rows) lb_json(['ok' => false, 'error' => "Compra #$id no encontrada."], 404);

        $cabecera = ['id_compra' => $rows[0]['idCompra'], 'fecha' => $rows[0]['fecha']];
        $detalle  = array_map(fn($r) => [
            'id_producto'    => (int) $r['id_producto'],
            'producto'       => $r['producto'],
            'cantidad'       => (int) $r['cantidad'],
            'precio_unitario'=> (float) $r['precio_unitario'],
        ], $rows);
        lb_json(['ok' => true, 'cabecera' => $cabecera, 'detalle' => $detalle]);
    }

    // Listar devoluciones con filtros opcionales
    $tipo   = $_GET['tipo']   ?? '';
    $estado = $_GET['estado'] ?? '';
    $desde  = $_GET['desde']  ?? '';
    $hasta  = $_GET['hasta']  ?? '';

    $where = ['1=1'];
    $params = [];
    if ($tipo   !== '') { $where[] = 'd.tipo = ?';              $params[] = $tipo;   }
    if ($estado !== '') { $where[] = 'd.estado = ?';            $params[] = $estado; }
    if ($desde  !== '') { $where[] = 'DATE(d.fecha) >= ?';      $params[] = $desde;  }
    if ($hasta  !== '') { $where[] = 'DATE(d.fecha) <= ?';      $params[] = $hasta;  }

    $sql = 'SELECT d.id, d.tipo, d.id_referencia,
                   DATE_FORMAT(d.fecha,\'%Y-%m-%d %H:%i\') AS fecha,
                   d.motivo, d.estado, d.notas,
                   COUNT(dd.id) AS num_productos,
                   SUM(dd.cantidad * dd.precio_unitario) AS total
            FROM lb_devolucion d
            LEFT JOIN lb_devolucion_detalle dd ON dd.id_devolucion = d.id
            WHERE ' . implode(' AND ', $where) . '
            GROUP BY d.id ORDER BY d.fecha DESC, d.id DESC
            LIMIT 200';

    $st = $pdo->prepare($sql);
    $st->execute($params);
    lb_json(['ok' => true, 'devoluciones' => $st->fetchAll()]);
}

// ── POST — crear devolución ──────────────────────────────────────────────────
if ($method === 'POST') {
    $b            = json_decode(file_get_contents('php://input'), true) ?? [];
    $tipo         = trim($b['tipo']         ?? '');
    $id_referencia= (int)($b['id_referencia'] ?? 0);
    $motivo       = trim($b['motivo']       ?? '');
    $notas        = trim($b['notas']        ?? '');
    $detalle      = $b['detalle']           ?? [];

    if (!in_array($tipo, ['venta', 'compra'], true))
        lb_json(['ok' => false, 'error' => 'tipo debe ser venta o compra.'], 422);
    if ($id_referencia === 0)
        lb_json(['ok' => false, 'error' => 'id_referencia requerido.'], 422);
    if ($motivo === '')
        lb_json(['ok' => false, 'error' => 'El motivo es requerido.'], 422);
    if (empty($detalle))
        lb_json(['ok' => false, 'error' => 'Debe incluir al menos un producto.'], 422);

    foreach ($detalle as $d) {
        if ((int)($d['cantidad'] ?? 0) <= 0)
            lb_json(['ok' => false, 'error' => 'Todas las cantidades deben ser mayores a 0.'], 422);
    }

    try {
        $pdo->beginTransaction();
        $pdo->prepare(
            'INSERT INTO lb_devolucion (tipo, id_referencia, motivo, notas) VALUES (?,?,?,?)'
        )->execute([$tipo, $id_referencia, $motivo, $notas ?: null]);
        $id_dev = (int)$pdo->lastInsertId();

        $stDet = $pdo->prepare(
            'INSERT INTO lb_devolucion_detalle (id_devolucion, id_producto, cantidad, precio_unitario)
             VALUES (?,?,?,?)'
        );
        foreach ($detalle as $d) {
            $stDet->execute([
                $id_dev,
                (int)$d['id_producto'],
                (int)$d['cantidad'],
                (float)($d['precio_unitario'] ?? 0),
            ]);
        }
        $pdo->commit();
        lb_json(['ok' => true, 'id' => $id_dev]);
    } catch (PDOException $e) {
        $pdo->rollBack();
        lb_json_sql_error($e, 'Error al crear devolución.');
    }
}

// ── PUT — cambiar estado ─────────────────────────────────────────────────────
if ($method === 'PUT') {
    $b      = json_decode(file_get_contents('php://input'), true) ?? [];
    $id     = (int)($b['id']     ?? 0);
    $estado = trim($b['estado']  ?? '');

    if ($id === 0) lb_json(['ok' => false, 'error' => 'id requerido.'], 422);
    if (!in_array($estado, ['aprobada', 'rechazada'], true))
        lb_json(['ok' => false, 'error' => 'estado debe ser aprobada o rechazada.'], 422);

    // Verificar estado actual
    $dev = $pdo->prepare('SELECT tipo, estado FROM lb_devolucion WHERE id = ?');
    $dev->execute([$id]);
    $dev = $dev->fetch();
    if (!$dev) lb_json(['ok' => false, 'error' => 'Devolución no encontrada.'], 404);
    if ($dev['estado'] !== 'pendiente')
        lb_json(['ok' => false, 'error' => 'Solo se pueden procesar devoluciones en estado pendiente.'], 422);

    try {
        $pdo->beginTransaction();
        $pdo->prepare('UPDATE lb_devolucion SET estado = ? WHERE id = ?')->execute([$estado, $id]);

        if ($estado === 'aprobada') {
            // Actualizar inventario según el tipo
            $detalles = $pdo->prepare('SELECT id_producto, cantidad FROM lb_devolucion_detalle WHERE id_devolucion = ?');
            $detalles->execute([$id]);
            $stInv = $pdo->prepare(
                'INSERT INTO Inventario (idProducto, cantidad, entrada, salida, stock)
                 VALUES (?, ?, ?, ?, 0)'
            );
            foreach ($detalles->fetchAll() as $d) {
                $entrada = $dev['tipo'] === 'venta' ? $d['cantidad'] : 0;
                $salida  = $dev['tipo'] === 'compra' ? $d['cantidad'] : 0;
                $stInv->execute([$d['id_producto'], $d['cantidad'], $entrada, $salida]);
            }
        }

        $pdo->commit();
        lb_json(['ok' => true]);
    } catch (PDOException $e) {
        $pdo->rollBack();
        lb_json_sql_error($e, 'Error al procesar devolución.');
    }
}

// ── DELETE — eliminar devolución pendiente ───────────────────────────────────
if ($method === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    if ($id === 0) lb_json(['ok' => false, 'error' => 'id requerido.'], 422);

    $row = $pdo->prepare('SELECT estado FROM lb_devolucion WHERE id = ?');
    $row->execute([$id]);
    $row = $row->fetch();
    if (!$row) lb_json(['ok' => false, 'error' => 'Devolución no encontrada.'], 404);
    if ($row['estado'] !== 'pendiente')
        lb_json(['ok' => false, 'error' => 'Solo se pueden eliminar devoluciones pendientes.'], 422);

    $pdo->prepare('DELETE FROM lb_devolucion WHERE id = ?')->execute([$id]);
    lb_json(['ok' => true]);
}

lb_json(['ok' => false, 'error' => 'Método no permitido.'], 405);
