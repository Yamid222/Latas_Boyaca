<?php
/**
 * Reportes — múltiples tipos vía ?tipo=
 *
 * GET ?tipo=dashboard   → estadísticas globales + series mensuales 12 meses
 * GET ?tipo=resumen     → resumen mensual (defecto). Acepta &mes=AAAA-MM
 * GET ?tipo=inventario  → stock actual por producto + últimos movimientos
 * GET ?tipo=compras     → historial por rango &desde=&hasta= + por proveedor
 * GET ?tipo=ventas      → historial por rango &desde=&hasta= + por tipo pago
 * GET ?tipo=productos   → top vendidos, sin ventas, por categoría
 */
declare(strict_types=1);

require_once __DIR__ . '/lib.php';
require_once __DIR__ . '/schema_compra_anulada.php';

$pdo  = lb_pdo();
$tipo = isset($_GET['tipo']) ? trim((string) $_GET['tipo']) : 'resumen';

try {
    switch ($tipo) {
        case 'dashboard':         reporte_dashboard($pdo);         break;
        case 'inventario':        reporte_inventario($pdo);        break;
        case 'compras':           reporte_compras($pdo);           break;
        case 'ventas':            reporte_ventas($pdo);            break;
        case 'productos':         reporte_productos($pdo);         break;
        case 'top_productos':     reporte_top_productos($pdo);     break;
        case 'compras_anuladas':  reporte_compras_anuladas($pdo);  break;
        default:                  reporte_resumen($pdo);           break;
    }
} catch (Throwable $e) {
    lb_json_sql_error($e, 'Error en reportes:');
}

/* ──────────────────────────── Helpers ──────────────────── */

function validarRango(): array
{
    $desde = isset($_GET['desde']) ? trim((string) $_GET['desde']) : date('Y-m-01');
    $hasta = isset($_GET['hasta']) ? trim((string) $_GET['hasta']) : date('Y-m-d');
    foreach ([$desde, $hasta] as $f) {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $f)) {
            lb_json(['ok' => false, 'error' => 'Fecha inválida. Use YYYY-MM-DD.'], 400);
        }
    }
    return [$desde, $hasta];
}

/** Rellena meses faltantes con total=0/cantidad=0 para los últimos $n meses. */
function rellenarSeries(array $rows, int $n = 12): array
{
    $map = [];
    foreach ($rows as $r) {
        $map[$r['mes']] = ['total' => (float) $r['total'], 'cantidad' => (int) $r['cantidad']];
    }
    $serie = [];
    for ($i = $n - 1; $i >= 0; $i--) {
        $key = date('Y-m', strtotime("-{$i} months"));
        $serie[] = [
            'mes'      => $key,
            'total'    => $map[$key]['total']    ?? 0.0,
            'cantidad' => $map[$key]['cantidad'] ?? 0,
        ];
    }
    return $serie;
}

/* ──────────────────────────── Dashboard ────────────────── */

function reporte_dashboard(PDO $pdo): void
{
    $anio     = (int) date('Y');
    $inicio12 = date('Y-m-01', strtotime('-11 months'));
    $iniMes   = date('Y-m-01');
    $hoy      = date('Y-m-d');
    $iniAnt   = date('Y-m-01', strtotime('-1 month'));
    $finAnt   = date('Y-m-t', strtotime('-1 month'));

    // Umbral bajo stock desde settings
    $settingsFile = dirname(__DIR__) . '/data/lb_settings.json';
    $umbral = 10;
    if (is_readable($settingsFile)) {
        $json = json_decode((string) file_get_contents($settingsFile), true);
        if (isset($json['umbralStockBajo']) && is_numeric($json['umbralStockBajo'])) {
            $umbral = max(0, (int) $json['umbralStockBajo']);
        }
    }

    $totalProductos   = (int) $pdo->query('SELECT COUNT(*) FROM Producto')->fetchColumn();
    $stockTotal       = (int) $pdo->query('SELECT COALESCE(SUM(entrada - salida), 0) FROM Inventario')->fetchColumn();
    $totalProveedores = (int) $pdo->query('SELECT COUNT(*) FROM Importador')->fetchColumn();

    $totalCategorias = 0;
    try {
        $totalCategorias = (int) $pdo->query('SELECT COUNT(*) FROM Categoria')->fetchColumn();
    } catch (Throwable) {}

    // Ventas año completo
    $stVA = $pdo->prepare('SELECT COUNT(*) AS cant, COALESCE(SUM(total), 0) AS tot FROM ventas WHERE YEAR(fecha) = ?');
    $stVA->execute([$anio]);
    $ventAnio = $stVA->fetch();

    // Compras año completo
    $stCA = $pdo->prepare(
        'SELECT COUNT(DISTINCT c.idCompra) AS cant, COALESCE(SUM(dc.valorTotal), 0) AS tot
         FROM Compra c LEFT JOIN DetalleCompra dc ON dc.idCompra = c.idCompra
         WHERE YEAR(c.fecha) = ?'
    );
    $stCA->execute([$anio]);
    $compAnio = $stCA->fetch();

    // Ventas mes actual
    $stVM = $pdo->prepare('SELECT COALESCE(SUM(total), 0) AS tot, COUNT(*) AS cant FROM ventas WHERE DATE(fecha) BETWEEN ? AND ?');
    $stVM->execute([$iniMes, $hoy]);
    $ventMes = $stVM->fetch();

    // Ventas mes anterior (para delta %)
    $stVMA = $pdo->prepare('SELECT COALESCE(SUM(total), 0) AS tot FROM ventas WHERE DATE(fecha) BETWEEN ? AND ?');
    $stVMA->execute([$iniAnt, $finAnt]);
    $ventMesAnt = (float) $stVMA->fetchColumn();

    // Compras mes actual
    $stCM = $pdo->prepare(
        'SELECT COALESCE(SUM(dc.valorTotal), 0) AS tot, COUNT(DISTINCT c.idCompra) AS cant
         FROM Compra c LEFT JOIN DetalleCompra dc ON dc.idCompra = c.idCompra
         WHERE DATE(c.fecha) BETWEEN ? AND ?'
    );
    $stCM->execute([$iniMes, $hoy]);
    $compraMes = $stCM->fetch();

    // Compras mes anterior
    $stCMA = $pdo->prepare(
        'SELECT COALESCE(SUM(dc.valorTotal), 0) AS tot
         FROM Compra c LEFT JOIN DetalleCompra dc ON dc.idCompra = c.idCompra
         WHERE DATE(c.fecha) BETWEEN ? AND ?'
    );
    $stCMA->execute([$iniAnt, $finAnt]);
    $compraMesAnt = (float) $stCMA->fetchColumn();

    // Productos bajo stock
    $stBajo = $pdo->prepare(
        'SELECT COUNT(*) FROM (
            SELECT p.idProducto, COALESCE(SUM(i.entrada - i.salida), 0) AS stock
            FROM Producto p LEFT JOIN Inventario i ON i.idProducto = p.idProducto
            GROUP BY p.idProducto HAVING stock <= ?
         ) t'
    );
    $stBajo->execute([$umbral]);
    $bajosStock = (int) $stBajo->fetchColumn();

    // Actividad reciente: últimas 8 ventas
    $stActiv = $pdo->query(
        'SELECT v.id_venta, DATE_FORMAT(v.fecha, \'%Y-%m-%d %H:%i\') AS fecha, v.total
         FROM ventas v ORDER BY v.fecha DESC, v.id_venta DESC LIMIT 8'
    );

    // Distribución por categoría (para dona)
    $stCat = $pdo->query(
        'SELECT COALESCE(p.categoria, \'Sin categoría\') AS categoria, COUNT(*) AS total
         FROM Producto p GROUP BY p.categoria ORDER BY total DESC LIMIT 8'
    );

    // Series 12 meses
    $stSV = $pdo->prepare(
        'SELECT DATE_FORMAT(fecha, \'%Y-%m\') AS mes,
                COALESCE(SUM(total), 0) AS total, COUNT(*) AS cantidad
         FROM ventas WHERE fecha >= ?
         GROUP BY DATE_FORMAT(fecha, \'%Y-%m\') ORDER BY mes ASC'
    );
    $stSV->execute([$inicio12]);

    $stSC = $pdo->prepare(
        'SELECT DATE_FORMAT(c.fecha, \'%Y-%m\') AS mes,
                COALESCE(SUM(dc.valorTotal), 0) AS total,
                COUNT(DISTINCT c.idCompra) AS cantidad
         FROM Compra c LEFT JOIN DetalleCompra dc ON dc.idCompra = c.idCompra
         WHERE c.fecha >= ?
         GROUP BY DATE_FORMAT(c.fecha, \'%Y-%m\') ORDER BY mes ASC'
    );
    $stSC->execute([$inicio12]);

    lb_json([
        'ok'    => true,
        'stats' => [
            'totalProductos'   => $totalProductos,
            'stockTotal'       => $stockTotal,
            'totalProveedores' => $totalProveedores,
            'totalCategorias'  => $totalCategorias,
            'anio'             => $anio,
            'umbral'           => $umbral,
            'bajosStock'       => $bajosStock,
            'ventasAnio'       => ['cantidad' => (int) $ventAnio['cant'], 'total' => (float) $ventAnio['tot']],
            'comprasAnio'      => ['cantidad' => (int) $compAnio['cant'], 'total' => (float) $compAnio['tot']],
            'ventasMes'        => ['total' => (float) $ventMes['tot'],    'cantidad' => (int) $ventMes['cant']],
            'ventasMesAnt'     => $ventMesAnt,
            'comprasMes'       => ['total' => (float) $compraMes['tot'],  'cantidad' => (int) $compraMes['cant']],
            'comprasMesAnt'    => $compraMesAnt,
        ],
        'actividadReciente' => $stActiv->fetchAll(),
        'catChart'          => $stCat->fetchAll(),
        'serieVentas'       => rellenarSeries($stSV->fetchAll(), 12),
        'serieCompras'      => rellenarSeries($stSC->fetchAll(), 12),
    ]);
}

/* ──────────────────────────── Resumen mensual ──────────── */

function reporte_resumen(PDO $pdo): void
{
    $anio = (int) date('Y');
    $mes  = (int) date('n');

    $mesParam = isset($_GET['mes']) ? trim((string) $_GET['mes']) : '';
    if ($mesParam !== '') {
        if (!preg_match('/^(\d{4})-(\d{2})$/', $mesParam, $m)) {
            lb_json(['ok' => false, 'error' => 'Use mes en formato AAAA-MM.'], 400);
        }
        $anio = (int) $m[1];
        $mes  = (int) $m[2];
        if ($mes < 1 || $mes > 12) lb_json(['ok' => false, 'error' => 'Mes inválido.'], 400);
    }

    $ini = sprintf('%04d-%02d-01', $anio, $mes);
    $fin = (new DateTimeImmutable($ini))->modify('first day of next month')->format('Y-m-d');

    $nombres  = [1=>'enero',2=>'febrero',3=>'marzo',4=>'abril',5=>'mayo',6=>'junio',
                 7=>'julio',8=>'agosto',9=>'septiembre',10=>'octubre',11=>'noviembre',12=>'diciembre'];
    $etiqueta = ($nombres[$mes] ?? (string) $mes) . ' ' . $anio;

    lb_ensure_compra_anulada($pdo);

    $stAnul = $pdo->prepare(
        'SELECT idCompra, anulado_en, fecha_compra, nombre_importador, estado, total
         FROM CompraAnulada WHERE anulado_en >= ? AND anulado_en < ? ORDER BY anulado_en DESC'
    );
    $stAnul->execute([$ini . ' 00:00:00', $fin . ' 00:00:00']);

    $stVentas = $pdo->prepare(
        'SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS cantidad
         FROM ventas WHERE fecha >= ? AND fecha < ?'
    );
    $stVentas->execute([$ini, $fin]);
    $vm = $stVentas->fetch();

    $stCompras = $pdo->prepare(
        'SELECT COUNT(*) AS cantidad, COALESCE(SUM(sub.t), 0) AS total
         FROM (SELECT c.idCompra, COALESCE(SUM(dc.valorTotal), 0) AS t
               FROM Compra c LEFT JOIN DetalleCompra dc ON dc.idCompra = c.idCompra
               WHERE c.fecha >= ? AND c.fecha < ?
               GROUP BY c.idCompra) sub'
    );
    $stCompras->execute([$ini, $fin]);
    $cm = $stCompras->fetch();

    $stTp = $pdo->prepare(
        'SELECT tp.nombre AS nombre_tipo_pago, COUNT(*) AS num_ventas, COALESCE(SUM(v.total), 0) AS total
         FROM ventas v INNER JOIN tipo_pago tp ON tp.id_tipo_pago = v.id_tipo_pago
         WHERE v.fecha >= ? AND v.fecha < ?
         GROUP BY tp.id_tipo_pago, tp.nombre ORDER BY total DESC'
    );
    $stTp->execute([$ini, $fin]);

    $stTop = $pdo->prepare(
        'SELECT p.idProducto, p.nombre, p.codigoOEM,
                SUM(d.cantidad) AS unidades, SUM(d.cantidad * d.precio) AS subtotal
         FROM detalle_venta d
         INNER JOIN ventas v ON v.id_venta = d.id_venta
         INNER JOIN Producto p ON p.idProducto = d.idProducto
         WHERE v.fecha >= ? AND v.fecha < ?
         GROUP BY p.idProducto, p.nombre, p.codigoOEM
         ORDER BY unidades DESC LIMIT 15'
    );
    $stTop->execute([$ini, $fin]);

    lb_json([
        'ok'      => true,
        'periodo' => [
            'anio'     => $anio, 'mes' => $mes,
            'mesClave' => sprintf('%04d-%02d', $anio, $mes),
            'etiqueta' => $etiqueta, 'desde' => $ini, 'hasta' => $fin,
        ],
        'ventasMes'         => ['total' => (float) $vm['total'],  'cantidad' => (int) $vm['cantidad']],
        'comprasMes'        => ['total' => (float) $cm['total'],  'cantidad' => (int) $cm['cantidad']],
        'ventasPorTipoPago' => $stTp->fetchAll(),
        'topProductos'      => $stTop->fetchAll(),
        'comprasAnuladas'   => $stAnul->fetchAll(),
    ]);
}

/* ──────────────────────────── Inventario ───────────────── */

function reporte_inventario(PDO $pdo): void
{
    $settingsFile = dirname(__DIR__) . '/data/lb_settings.json';
    $umbral = 10;
    if (is_readable($settingsFile)) {
        $json = json_decode((string) file_get_contents($settingsFile), true);
        if (isset($json['umbralStockBajo']) && is_numeric($json['umbralStockBajo'])) {
            $umbral = max(0, (int) $json['umbralStockBajo']);
        }
    }

    $stStock = $pdo->query(
        'SELECT p.idProducto, p.codigoOEM, p.nombre, p.marca, p.modelo,
                p.categoria, p.condicionProducto, p.precioInicial,
                COALESCE(SUM(i.entrada - i.salida), 0) AS stock
         FROM Producto p
         LEFT JOIN Inventario i ON i.idProducto = p.idProducto
         GROUP BY p.idProducto, p.codigoOEM, p.nombre, p.marca, p.modelo,
                  p.categoria, p.condicionProducto, p.precioInicial
         ORDER BY stock ASC, p.nombre ASC'
    );

    $stMov = $pdo->query(
        'SELECT p.codigoOEM, p.nombre AS nombreProducto,
                i.entrada, i.salida, i.fechaActualizacion
         FROM Inventario i
         INNER JOIN Producto p ON p.idProducto = i.idProducto
         ORDER BY i.fechaActualizacion DESC LIMIT 50'
    );

    lb_json([
        'ok'          => true,
        'umbral'      => $umbral,
        'productos'   => $stStock->fetchAll(),
        'movimientos' => $stMov->fetchAll(),
    ]);
}

/* ──────────────────────────── Compras ──────────────────── */

function reporte_compras(PDO $pdo): void
{
    [$desde, $hasta] = validarRango();
    $hastaFin = $hasta . ' 23:59:59';

    $stHist = $pdo->prepare(
        'SELECT c.idCompra, c.fecha, i.nombre AS nombreImportador,
                COALESCE(SUM(dc.valorTotal), 0) AS total,
                COUNT(dc.idCompra) AS numArticulos
         FROM Compra c
         INNER JOIN Importador i ON i.idImportador = c.idImportador
         LEFT JOIN DetalleCompra dc ON dc.idCompra = c.idCompra
         WHERE c.fecha >= ? AND c.fecha <= ?
         GROUP BY c.idCompra, c.fecha, i.nombre
         ORDER BY c.fecha DESC, c.idCompra DESC'
    );
    $stHist->execute([$desde, $hastaFin]);
    $historial = $stHist->fetchAll();

    $stProv = $pdo->prepare(
        'SELECT i.nombre AS nombreImportador,
                COUNT(DISTINCT c.idCompra) AS numCompras,
                COALESCE(SUM(dc.valorTotal), 0) AS total
         FROM Compra c
         INNER JOIN Importador i ON i.idImportador = c.idImportador
         LEFT JOIN DetalleCompra dc ON dc.idCompra = c.idCompra
         WHERE c.fecha >= ? AND c.fecha <= ?
         GROUP BY i.idImportador, i.nombre ORDER BY total DESC'
    );
    $stProv->execute([$desde, $hastaFin]);

    $stDet = $pdo->prepare(
        'SELECT dc.idCompra, p.nombre, p.codigoOEM,
                dc.cantidad, dc.precioCompra, dc.valorTotal
         FROM DetalleCompra dc
         INNER JOIN Compra c ON c.idCompra = dc.idCompra
         INNER JOIN Producto p ON p.idProducto = dc.idProducto
         WHERE c.fecha >= ? AND c.fecha <= ?
         ORDER BY dc.idCompra DESC, p.nombre ASC'
    );
    $stDet->execute([$desde, $hastaFin]);

    lb_json([
        'ok'           => true,
        'desde'        => $desde,
        'hasta'        => $hasta,
        'totalGastado' => (float) array_sum(array_column($historial, 'total')),
        'totalOrdenes' => count($historial),
        'historial'    => $historial,
        'detalles'     => $stDet->fetchAll(),
        'porProveedor' => $stProv->fetchAll(),
    ]);
}

/* ──────────────────────────── Ventas ───────────────────── */

function reporte_ventas(PDO $pdo): void
{
    [$desde, $hasta] = validarRango();
    $hastaFin = $hasta . ' 23:59:59';

    $stHist = $pdo->prepare(
        'SELECT v.id_venta, v.fecha, v.total, tp.nombre AS tipoPago
         FROM ventas v
         INNER JOIN tipo_pago tp ON tp.id_tipo_pago = v.id_tipo_pago
         WHERE v.fecha >= ? AND v.fecha <= ?
         ORDER BY v.fecha DESC, v.id_venta DESC'
    );
    $stHist->execute([$desde, $hastaFin]);
    $historial = $stHist->fetchAll();

    $stTp = $pdo->prepare(
        'SELECT tp.nombre AS tipoPago, COUNT(*) AS numVentas, COALESCE(SUM(v.total), 0) AS total
         FROM ventas v
         INNER JOIN tipo_pago tp ON tp.id_tipo_pago = v.id_tipo_pago
         WHERE v.fecha >= ? AND v.fecha <= ?
         GROUP BY tp.id_tipo_pago, tp.nombre ORDER BY total DESC'
    );
    $stTp->execute([$desde, $hastaFin]);

    $stDet = $pdo->prepare(
        'SELECT dv.id_venta, p.nombre, p.codigoOEM,
                dv.cantidad, dv.precio,
                (dv.cantidad * dv.precio) AS subtotal
         FROM detalle_venta dv
         INNER JOIN ventas v ON v.id_venta = dv.id_venta
         INNER JOIN Producto p ON p.idProducto = dv.idProducto
         WHERE v.fecha >= ? AND v.fecha <= ?
         ORDER BY dv.id_venta DESC, p.nombre ASC'
    );
    $stDet->execute([$desde, $hastaFin]);

    $totalVendido = (float) array_sum(array_column($historial, 'total'));
    $totalVentas  = count($historial);

    lb_json([
        'ok'          => true,
        'desde'       => $desde,
        'hasta'       => $hasta,
        'totalVendido'=> $totalVendido,
        'totalVentas' => $totalVentas,
        'ticketProm'  => $totalVentas > 0 ? round($totalVendido / $totalVentas, 2) : 0.0,
        'historial'   => $historial,
        'detalles'    => $stDet->fetchAll(),
        'porTipoPago' => $stTp->fetchAll(),
    ]);
}

/* ──────────────────────────── Productos ────────────────── */

function reporte_productos(PDO $pdo): void
{
    $desdeRaw = isset($_GET['desde']) ? trim((string) $_GET['desde']) : '';
    $hastaRaw = isset($_GET['hasta']) ? trim((string) $_GET['hasta']) : '';
    $usarRango = preg_match('/^\d{4}-\d{2}-\d{2}$/', $desdeRaw) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $hastaRaw);

    if ($usarRango) {
        $stTop = $pdo->prepare(
            'SELECT p.idProducto, p.codigoOEM, p.nombre, p.marca, p.categoria,
                    SUM(d.cantidad) AS unidades, SUM(d.cantidad * d.precio) AS subtotal
             FROM detalle_venta d
             INNER JOIN ventas v ON v.id_venta = d.id_venta
             INNER JOIN Producto p ON p.idProducto = d.idProducto
             WHERE v.fecha >= ? AND v.fecha <= ?
             GROUP BY p.idProducto, p.codigoOEM, p.nombre, p.marca, p.categoria
             ORDER BY unidades DESC LIMIT 20'
        );
        $stTop->execute([$desdeRaw . ' 00:00:00', $hastaRaw . ' 23:59:59']);
    } else {
        $stTop = $pdo->query(
            'SELECT p.idProducto, p.codigoOEM, p.nombre, p.marca, p.categoria,
                    SUM(d.cantidad) AS unidades, SUM(d.cantidad * d.precio) AS subtotal
             FROM detalle_venta d
             INNER JOIN Producto p ON p.idProducto = d.idProducto
             GROUP BY p.idProducto, p.codigoOEM, p.nombre, p.marca, p.categoria
             ORDER BY unidades DESC LIMIT 20'
        );
    }

    $stSinVenta = $pdo->query(
        'SELECT p.idProducto, p.codigoOEM, p.nombre, p.marca, p.categoria,
                COALESCE(SUM(i.entrada - i.salida), 0) AS stock
         FROM Producto p
         LEFT JOIN detalle_venta dv ON dv.idProducto = p.idProducto
         LEFT JOIN Inventario i ON i.idProducto = p.idProducto
         WHERE dv.idProducto IS NULL
         GROUP BY p.idProducto, p.codigoOEM, p.nombre, p.marca, p.categoria
         ORDER BY stock DESC, p.nombre ASC'
    );

    $stCat = $pdo->query(
        'SELECT COALESCE(sub.categoria, \'Sin categoría\') AS categoria,
                COUNT(*) AS numProductos,
                COALESCE(SUM(sub.stock), 0) AS stockTotal
         FROM (SELECT p.categoria, COALESCE(SUM(i.entrada - i.salida), 0) AS stock
               FROM Producto p LEFT JOIN Inventario i ON i.idProducto = p.idProducto
               GROUP BY p.idProducto, p.categoria) sub
         GROUP BY sub.categoria ORDER BY numProductos DESC'
    );

    lb_json([
        'ok'          => true,
        'topVendidos' => $stTop->fetchAll(),
        'sinVentas'   => $stSinVenta->fetchAll(),
        'porCategoria'=> $stCat->fetchAll(),
    ]);
}

/* ──────────────────────────── Top productos (independiente) */

function reporte_top_productos(PDO $pdo): void
{
    [$desde, $hasta] = validarRango();
    $finDt = $hasta . ' 23:59:59';

    $st = $pdo->prepare(
        'SELECT p.idProducto, p.nombre, p.codigoOEM,
                SUM(d.cantidad) AS unidades,
                SUM(d.cantidad * d.precio) AS subtotal
         FROM detalle_venta d
         INNER JOIN ventas v ON v.id_venta = d.id_venta
         INNER JOIN Producto p ON p.idProducto = d.idProducto
         WHERE v.fecha >= ? AND v.fecha <= ?
         GROUP BY p.idProducto, p.nombre, p.codigoOEM
         ORDER BY unidades DESC LIMIT 20'
    );
    $st->execute([$desde . ' 00:00:00', $finDt]);

    lb_json(['ok' => true, 'desde' => $desde, 'hasta' => $hasta, 'productos' => $st->fetchAll()]);
}

/* ──────────────────────────── Compras anuladas (independiente) */

function reporte_compras_anuladas(PDO $pdo): void
{
    [$desde, $hasta] = validarRango();
    lb_ensure_compra_anulada($pdo);

    $st = $pdo->prepare(
        'SELECT idCompra, anulado_en, fecha_compra, nombre_importador, estado, total
         FROM CompraAnulada
         WHERE anulado_en >= ? AND anulado_en <= ?
         ORDER BY anulado_en DESC'
    );
    $st->execute([$desde . ' 00:00:00', $hasta . ' 23:59:59']);

    lb_json(['ok' => true, 'desde' => $desde, 'hasta' => $hasta, 'anuladas' => $st->fetchAll()]);
}
