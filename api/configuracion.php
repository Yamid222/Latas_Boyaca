<?php
/**
 * Preferencias de la aplicación (JSON en disco).
 *
 * GET  → { ok, umbralStockBajo }
 * POST → guardar { umbralStockBajo: int } (0–999999)
 */
declare(strict_types=1);

require_once __DIR__ . '/lib.php';

$settingsPath = dirname(__DIR__) . '/data/lb_settings.json';

function lb_settings_defaults(): array
{
    return ['umbralStockBajo' => 10];
}

function lb_settings_load(string $path): array
{
    $def = lb_settings_defaults();
    if (!is_readable($path)) {
        return $def;
    }
    $raw = file_get_contents($path);
    if ($raw === false || $raw === '') {
        return $def;
    }
    $j = json_decode($raw, true);
    if (!is_array($j)) {
        return $def;
    }
    $u = isset($j['umbralStockBajo']) ? (int) $j['umbralStockBajo'] : $def['umbralStockBajo'];
    if ($u < 0) {
        $u = 0;
    }
    if ($u > 999999) {
        $u = 999999;
    }
    return ['umbralStockBajo' => $u];
}

function lb_settings_save(string $path, array $data): void
{
    $dir = dirname($path);
    if (!is_dir($dir)) {
        if (!mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new RuntimeException('No se pudo crear el directorio de configuración.');
        }
    }
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        throw new RuntimeException('No se pudo serializar la configuración.');
    }
    if (file_put_contents($path, $json) === false) {
        throw new RuntimeException('No se pudo guardar la configuración.');
    }
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    try {
        $cfg = lb_settings_load($settingsPath);
        lb_json(['ok' => true, 'umbralStockBajo' => $cfg['umbralStockBajo']]);
    } catch (Throwable $e) {
        lb_json(['ok' => false, 'error' => $e->getMessage()], 500);
    }
}

if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $in = $raw !== '' ? json_decode($raw, true) : [];
    if (!is_array($in)) {
        $in = [];
    }
    if (!array_key_exists('umbralStockBajo', $in)) {
        lb_json(['ok' => false, 'error' => 'Falta umbralStockBajo.'], 400);
    }
    $u = (int) $in['umbralStockBajo'];
    if ($u < 0 || $u > 999999) {
        lb_json(['ok' => false, 'error' => 'El umbral debe estar entre 0 y 999999.'], 400);
    }
    try {
        lb_settings_save($settingsPath, ['umbralStockBajo' => $u]);
        lb_json(['ok' => true, 'umbralStockBajo' => $u]);
    } catch (Throwable $e) {
        lb_json(['ok' => false, 'error' => $e->getMessage()], 500);
    }
}

lb_json(['ok' => false, 'error' => 'Método no permitido'], 405);
