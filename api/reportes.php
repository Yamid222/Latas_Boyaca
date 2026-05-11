<?php
/**
 * Reportes agregados — ventas y compras del mes, tipo de pago, top productos.
 *
 * GET → JSON (opcional ?mes=AAAA-MM) + comprasAnuladas del mes (fecha de anulación)
 */
declare(strict_types=1);

require_once __DIR__ . '/lib.php';
require_once __DIR__ . '/schema_compra_anulada.php';

function mes_etiqueta(int $anio, int $mes): string
{
    $nombres = [
        1 => 'enero', 2 => 'febrero', 3 => 'marzo', 4 => 'abril',
        5 => 'mayo', 6 => 'junio', 7 => 'julio', 8 => 'agosto',
        9 => 'septiembre', 10 => 'octubre', 11 => 'noviembre', 12 => 'diciembre',
    ];
    return ($nombres[$mes] ?? (string) $mes) . ' ' . $anio;
}

/** @return array{0: string, 1: string} [inicio inclusive Y-m-d, fin exclusivo Y-m-d] */
function rango_mes(int $anio, int $mes): array
{
    $ini = sprintf('%04d-%02d-01', $anio, $mes);
    $fin = (new DateTimeImmutable($ini))->modify('first day of next month')->format('Y-m-d');

    return [$ini, $fin];
}

$pdo = lb_pdo();

$anio = (int) date('Y');
$mes = (int) date('n');

$mesParam = isset($_GET['mes']) ? trim((string) $_GET['mes']) : '';
if ($mesParam !== '') {
    if (!preg_match('/^(\d{4})-(\d{2})$/', $mesParam, $m)) {
        lb_json(['ok' => false, 'error' => 'Use mes en formato AAAA-MM.'], 400);
    }
    $anio = (int) $m[1];
    $mes = (int) $m[2];
    if ($mes < 1 || $mes > 12) {
        lb_json(['ok' => false, 'error' => 'Mes inválido.'], 400);
    }
}

[$fechaIni, $fechaFin] = rango_mes($anio, $mes);

try {
    lb_ensure_compra_anulada($pdo);

    $iniDt = $fechaIni . ' 00:00:00';
    $finDt = $fechaFin . ' 00:00:00';
    $stAnul = $pdo->prepare(
        'SELECT idCompra, anulado_en, fecha_compra, nombre_importador, estado, total
         FROM CompraAnulada
         WHERE anulado_en >= ? AND anulado_en < ?
         ORDER BY anulado_en DESC'
    );
    $stAnul->execute([$iniDt, $finDt]);
    $comprasAnuladas = $stAnul->fetchAll();

    $stVentas = $pdo->prepare(
        'SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS cantidad
         FROM ventas
         WHERE fecha >= ? AND fecha < ?'
    );
    $stVentas->execute([$fechaIni, $fechaFin]);
    $ventasMes = $stVentas->fetch();
    $ventasMes = [
        'total' => (float) ($ventasMes['total'] ?? 0),
        'cantidad' => (int) ($ventasMes['cantidad'] ?? 0),
    ];

    $stCompras = $pdo->prepare(
        'SELECT COUNT(*) AS cantidad,
                COALESCE(SUM(sub.t), 0) AS total
         FROM (
             SELECT c.idCompra, COALESCE(SUM(dc.valorTotal), 0) AS t
             FROM Compra c
             LEFT JOIN DetalleCompra dc ON dc.idCompra = c.idCompra
             WHERE c.fecha >= ? AND c.fecha < ?
             GROUP BY c.idCompra
         ) sub'
    );
    $stCompras->execute([$fechaIni, $fechaFin]);
    $comprasMes = $stCompras->fetch();
    $comprasMes = [
        'total' => (float) ($comprasMes['total'] ?? 0),
        'cantidad' => (int) ($comprasMes['cantidad'] ?? 0),
    ];

    $stTp = $pdo->prepare(
        'SELECT tp.nombre AS nombre_tipo_pago, COUNT(*) AS num_ventas, COALESCE(SUM(v.total), 0) AS total
         FROM ventas v
         INNER JOIN tipo_pago tp ON tp.id_tipo_pago = v.id_tipo_pago
         WHERE v.fecha >= ? AND v.fecha < ?
         GROUP BY tp.id_tipo_pago, tp.nombre
         ORDER BY total DESC, num_ventas DESC'
    );
    $stTp->execute([$fechaIni, $fechaFin]);
    $ventasPorTipoPago = $stTp->fetchAll();

    $stTop = $pdo->prepare(
        'SELECT p.idProducto, p.nombre, p.codigoOEM,
                SUM(d.cantidad) AS unidades,
                SUM(d.cantidad * d.precio) AS subtotal
         FROM detalle_venta d
         INNER JOIN ventas v ON v.id_venta = d.id_venta
         INNER JOIN Producto p ON p.idProducto = d.idProducto
         WHERE v.fecha >= ? AND v.fecha < ?
         GROUP BY p.idProducto, p.nombre, p.codigoOEM
         ORDER BY unidades DESC
         LIMIT 15'
    );
    $stTop->execute([$fechaIni, $fechaFin]);
    $topProductos = $stTop->fetchAll();

    lb_json([
        'ok' => true,
        'periodo' => [
            'anio' => $anio,
            'mes' => $mes,
            'mesClave' => sprintf('%04d-%02d', $anio, $mes),
            'etiqueta' => mes_etiqueta($anio, $mes),
            'desde' => $fechaIni,
            'hasta' => $fechaFin,
        ],
        'ventasMes' => $ventasMes,
        'comprasMes' => $comprasMes,
        'ventasPorTipoPago' => $ventasPorTipoPago,
        'topProductos' => $topProductos,
        'comprasAnuladas' => $comprasAnuladas,
    ]);
} catch (Throwable $e) {
    lb_json(['ok' => false, 'error' => $e->getMessage()], 500);
}
