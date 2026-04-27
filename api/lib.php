<?php
/**
 * Utilidades comunes para endpoints JSON.
 */
declare(strict_types=1);

require_once dirname(__DIR__) . '/config/database.php';

header('Content-Type: application/json; charset=utf-8');

function lb_json(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function lb_pdo(): PDO
{
    return lb_get_pdo();
}
