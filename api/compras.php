<?php
/**
 * API Compras — LATAS_BOYACA
 *
 * GET  ?catalog=1           → importadores + productos
 * GET                       → listar compras (total = SUM(valorTotal))
 * GET  ?id=N                → detalle compra + líneas
 * POST                      → crear (JSON: idImportador, fecha?, detalles[]) — actualiza inventario inmediatamente
 * POST ?action=update&id=N  → editar — ajusta inventario según diff de cantidades
 * POST ?action=delete&id=N  → eliminar compra — revierte inventario + registro CompraAnulada
 */
declare(strict_types=1);

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Strict']);
    session_start();
}

require_once dirname(__DIR__) . '/config/database.php';
require_once __DIR__ . '/schema_compra_anulada.php';
require_once __DIR__ . '/lib.php';

header('Content-Type: application/json; charset=utf-8');

function json_out(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function asegurarCodigoImportadorCompras(PDO $pdo): void
{
    $st = $pdo->query("SHOW COLUMNS FROM Importador LIKE 'codigo'");
    if ($st->fetch()) {
        return;
    }
    $pdo->exec("ALTER TABLE Importador ADD COLUMN codigo VARCHAR(50) NULL AFTER idImportador");
    $pdo->exec("UPDATE Importador SET codigo = CAST(idImportador AS CHAR) WHERE codigo IS NULL OR codigo = ''");
    $pdo->exec('ALTER TABLE Importador MODIFY codigo VARCHAR(50) NOT NULL');
    $pdo->exec('ALTER TABLE Importador ADD UNIQUE KEY uq_importador_codigo (codigo)');
}

function catalogo(PDO $pdo): array
{
    asegurarCodigoImportadorCompras($pdo);
    $imp = $pdo->query(
        'SELECT idImportador, codigo, nombre, telefono, correo FROM Importador ORDER BY nombre'
    )->fetchAll();
    $prod = $pdo->query(
        'SELECT idProducto, codigoOEM, nombre, marca, precioInicial, estado FROM Producto ORDER BY nombre'
    )->fetchAll();
    return ['ok' => true, 'importadores' => $imp, 'productos' => $prod];
}

function listar(PDO $pdo, ?int $filtroImportador, ?string $busqueda): array
{
    $sql = 'SELECT DISTINCT c.idCompra, i.nombre AS nombreImportador, c.fecha, c.idImportador,
            COALESCE((SELECT SUM(dc.valorTotal) FROM DetalleCompra dc WHERE dc.idCompra = c.idCompra), 0) AS total
            FROM Compra c
            INNER JOIN Importador i ON i.idImportador = c.idImportador';

    $where = [];
    $params = [];

    if ($filtroImportador !== null && $filtroImportador > 0) {
        $where[] = 'c.idImportador = ?';
        $params[] = $filtroImportador;
    }

    $busqueda = $busqueda !== null ? trim($busqueda) : '';
    if ($busqueda !== '') {
        $parts = [];
        if (ctype_digit($busqueda)) {
            $nid = (int) $busqueda;
            $parts[] = '(c.idCompra = ? OR EXISTS (SELECT 1 FROM DetalleCompra d WHERE d.idCompra = c.idCompra AND d.idProducto = ?))';
            $params[] = $nid;
            $params[] = $nid;
        }
        $esc = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $busqueda);
        $like = '%' . $esc . '%';
        $parts[] = 'EXISTS (
            SELECT 1 FROM DetalleCompra d
            INNER JOIN Producto p ON p.idProducto = d.idProducto
            WHERE d.idCompra = c.idCompra AND LOWER(p.nombre) LIKE LOWER(?)
        )';
        $params[] = $like;
        $where[] = '(' . implode(' OR ', $parts) . ')';
    }

    if ($where !== []) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }
    $sql .= ' ORDER BY c.idCompra DESC';

    $st = $pdo->prepare($sql);
    $st->execute($params);
    $rows = $st->fetchAll();

    return ['ok' => true, 'compras' => $rows];
}

function detalle(PDO $pdo, int $idCompra): array
{
    $st = $pdo->prepare(
        'SELECT c.idCompra, c.idImportador, c.fecha, i.nombre AS nombreImportador,
                c.creado_por, uc.nombre AS creado_por_nombre,
                c.modificado_por, um.nombre AS modificado_por_nombre,
                c.modificado_en
         FROM Compra c
         INNER JOIN Importador i ON i.idImportador = c.idImportador
         LEFT JOIN lb_usuario uc ON uc.id = c.creado_por
         LEFT JOIN lb_usuario um ON um.id = c.modificado_por
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

/**
 * Suma cantidades por idProducto (varias líneas del mismo producto se agregan).
 *
 * @param array<int, array{idProducto: int|string, cantidad: int|string}> $lineas
 * @return array<int, int>
 */
function sumarCantidadesPorProducto(array $lineas): array
{
    $m = [];
    foreach ($lineas as $d) {
        $pid = (int) $d['idProducto'];
        $q = (int) $d['cantidad'];
        $m[$pid] = ($m[$pid] ?? 0) + $q;
    }
    return $m;
}

/**
 * Aplica diferencias de stock tras editar una compra ya recibida.
 * Stock efectivo = SUM(entrada - salida) por producto.
 *
 * @param array<int, int> $deltas idProducto => (cantidad nueva - cantidad anterior)
 */
/**
 * Registra salidas de inventario por las cantidades indicadas, sin validar stock disponible.
 * Solo para eliminación de compra recibida (anulación de entrada contable).
 *
 * @param array<int, int> $cantidadPorProducto idProducto => unidades a restar
 */
function registrarSalidasInventarioCompraForzado(PDO $pdo, array $cantidadPorProducto): void
{
    $insSalida = $pdo->prepare(
        'INSERT INTO Inventario (fechaActualizacion, cantidad, idProducto, entrada, salida)
         VALUES (NOW(), ?, ?, 0, ?)'
    );
    foreach ($cantidadPorProducto as $pid => $q) {
        $pid = (int) $pid;
        $q = (int) $q;
        if ($q <= 0) {
            continue;
        }
        $insSalida->execute([$q, $pid, $q]);
    }
}

/**
 * @param array<int, array<string, mixed>> $detalleFilas
 */
function registrarCompraAnulada(
    PDO $pdo,
    int $idCompra,
    ?string $fechaCompra,
    ?int $idImportador,
    string $nombreImportador,
    string $estado,
    float $total,
    array $detalleFilas
): void {
    $ins = $pdo->prepare(
        'INSERT INTO CompraAnulada (idCompra, anulado_en, fecha_compra, idImportador, nombre_importador, estado, total, detalle_json)
         VALUES (?, NOW(), ?, ?, ?, ?, ?, ?)'
    );
    $fecha = $fechaCompra !== null && $fechaCompra !== '' ? substr($fechaCompra, 0, 10) : null;
    $ins->execute([
        $idCompra,
        $fecha,
        $idImportador,
        $nombreImportador !== '' ? $nombreImportador : null,
        $estado,
        round($total, 2),
        json_encode($detalleFilas, JSON_UNESCAPED_UNICODE) ?: '[]',
    ]);
}

function aplicarAjusteInventarioCompra(PDO $pdo, array $deltas): ?string
{
    $stStock = $pdo->prepare('SELECT COALESCE(SUM(entrada - salida), 0) FROM Inventario WHERE idProducto = ?');
    foreach ($deltas as $pid => $delta) {
        $delta = (int) $delta;
        if ($delta >= 0) {
            continue;
        }
        $quitar = -$delta;
        $stStock->execute([(int) $pid]);
        $stock = (int) $stStock->fetchColumn();
        if ($stock < $quitar) {
            return 'No se puede actualizar: stock insuficiente para ajustar el producto (ID ' . (int) $pid . '). Hay '
                . $stock . ' unidades y la compra quitaba ' . $quitar . '.';
        }
    }

    $insEntrada = $pdo->prepare(
        'INSERT INTO Inventario (fechaActualizacion, cantidad, idProducto, entrada, salida)
         VALUES (NOW(), ?, ?, ?, 0)'
    );
    $insSalida = $pdo->prepare(
        'INSERT INTO Inventario (fechaActualizacion, cantidad, idProducto, entrada, salida)
         VALUES (NOW(), ?, ?, 0, ?)'
    );
    foreach ($deltas as $pid => $delta) {
        $pid = (int) $pid;
        $delta = (int) $delta;
        if ($delta === 0) {
            continue;
        }
        if ($delta > 0) {
            $insEntrada->execute([$delta, $pid, $delta]);
        } else {
            $s = -$delta;
            $insSalida->execute([$s, $pid, $s]);
        }
    }

    return null;
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
        $uid = isset($_SESSION['lb_uid']) ? (int) $_SESSION['lb_uid'] : null;
        $st = $pdo->prepare('INSERT INTO Compra (idImportador, fecha, estado, creado_por) VALUES (?, ?, ?, ?)');
        $st->execute([$idImp, $fecha, 'recibida', $uid]);
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
    $idImp = isset($in['idImportador']) ? (int) $in['idImportador'] : 0;
    $fecha = isset($in['fecha']) ? (string) $in['fecha'] : date('Y-m-d');
    $detalles = isset($in['detalles']) && is_array($in['detalles']) ? $in['detalles'] : [];

    if ($idImp <= 0) {
        return ['ok' => false, 'error' => 'Seleccione un importador.'];
    }
    $err = validarDetalles($detalles);
    if ($err) {
        return ['ok' => false, 'error' => $err];
    }

    $pdo->beginTransaction();
    try {
        $st = $pdo->prepare('SELECT estado FROM Compra WHERE idCompra = ? FOR UPDATE');
        $st->execute([$idCompra]);
        $row = $st->fetch();
        if (!$row) {
            $pdo->rollBack();
            return ['ok' => false, 'error' => 'Compra no encontrada'];
        }

        $stOld = $pdo->prepare('SELECT idProducto, cantidad FROM DetalleCompra WHERE idCompra = ?');
        $stOld->execute([$idCompra]);
        $lineasViejas = $stOld->fetchAll();

        $oldMap = (string) $row['estado'] === 'recibida'
            ? sumarCantidadesPorProducto($lineasViejas)
            : [];
        $newMap = sumarCantidadesPorProducto($detalles);
        $allPids = array_unique(array_merge(array_keys($oldMap), array_keys($newMap)));
        $deltas = [];
        foreach ($allPids as $pid) {
            $deltas[$pid] = ($newMap[$pid] ?? 0) - ($oldMap[$pid] ?? 0);
        }
        $invErr = aplicarAjusteInventarioCompra($pdo, $deltas);
        if ($invErr !== null) {
            $pdo->rollBack();
            return ['ok' => false, 'error' => $invErr];
        }

        $uid = isset($_SESSION['lb_uid']) ? (int) $_SESSION['lb_uid'] : null;
        $up = $pdo->prepare('UPDATE Compra SET idImportador = ?, fecha = ?, estado = ?, modificado_por = ?, modificado_en = NOW() WHERE idCompra = ?');
        $up->execute([$idImp, $fecha, 'recibida', $uid, $idCompra]);
        $pdo->prepare('DELETE FROM DetalleCompra WHERE idCompra = ?')->execute([$idCompra]);
        insertarDetalles($pdo, $idCompra, $detalles);
        $pdo->commit();
        return ['ok' => true, 'idCompra' => $idCompra];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        return ['ok' => false, 'error' => $e->getMessage()];
    }
}

function eliminar(PDO $pdo, int $idCompra): array
{
    if ($idCompra <= 0) {
        return ['ok' => false, 'error' => 'ID inválido.'];
    }

    lb_ensure_compra_anulada($pdo);
    $pdo->beginTransaction();
    try {
        $st = $pdo->prepare(
            'SELECT c.estado, c.fecha, c.idImportador, COALESCE(i.nombre, \'\') AS nombreImportador,
                    COALESCE((SELECT SUM(dc.valorTotal) FROM DetalleCompra dc WHERE dc.idCompra = c.idCompra), 0) AS total
             FROM Compra c
             LEFT JOIN Importador i ON i.idImportador = c.idImportador
             WHERE c.idCompra = ? FOR UPDATE'
        );
        $st->execute([$idCompra]);
        $row = $st->fetch();
        if (!$row) {
            $pdo->rollBack();
            return ['ok' => false, 'error' => 'Compra no encontrada.'];
        }

        $stDetJson = $pdo->prepare(
            'SELECT d.idProducto, d.cantidad, d.precioCompra, d.valorTotal, p.nombre AS nombreProducto
             FROM DetalleCompra d
             INNER JOIN Producto p ON p.idProducto = d.idProducto
             WHERE d.idCompra = ?
             ORDER BY d.idDetalle'
        );
        $stDetJson->execute([$idCompra]);
        $detalleFilas = $stDetJson->fetchAll();

        $stD = $pdo->prepare('SELECT idProducto, cantidad FROM DetalleCompra WHERE idCompra = ?');
        $stD->execute([$idCompra]);
        $lineas = $stD->fetchAll();
        $map = sumarCantidadesPorProducto($lineas);
        if ($map !== [] && (string) $row['estado'] === 'recibida') {
            $stStock = $pdo->prepare('SELECT COALESCE(SUM(entrada - salida), 0) FROM Inventario WHERE idProducto = ?');
            foreach ($map as $pid => $q) {
                $stStock->execute([(int) $pid]);
                $stockActual = (int) $stStock->fetchColumn();
                if ($stockActual < (int) $q) {
                    $pdo->rollBack();
                    return ['ok' => false, 'error' => "No se puede eliminar: el producto ID {$pid} tiene {$stockActual} unidades disponibles pero la compra aportó {$q}. Eliminar dejaría el inventario en negativo."];
                }
            }
            registrarSalidasInventarioCompraForzado($pdo, $map);
        }

        $total = (float) ($row['total'] ?? 0);
        $idImp = isset($row['idImportador']) ? (int) $row['idImportador'] : null;
        if ($idImp === 0) {
            $idImp = null;
        }
        registrarCompraAnulada(
            $pdo,
            $idCompra,
            isset($row['fecha']) ? (string) $row['fecha'] : null,
            $idImp,
            (string) ($row['nombreImportador'] ?? ''),
            'recibida',
            $total,
            $detalleFilas
        );

        $pdo->prepare('DELETE FROM DetalleCompra WHERE idCompra = ?')->execute([$idCompra]);
        $del = $pdo->prepare('DELETE FROM Compra WHERE idCompra = ?');
        $del->execute([$idCompra]);
        if ($del->rowCount() === 0) {
            $pdo->rollBack();
            return ['ok' => false, 'error' => 'No se pudo eliminar la compra.'];
        }
        $pdo->commit();
        return ['ok' => true];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        return ['ok' => false, 'error' => $e->getMessage()];
    }
}

// ——— Enrutado ———
$pdo = lb_pdo();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
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
        $impFiltro = isset($_GET['proveedor']) ? (int) $_GET['proveedor'] : 0;
        $busqueda = isset($_GET['q']) ? trim((string) $_GET['q']) : '';
        json_out(listar($pdo, $impFiltro > 0 ? $impFiltro : null, $busqueda !== '' ? $busqueda : null));
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
    lb_json_sql_error($e, 'Error en compras:');
}
