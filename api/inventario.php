<?php
declare(strict_types=1);

require_once __DIR__ . '/lib.php';
require_once dirname(__DIR__) . '/models/InventarioModel.php';
require_once dirname(__DIR__) . '/controllers/InventarioController.php';

$pdo = lb_pdo();
$model = new InventarioModel($pdo);
$controller = new InventarioController($model);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    if ($method === 'GET') {
        lb_json($controller->listarProductos());
    }

    if ($method === 'POST') {
        $raw = file_get_contents('php://input');
        $in = $raw !== '' ? json_decode($raw, true) : [];
        if (!is_array($in)) {
            $in = [];
        }
        lb_json($controller->crearProductoInventario($in));
    }

    lb_json(['ok' => false, 'error' => 'Método no permitido'], 405);
} catch (Throwable $e) {
    lb_json_sql_error($e, 'Error en inventario:');
}
