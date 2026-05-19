<?php
/**
 * API Ventas — `ventas`, `detalle_venta`, `tipo_pago`
 *
 * GET ?catalog=1     → tipos_pago + productos (precioInicial = precio de catálogo)
 * GET ?stats=1       → estadísticas agregadas
 * GET ?id=N          → cabecera + líneas con nombre de producto
 * GET                → listado (opcional: ?q=id_venta solo dígitos, ?fecha=YYYY-MM-DD)
 * POST               → crear (JSON: id_tipo_pago, fecha?, detalles[{idProducto,cantidad,precio}]) + salidas Inventario
 * POST ?action=update&id=N  → ajusta inventario (revierte líneas anteriores y aplica nuevas)
 * POST ?action=delete&id=N  → revierte inventario y borra venta
 */
declare(strict_types=1);

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Strict']);
    session_start();
}

require_once __DIR__ . '/lib.php';

function json_out(array $data, int $code = 200): void
{
    lb_json($data, $code);
}

function catalogo(PDO $pdo): array
{
    $tipos = $pdo->query('SELECT id_tipo_pago, nombre FROM tipo_pago ORDER BY nombre')->fetchAll();
    $prod = $pdo->query(
        'SELECT
            p.idProducto,
            p.codigoOEM,
            p.nombre,
            p.marca,
            p.precioInicial,
            COALESCE(SUM(i.entrada - i.salida), 0) AS stock
         FROM Producto p
         LEFT JOIN Inventario i ON i.idProducto = p.idProducto
         GROUP BY p.idProducto, p.codigoOEM, p.nombre, p.marca, p.precioInicial
         ORDER BY p.nombre'
    )->fetchAll();
    return ['ok' => true, 'tipos_pago' => $tipos, 'productos' => $prod];
}

function listar(PDO $pdo, string $qId, string $fecha): array
{
    $sql = 'SELECT v.id_venta, v.fecha, v.total, v.id_tipo_pago, tp.nombre AS nombre_tipo_pago,
            (SELECT COUNT(*) FROM detalle_venta d WHERE d.id_venta = v.id_venta) AS num_lineas
            FROM ventas v
            INNER JOIN tipo_pago tp ON tp.id_tipo_pago = v.id_tipo_pago';

    $where = [];
    $params = [];

    $qId = trim($qId);
    if ($qId !== '' && ctype_digit($qId)) {
        $where[] = 'v.id_venta = ?';
        $params[] = (int) $qId;
    }

    $fecha = trim($fecha);
    if ($fecha !== '') {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
            return ['ok' => false, 'error' => 'Fecha inválida. Use el formato AAAA-MM-DD.'];
        }
        $where[] = 'DATE(v.fecha) = ?';
        $params[] = $fecha;
    }

    if ($where !== []) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }
    $sql .= ' ORDER BY v.fecha DESC, v.id_venta DESC';

    $st = $pdo->prepare($sql);
    $st->execute($params);
    $rows = $st->fetchAll();

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
        'SELECT v.id_venta, v.fecha, v.total, v.id_tipo_pago, tp.nombre AS nombre_tipo_pago,
                v.creado_por, uc.nombre AS creado_por_nombre,
                v.modificado_por, um.nombre AS modificado_por_nombre,
                v.modificado_en
         FROM ventas v
         INNER JOIN tipo_pago tp ON tp.id_tipo_pago = v.id_tipo_pago
         LEFT JOIN lb_usuario uc ON uc.id = v.creado_por
         LEFT JOIN lb_usuario um ON um.id = v.modificado_por
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

/** Suma cantidades por idProducto (líneas de venta). */
function sumarCantidadesPorProductoVenta(array $detalles): array
{
    $map = [];
    foreach ($detalles as $d) {
        $pid = (int) $d['idProducto'];
        $q = (int) $d['cantidad'];
        if ($pid <= 0 || $q <= 0) {
            continue;
        }
        $map[$pid] = ($map[$pid] ?? 0) + $q;
    }
    return $map;
}

/** Stock actual según movimientos Inventario. */
function stockProducto(PDO $pdo, int $idProducto): int
{
    $st = $pdo->prepare('SELECT COALESCE(SUM(entrada - salida), 0) FROM Inventario WHERE idProducto = ?');
    $st->execute([$idProducto]);

    return (int) $st->fetchColumn();
}

/** null si hay stock suficiente para todas las cantidades solicitadas. */
function validarStockParaVenta(PDO $pdo, array $detalles): ?string
{
    $map = sumarCantidadesPorProductoVenta($detalles);
    foreach ($map as $pid => $necesita) {
        $stock = stockProducto($pdo, $pid);
        if ($stock < $necesita) {
            return 'Stock insuficiente para el producto (ID ' . $pid . '). Disponible: ' . $stock . ', solicitado: ' . $necesita . '.';
        }
    }

    return null;
}

/** Registra salidas de inventario por una venta (misma forma que compras al ajustar hacia abajo). */
function registrarSalidasInventarioVenta(PDO $pdo, array $detalles): void
{
    $ins = $pdo->prepare(
        'INSERT INTO Inventario (fechaActualizacion, cantidad, idProducto, entrada, salida)
         VALUES (NOW(), ?, ?, 0, ?)'
    );
    foreach (sumarCantidadesPorProductoVenta($detalles) as $pid => $cant) {
        if ($cant <= 0) {
            continue;
        }
        $ins->execute([$cant, $pid, $cant]);
    }
}

/**
 * Devuelve al inventario las unidades de líneas de detalle (idProducto, cantidad).
 * @param array<int, array{idProducto:int|string,cantidad:int|string}> $lineas
 */
function registrarEntradasReversionVenta(PDO $pdo, array $lineas): void
{
    $ins = $pdo->prepare(
        'INSERT INTO Inventario (fechaActualizacion, cantidad, idProducto, entrada, salida)
         VALUES (NOW(), ?, ?, ?, 0)'
    );
    foreach ($lineas as $ln) {
        $pid = (int) $ln['idProducto'];
        $cant = (int) $ln['cantidad'];
        if ($pid <= 0 || $cant <= 0) {
            continue;
        }
        $ins->execute([$cant, $pid, $cant]);
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
        $invErr = validarStockParaVenta($pdo, $detalles);
        if ($invErr !== null) {
            $pdo->rollBack();
            return ['ok' => false, 'error' => $invErr];
        }
        $uid = isset($_SESSION['lb_uid']) ? (int) $_SESSION['lb_uid'] : null;
        if (!empty($in['fecha'])) {
            $st = $pdo->prepare('INSERT INTO ventas (fecha, total, id_tipo_pago, creado_por) VALUES (?, ?, ?, ?)');
            $st->execute([(string) $in['fecha'], $total, $idTipo, $uid]);
        } else {
            $st = $pdo->prepare('INSERT INTO ventas (total, id_tipo_pago, creado_por) VALUES (?, ?, ?)');
            $st->execute([$total, $idTipo, $uid]);
        }
        $idVenta = (int) $pdo->lastInsertId();
        insertarLineas($pdo, $idVenta, $detalles);
        registrarSalidasInventarioVenta($pdo, $detalles);
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
        $lineasAnteriores = detalleLineas($pdo, $id);
        registrarEntradasReversionVenta($pdo, $lineasAnteriores);
        $invErr = validarStockParaVenta($pdo, $detalles);
        if ($invErr !== null) {
            $pdo->rollBack();
            return ['ok' => false, 'error' => $invErr];
        }
        $pdo->prepare('DELETE FROM detalle_venta WHERE id_venta = ?')->execute([$id]);
        $uid = isset($_SESSION['lb_uid']) ? (int) $_SESSION['lb_uid'] : null;
        $up = $pdo->prepare('UPDATE ventas SET fecha = ?, total = ?, id_tipo_pago = ?, modificado_por = ?, modificado_en = NOW() WHERE id_venta = ?');
        $up->execute([(string) $in['fecha'], $total, $idTipo, $uid, $id]);
        insertarLineas($pdo, $id, $detalles);
        registrarSalidasInventarioVenta($pdo, $detalles);
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
        $lineas = detalleLineas($pdo, $id);
        if ($lineas === []) {
            $chk = $pdo->prepare('SELECT 1 FROM ventas WHERE id_venta = ?');
            $chk->execute([$id]);
            if (!$chk->fetch()) {
                $pdo->rollBack();
                return ['ok' => false, 'error' => 'Venta no encontrada'];
            }
        }
        registrarEntradasReversionVenta($pdo, $lineas);
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

$pdo = lb_pdo();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
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
        $qId = isset($_GET['q']) ? trim((string) $_GET['q']) : '';
        $fecha = isset($_GET['fecha']) ? trim((string) $_GET['fecha']) : '';
        json_out(listar($pdo, $qId, $fecha));
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
} catch (Throwable $e) {
    lb_json_sql_error($e, 'Error en ventas:');
}
