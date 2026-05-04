<?php
/**
 * API Ventas — `ventas`, `detalle_venta`, `tipo_pago`
 *
 * GET ?catalog=1     → tipos_pago + productos (precioInicial = precio de catálogo)
 * GET ?stats=1       → estadísticas agregadas
 * GET ?id=N          → cabecera + líneas con nombre de producto
 * GET                → listado con tipo de pago y cantidad de líneas
 * POST               → crear (JSON: id_tipo_pago, fecha?, detalles[{idProducto,cantidad,precio}])
 * POST ?action=update&id=N
 * POST ?action=delete&id=N
 */
declare(strict_types=1);

require_once __DIR__ . '/lib.php';

function json_out(array $data, int $code = 200): void
{
    lb_json($data, $code);
}

function catalogo(PDO $pdo): array
{
    $tipos = $pdo->query('SELECT id_tipo_pago, nombre FROM tipo_pago ORDER BY nombre')->fetchAll();
    $prod = $pdo->query(
        'SELECT idProducto, nombre, marca, precioInicial FROM Producto ORDER BY nombre'
    )->fetchAll();
    return ['ok' => true, 'tipos_pago' => $tipos, 'productos' => $prod];
}

function listar(PDO $pdo): array
{
    $sql = 'SELECT v.id_venta, v.fecha, v.total, v.id_tipo_pago, tp.nombre AS nombre_tipo_pago,
            (SELECT COUNT(*) FROM detalle_venta d WHERE d.id_venta = v.id_venta) AS num_lineas
            FROM ventas v
            INNER JOIN tipo_pago tp ON tp.id_tipo_pago = v.id_tipo_pago
            ORDER BY v.fecha DESC, v.id_venta DESC';
    $rows = $pdo->query($sql)->fetchAll();
    return ['ok' => true, 'ventas' => $rows];
}

function detalleLineas(PDO $pdo, int $idVenta): array
{
    $st = $pdo->prepare(
        'SELECT d.id_detalle, d.idProducto, d.cantidad, d.precio,
                p.nombre AS nombreProducto, p.precioInicial AS precioCatalogo
         FROM detalle_venta d
         INNER JOIN Producto p ON p.idProducto = d.idProducto
         WHERE d.id_venta = ?
         ORDER BY d.id_detalle'
    );
    $st->execute([$idVenta]);
    return $st->fetchAll();
}

function una(PDO $pdo, int $id): array
{
    $st = $pdo->prepare(
        'SELECT v.id_venta, v.fecha, v.total, v.id_tipo_pago, tp.nombre AS nombre_tipo_pago
         FROM ventas v
         INNER JOIN tipo_pago tp ON tp.id_tipo_pago = v.id_tipo_pago
         WHERE v.id_venta = ?'
    );
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) {
        return ['ok' => false, 'error' => 'Venta no encontrada'];
    }
    $lineas = detalleLineas($pdo, $id);
    return ['ok' => true, 'venta' => $row, 'detalles' => $lineas];
}

function estadisticas(PDO $pdo): array
{
    $hoy = (float) $pdo->query(
        'SELECT COALESCE(SUM(total), 0) FROM ventas WHERE DATE(fecha) = CURDATE()'
    )->fetchColumn();

    $semana = (float) $pdo->query(
        'SELECT COALESCE(SUM(total), 0) FROM ventas
         WHERE DATE(fecha) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)'
    )->fetchColumn();

    $stMes = $pdo->query(
        'SELECT COALESCE(AVG(total), 0) FROM ventas
         WHERE YEAR(fecha) = YEAR(CURDATE()) AND MONTH(fecha) = MONTH(CURDATE())'
    );
    $ticketMes = (float) $stMes->fetchColumn();

    return [
        'ok' => true,
        'stats' => [
            'totalHoy' => $hoy,
            'totalSemana' => $semana,
            'ticketPromedioMes' => $ticketMes,
        ],
    ];
}

function validarDetalles(array $detalles): ?string
{
    if (count($detalles) < 1) {
        return 'Agregue al menos un producto a la venta.';
    }
    foreach ($detalles as $d) {
        $pid = isset($d['idProducto']) ? (int) $d['idProducto'] : 0;
        $cant = isset($d['cantidad']) ? (int) $d['cantidad'] : 0;
        $precio = isset($d['precio']) ? (float) $d['precio'] : -1;
        if ($pid <= 0) {
            return 'Hay un producto inválido en las líneas.';
        }
        if ($cant <= 0) {
            return 'Cada línea debe tener cantidad mayor a 0.';
        }
        if ($precio < 0) {
            return 'El precio de venta no puede ser negativo.';
        }
    }
    return null;
}

function sumarTotalLineas(array $detalles): float
{
    $t = 0.0;
    foreach ($detalles as $d) {
        $t += (int) $d['cantidad'] * (float) $d['precio'];
    }
    return round($t, 2);
}

function verificarProductos(PDO $pdo, array $detalles): ?string
{
    $ids = [];
    foreach ($detalles as $d) {
        $ids[(int) $d['idProducto']] = true;
    }
    $list = array_keys($ids);
    if ($list === []) {
        return 'No hay productos.';
    }
    $ph = implode(',', array_fill(0, count($list), '?'));
    $st = $pdo->prepare("SELECT COUNT(*) FROM Producto WHERE idProducto IN ($ph)");
    $st->execute($list);
    if ((int) $st->fetchColumn() !== count($list)) {
        return 'Uno o más productos no existen en el catálogo.';
    }
    return null;
}

function tipoPagoExiste(PDO $pdo, int $id): bool
{
    $st = $pdo->prepare('SELECT 1 FROM tipo_pago WHERE id_tipo_pago = ?');
    $st->execute([$id]);
    return (bool) $st->fetch();
}

function insertarLineas(PDO $pdo, int $idVenta, array $detalles): void
{
    $ins = $pdo->prepare(
        'INSERT INTO detalle_venta (id_venta, idProducto, cantidad, precio) VALUES (?, ?, ?, ?)'
    );
    foreach ($detalles as $d) {
        $ins->execute([
            $idVenta,
            (int) $d['idProducto'],
            (int) $d['cantidad'],
            round((float) $d['precio'], 2),
        ]);
    }
}

function crear(PDO $pdo, array $in): array
{
    $idTipo = isset($in['id_tipo_pago']) ? (int) $in['id_tipo_pago'] : 0;
    if ($idTipo <= 0) {
        return ['ok' => false, 'error' => 'Seleccione un tipo de pago.'];
    }
    if (!tipoPagoExiste($pdo, $idTipo)) {
        return ['ok' => false, 'error' => 'El tipo de pago no existe.'];
    }
    $detalles = $in['detalles'] ?? [];
    if (!is_array($detalles)) {
        $detalles = [];
    }
    $err = validarDetalles($detalles);
    if ($err !== null) {
        return ['ok' => false, 'error' => $err];
    }
    $errP = verificarProductos($pdo, $detalles);
    if ($errP !== null) {
        return ['ok' => false, 'error' => $errP];
    }
    $total = sumarTotalLineas($detalles);
    if ($total <= 0) {
        return ['ok' => false, 'error' => 'El total de la venta debe ser mayor a 0.'];
    }

    try {
        $pdo->beginTransaction();
        if (!empty($in['fecha'])) {
            $st = $pdo->prepare('INSERT INTO ventas (fecha, total, id_tipo_pago) VALUES (?, ?, ?)');
            $st->execute([(string) $in['fecha'], $total, $idTipo]);
        } else {
            $st = $pdo->prepare('INSERT INTO ventas (total, id_tipo_pago) VALUES (?, ?)');
            $st->execute([$total, $idTipo]);
        }
        $idVenta = (int) $pdo->lastInsertId();
        insertarLineas($pdo, $idVenta, $detalles);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        return ['ok' => false, 'error' => 'No se pudo guardar la venta: ' . $e->getMessage()];
    }
    return ['ok' => true, 'id_venta' => $idVenta, 'mensaje' => 'Venta registrada.'];
}

function actualizar(PDO $pdo, int $id, array $in): array
{
    $st = $pdo->prepare('SELECT id_venta FROM ventas WHERE id_venta = ?');
    $st->execute([$id]);
    if (!$st->fetch()) {
        return ['ok' => false, 'error' => 'Venta no encontrada'];
    }
    $idTipo = isset($in['id_tipo_pago']) ? (int) $in['id_tipo_pago'] : 0;
    if ($idTipo <= 0) {
        return ['ok' => false, 'error' => 'Seleccione un tipo de pago.'];
    }
    if (!tipoPagoExiste($pdo, $idTipo)) {
        return ['ok' => false, 'error' => 'El tipo de pago no existe.'];
    }
    if (empty($in['fecha'])) {
        return ['ok' => false, 'error' => 'La fecha es obligatoria al editar.'];
    }
    $detalles = $in['detalles'] ?? [];
    if (!is_array($detalles)) {
        $detalles = [];
    }
    $err = validarDetalles($detalles);
    if ($err !== null) {
        return ['ok' => false, 'error' => $err];
    }
    $errP = verificarProductos($pdo, $detalles);
    if ($errP !== null) {
        return ['ok' => false, 'error' => $errP];
    }
    $total = sumarTotalLineas($detalles);
    if ($total <= 0) {
        return ['ok' => false, 'error' => 'El total de la venta debe ser mayor a 0.'];
    }

    try {
        $pdo->beginTransaction();
        $pdo->prepare('DELETE FROM detalle_venta WHERE id_venta = ?')->execute([$id]);
        $up = $pdo->prepare('UPDATE ventas SET fecha = ?, total = ?, id_tipo_pago = ? WHERE id_venta = ?');
        $up->execute([(string) $in['fecha'], $total, $idTipo, $id]);
        insertarLineas($pdo, $id, $detalles);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        return ['ok' => false, 'error' => 'No se pudo actualizar la venta: ' . $e->getMessage()];
    }
    return ['ok' => true, 'mensaje' => 'Venta actualizada.'];
}

function eliminar(PDO $pdo, int $id): array
{
    try {
        $pdo->beginTransaction();
        $pdo->prepare('DELETE FROM detalle_venta WHERE id_venta = ?')->execute([$id]);
        $st = $pdo->prepare('DELETE FROM ventas WHERE id_venta = ?');
        $st->execute([$id]);
        if ($st->rowCount() === 0) {
            $pdo->rollBack();
            return ['ok' => false, 'error' => 'Venta no encontrada'];
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        return ['ok' => false, 'error' => 'No se pudo eliminar: ' . $e->getMessage()];
    }
    return ['ok' => true, 'mensaje' => 'Venta eliminada.'];
}

try {
    $pdo = lb_pdo();
} catch (Throwable $e) {
    json_out(['ok' => false, 'error' => 'Error de conexión a la base de datos: ' . $e->getMessage()], 500);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    if (isset($_GET['catalog']) && $_GET['catalog'] === '1') {
        json_out(catalogo($pdo));
    }
    if (isset($_GET['stats']) && $_GET['stats'] === '1') {
        json_out(estadisticas($pdo));
    }
    if (isset($_GET['id'])) {
        $id = (int) $_GET['id'];
        if ($id <= 0) {
            json_out(['ok' => false, 'error' => 'ID inválido'], 400);
        }
        json_out(una($pdo, $id));
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

    if ($action === 'delete') {
        $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
        if ($id <= 0) {
            json_out(['ok' => false, 'error' => 'ID requerido'], 400);
        }
        json_out(eliminar($pdo, $id));
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
