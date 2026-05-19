<?php
/**
 * CRUD tipo_pago — usado desde Configuración y referenciado por ventas.
 */
declare(strict_types=1);

require_once __DIR__ . '/lib.php';

function listar(PDO $pdo): array
{
    $rows = $pdo->query('SELECT id_tipo_pago, nombre FROM tipo_pago ORDER BY nombre')->fetchAll();
    return ['ok' => true, 'tipos' => $rows];
}

function una(PDO $pdo, int $id): array
{
    $st = $pdo->prepare('SELECT id_tipo_pago, nombre FROM tipo_pago WHERE id_tipo_pago = ?');
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) {
        return ['ok' => false, 'error' => 'Tipo de pago no encontrado.'];
    }
    return ['ok' => true, 'tipo' => $row];
}

function validar(array $in): ?string
{
    $nombre = trim((string) ($in['nombre'] ?? ''));
    if ($nombre === '') {
        return 'El nombre es obligatorio.';
    }
    if (strlen($nombre) > 50) {
        return 'El nombre admite máximo 50 caracteres.';
    }
    return null;
}

function crear(PDO $pdo, array $in): array
{
    $err = validar($in);
    if ($err) {
        return ['ok' => false, 'error' => $err];
    }
    $nombre = trim((string) $in['nombre']);
    $st = $pdo->prepare('SELECT id_tipo_pago FROM tipo_pago WHERE LOWER(nombre) = LOWER(?)');
    $st->execute([$nombre]);
    if ($st->fetch()) {
        return ['ok' => false, 'error' => 'Ya existe un tipo de pago con ese nombre.'];
    }
    $ins = $pdo->prepare('INSERT INTO tipo_pago (nombre) VALUES (?)');
    $ins->execute([$nombre]);
    return ['ok' => true, 'id_tipo_pago' => (int) $pdo->lastInsertId()];
}

function actualizar(PDO $pdo, int $id, array $in): array
{
    if ($id <= 0) {
        return ['ok' => false, 'error' => 'ID inválido.'];
    }
    $err = validar($in);
    if ($err) {
        return ['ok' => false, 'error' => $err];
    }
    $nombre = trim((string) $in['nombre']);
    $dup = $pdo->prepare('SELECT id_tipo_pago FROM tipo_pago WHERE LOWER(nombre) = LOWER(?) AND id_tipo_pago <> ?');
    $dup->execute([$nombre, $id]);
    if ($dup->fetch()) {
        return ['ok' => false, 'error' => 'Ya existe otro tipo con ese nombre.'];
    }
    $up = $pdo->prepare('UPDATE tipo_pago SET nombre = ? WHERE id_tipo_pago = ?');
    $up->execute([$nombre, $id]);
    if ($up->rowCount() === 0) {
        $chk = $pdo->prepare('SELECT 1 FROM tipo_pago WHERE id_tipo_pago = ?');
        $chk->execute([$id]);
        if (!$chk->fetch()) {
            return ['ok' => false, 'error' => 'Tipo de pago no encontrado.'];
        }
    }
    return ['ok' => true, 'id_tipo_pago' => $id];
}

function eliminar(PDO $pdo, int $id): array
{
    if ($id <= 0) {
        return ['ok' => false, 'error' => 'ID inválido.'];
    }
    $st = $pdo->prepare('SELECT COUNT(*) FROM ventas WHERE id_tipo_pago = ?');
    $st->execute([$id]);
    if ((int) $st->fetchColumn() > 0) {
        return ['ok' => false, 'error' => 'No se puede eliminar: hay ventas que usan este tipo de pago.'];
    }
    $del = $pdo->prepare('DELETE FROM tipo_pago WHERE id_tipo_pago = ?');
    $del->execute([$id]);
    if ($del->rowCount() === 0) {
        return ['ok' => false, 'error' => 'Tipo de pago no encontrado.'];
    }
    return ['ok' => true];
}

$pdo = lb_pdo();

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method === 'GET') {
        if (isset($_GET['id'])) {
            lb_json(una($pdo, (int) $_GET['id']));
        }
        lb_json(listar($pdo));
    }
    if ($method === 'POST') {
        $action = $_GET['action'] ?? 'create';
        $raw = file_get_contents('php://input');
        $in = $raw !== '' ? json_decode($raw, true) : [];
        if (!is_array($in)) {
            $in = [];
        }
        if ($action === 'update') {
            lb_json(actualizar($pdo, (int) ($_GET['id'] ?? 0), $in));
        }
        if ($action === 'delete') {
            lb_json(eliminar($pdo, (int) ($_GET['id'] ?? 0)));
        }
        lb_json(crear($pdo, $in));
    }
    lb_json(['ok' => false, 'error' => 'Método no permitido.'], 405);
} catch (Throwable $e) {
    lb_json_sql_error($e, 'Error en tipo_pago:');
}
