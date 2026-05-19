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
    try {
        return lb_get_pdo();
    } catch (PDOException $e) {
        lb_json(
            [
                'ok' => false,
                'error' => 'No se pudo conectar a MySQL. Compruebe que el servicio esté en ejecución, que exista la base de datos `' . (getenv('LB_DB_NAME') ?: 'latas_boyaca') . '` y las credenciales (LB_DB_USER / LB_DB_PASS). ' . $e->getMessage(),
            ],
            500
        );
    }
}

/** Mensaje JSON legible para fallos SQL (p. ej. tablas InnoDB dañadas #1932). */
function lb_json_sql_error(Throwable $e, string $contexto): void
{
    $detalle = $e->getMessage();
    $extra = '';
    if (str_contains($detalle, "doesn't exist in engine") || str_contains($detalle, '1932')) {
        $extra = ' Las tablas en el servidor pueden estar corruptas (error InnoDB 1932). Repare o restaure la base `latas_boyaca` desde phpMyAdmin o un respaldo.';
    } elseif (str_contains($detalle, "doesn't exist") || str_contains($detalle, '1146')) {
        $extra = ' Falta una tabla o la definición no coincide con la que espera la aplicación. Restaure el esquema de `latas_boyaca`.';
    }
    lb_json(['ok' => false, 'error' => $contexto . $extra . ' ' . $detalle], 500);
}
