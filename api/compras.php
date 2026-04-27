<?php
/**
 * API Compras — LATAS_BOYACA
 *
 * GET  ?catalog=1           → importadores + productos
 * GET                       → listar compras (total = SUM(valorTotal))
 * GET  ?id=N                → detalle compra + líneas
 * POST                      → crear (JSON: idImportador, fecha?, detalles[] con precioVenta)
 * POST ?action=update&id=N  → editar (solo si estado != recibida)
 * POST ?action=recibir&id=N → recibir: stock + Inventario + estado recibida
 */
declare(strict_types=1);

require_once dirname(__DIR__) . '/config/database.php';

header('Content-Type: application/json; charset=utf-8');

function json_out(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function catalogo(PDO $pdo): array
{
    $imp = $pdo->query('SELECT idImportador, nombre, telefono, correo FROM Importador ORDER BY nombre')->fetchAll();
    $prod = $pdo->query('SELECT idProducto, nombre, marca, precioInicial, estado FROM Producto ORDER BY nombre')->fetchAll();
    return ['ok' => true, 'importadores' => $imp, 'productos' => $prod];
}

function listar(PDO $pdo): array
{
    $sql = 'SELECT c.idCompra, i.nombre AS nombreImportador, c.estado, c.fecha,
            COALESCE((SELECT SUM(dc.valorTotal) FROM DetalleCompra dc WHERE dc.idCompra = c.idCompra), 0) AS total
            FROM Compra c
            INNER JOIN Importador i ON i.idImportador = c.idImportador
            ORDER BY c.idCompra DESC';
    $rows = $pdo->query($sql)->fetchAll();
    return ['ok' => true, 'compras' => $rows];
}

function detalle(PDO $pdo, int $idCompra): array
{
    $st = $pdo->prepare(
        'SELECT c.idCompra, c.idImportador, c.fecha, c.estado, i.nombre AS nombreImportador
         FROM Compra c
         INNER JOIN Importador i ON i.idImportador = c.idImportador
         WHERE c.idCompra = ?'
    );
    $st->execute([$idCompra]);
    $compra = $st->fetch();
    if (!$compra) {
        return ['ok' => false, 'error' => 'Compra no encontrada'];
    }

    $st2 = $pdo->prepare(
        'SELECT d.idDetalle, d.idProducto, d.cantidad, d.precioCompra, d.valorTotal,
                p.nombre AS nombreProducto, p.precioInicial AS precioVenta
         FROM DetalleCompra d
         INNER JOIN Producto p ON p.idProducto = d.idProducto
         WHERE d.idCompra = ?
         ORDER BY d.idDetalle'
    );
    $st2->execute([$idCompra]);
    $lineas = $st2->fetchAll();

    $stTot = $pdo->prepare('SELECT COALESCE(SUM(valorTotal), 0) AS total FROM DetalleCompra WHERE idCompra = ?');
    $stTot->execute([$idCompra]);
    $total = (float) $stTot->fetchColumn();

    return ['ok' => true, 'compra' => $compra, 'detalles' => $lineas, 'total' => $total];
}

function validarDetalles(array $detalles): ?string
{
    if (count($detalles) < 1) {
        return 'Debe haber al menos un producto.';
    }
    foreach ($detalles as $d) {
        $pid = isset($d['idProducto']) ? (int) $d['idProducto'] : 0;
        $cant = isset($d['cantidad']) ? (int) $d['cantidad'] : 0;
        $precio = isset($d['precioCompra']) ? (float) $d['precioCompra'] : -1;
        $precioVenta = isset($d['precioVenta']) ? (float) $d['precioVenta'] : -1;
        if ($pid <= 0) {
            return 'Producto inválido.';
        }
        if ($cant <= 0) {
            return 'La cantidad debe ser mayor a 0.';
        }
        if ($precio < 0) {
            return 'El precio no puede ser negativo.';
        }
        if ($precioVenta < 0) {
            return 'El precio de venta no puede ser negativo.';
        }
    }
    return null;
}

function insertarDetalles(PDO $pdo, int $idCompra, array $detalles): void
{
    $ins = $pdo->prepare(
        'INSERT INTO DetalleCompra (idCompra, idProducto, cantidad, precioCompra, valorTotal)
         VALUES (?, ?, ?, ?, ?)'
    );
    $upVenta = $pdo->prepare('UPDATE Producto SET precioInicial = ? WHERE idProducto = ?');
    foreach ($detalles as $d) {
        $cant = (int) $d['cantidad'];
        $precio = (float) $d['precioCompra'];
        $precioVenta = round((float) ($d['precioVenta'] ?? 0), 2);
        $valor = round($cant * $precio, 2);
        $ins->execute([(int) $idCompra, (int) $d['idProducto'], $cant, $precio, $valor]);
        $upVenta->execute([$precioVenta, (int) $d['idProducto']]);
    }
}

function registrarEntradasInventario(PDO $pdo, array $detalles): void
{
    $insInv = $pdo->prepare(
        'INSERT INTO Inventario (fechaActualizacion, cantidad, idProducto, entrada, salida)
         VALUES (NOW(), ?, ?, ?, 0)'
    );
    foreach ($detalles as $d) {
        $cant = (int) $d['cantidad'];
        $pid = (int) $d['idProducto'];
        $insInv->execute([$cant, $pid, $cant]);
    }
}

function crear(PDO $pdo, array $in): array
{
    $idImp = isset($in['idImportador']) ? (int) $in['idImportador'] : 0;
    $detalles = isset($in['detalles']) && is_array($in['detalles']) ? $in['detalles'] : [];
    $fecha = isset($in['fecha']) && $in['fecha'] !== '' ? (string) $in['fecha'] : date('Y-m-d');

    if ($idImp <= 0) {
        return ['ok' => false, 'error' => 'Seleccione un importador.'];
    }
    $err = validarDetalles($detalles);
    if ($err) {
        return ['ok' => false, 'error' => $err];
    }

    $pdo->beginTransaction();
    try {
        $st = $pdo->prepare('INSERT INTO Compra (idImportador, fecha, estado) VALUES (?, ?, \'recibida\')');
        $st->execute([$idImp, $fecha]);
        $idCompra = (int) $pdo->lastInsertId();
        insertarDetalles($pdo, $idCompra, $detalles);
        registrarEntradasInventario($pdo, $detalles);
        $pdo->commit();
        return ['ok' => true, 'idCompra' => $idCompra];
    } catch (Throwable $e) {
        $pdo->rollBack();
        return ['ok' => false, 'error' => $e->getMessage()];
    }
}

function actualizar(PDO $pdo, int $idCompra, array $in): array
{
    $st = $pdo->prepare('SELECT estado FROM Compra WHERE idCompra = ?');
    $st->execute([$idCompra]);
    $row = $st->fetch();
    if (!$row) {
        return ['ok' => false, 'error' => 'Compra no encontrada'];
    }
    if ($row['estado'] === 'recibida') {
        return ['ok' => false, 'error' => 'No se puede editar una compra recibida.'];
    }

    $idImp = isset($in['idImportador']) ? (int) $in['idImportador'] : 0;
    $fecha = isset($in['fecha']) ? (string) $in['fecha'] : date('Y-m-d');
    $estado = isset($in['estado']) ? (string) $in['estado'] : 'pendiente';
    $detalles = isset($in['detalles']) && is_array($in['detalles']) ? $in['detalles'] : [];

    if (!in_array($estado, ['pendiente', 'en_transito'], true)) {
        return ['ok' => false, 'error' => 'Estado inválido para edición. Use Recibir para marcar como recibida.'];
    }
    if ($idImp <= 0) {
        return ['ok' => false, 'error' => 'Seleccione un importador.'];
    }
    $err = validarDetalles($detalles);
    if ($err) {
        return ['ok' => false, 'error' => $err];
    }

    $pdo->beginTransaction();
    try {
        $up = $pdo->prepare('UPDATE Compra SET idImportador = ?, fecha = ?, estado = ? WHERE idCompra = ? AND estado <> \'recibida\'');
        $up->execute([$idImp, $fecha, $estado, $idCompra]);
        if ($up->rowCount() === 0) {
            $pdo->rollBack();
            return ['ok' => false, 'error' => 'No se pudo actualizar (¿compra recibida?)'];
        }
        $del = $pdo->prepare('DELETE FROM DetalleCompra WHERE idCompra = ?');
        $del->execute([$idCompra]);
        insertarDetalles($pdo, $idCompra, $detalles);
        $pdo->commit();
        return ['ok' => true, 'idCompra' => $idCompra];
    } catch (Throwable $e) {
        $pdo->rollBack();
        return ['ok' => false, 'error' => $e->getMessage()];
    }
}

function recibir(PDO $pdo, int $idCompra): array
{
    $pdo->beginTransaction();
    try {
        $st = $pdo->prepare('SELECT estado FROM Compra WHERE idCompra = ? FOR UPDATE');
        $st->execute([$idCompra]);
        $row = $st->fetch();
        if (!$row) {
            $pdo->rollBack();
            return ['ok' => false, 'error' => 'Compra no encontrada'];
        }
        if ($row['estado'] === 'recibida') {
            $pdo->rollBack();
            return ['ok' => false, 'error' => 'La compra ya está recibida.'];
        }

        $stD = $pdo->prepare('SELECT idProducto, cantidad FROM DetalleCompra WHERE idCompra = ?');
        $stD->execute([$idCompra]);
        $lineas = $stD->fetchAll();

        $insInv = $pdo->prepare(
            'INSERT INTO Inventario (fechaActualizacion, cantidad, idProducto, entrada, salida)
             VALUES (CURDATE(), ?, ?, ?, 0)'
        );

        foreach ($lineas as $ln) {
            $pid = (int) $ln['idProducto'];
            $cant = (int) $ln['cantidad'];
            $insInv->execute([$cant, $pid, $cant]);
        }

        $upC = $pdo->prepare('UPDATE Compra SET estado = \'recibida\' WHERE idCompra = ?');
        $upC->execute([$idCompra]);

        $pdo->commit();
        return ['ok' => true, 'idCompra' => $idCompra];
    } catch (Throwable $e) {
        $pdo->rollBack();
        return ['ok' => false, 'error' => $e->getMessage()];
    }
}

// ——— Enrutado ———
try {
    $pdo = lb_get_pdo();
} catch (Throwable $e) {
    json_out(['ok' => false, 'error' => 'Error de conexión a la base de datos: ' . $e->getMessage()], 500);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    if (isset($_GET['catalog']) && $_GET['catalog'] === '1') {
        json_out(catalogo($pdo));
    }
    if (isset($_GET['id'])) {
        $id = (int) $_GET['id'];
        if ($id <= 0) {
            json_out(['ok' => false, 'error' => 'ID inválido'], 400);
        }
        json_out(detalle($pdo, $id));
    }
    json_out(listar($pdo));
}

if ($method === 'POST') {
    $action = $_GET['action'] ?? 'create';
    $raw = file_get_contents('php://input');
    $input = $raw !== '' ? json_decode($raw, true) : [];
    if (!is_array($input)) {
        $input = [];
    }

    if ($action === 'recibir') {
        $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
        if ($id <= 0) {
            json_out(['ok' => false, 'error' => 'ID requerido'], 400);
        }
        json_out(recibir($pdo, $id));
    }

    if ($action === 'update') {
        $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
        if ($id <= 0) {
            json_out(['ok' => false, 'error' => 'ID requerido'], 400);
        }
        json_out(actualizar($pdo, $id, $input));
    }

    json_out(crear($pdo, $input));
}

json_out(['ok' => false, 'error' => 'Método no permitido'], 405);
