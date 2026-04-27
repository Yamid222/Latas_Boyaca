<?php
/**
 * CRUD Importador (proveedores)
 *
 * GET                    → listado
 * GET ?id=N              → uno
 * POST                   → crear JSON { nombre, telefono, correo }
 * POST ?action=update&id → actualizar
 * POST ?action=delete&id → eliminar (si no hay compras asociadas)
 */
declare(strict_types=1);

require_once __DIR__ . '/lib.php';

function listar(PDO $pdo): array
{
    $rows = $pdo->query(
        'SELECT idImportador, nombre, telefono, correo FROM Importador ORDER BY nombre'
    )->fetchAll();
    return ['ok' => true, 'importadores' => $rows];
}

function uno(PDO $pdo, int $id): array
{
    $st = $pdo->prepare('SELECT idImportador, nombre, telefono, correo FROM Importador WHERE idImportador = ?');
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) {
        return ['ok' => false, 'error' => 'Importador no encontrado'];
    }
    return ['ok' => true, 'importador' => $row];
}

function validar(array $in, bool $crear): ?string
{
    $nombre = trim((string) ($in['nombre'] ?? ''));
    if ($nombre === '') {
        return 'El nombre es obligatorio.';
    }
    if (strlen($nombre) > 100) {
        return 'El nombre es demasiado largo.';
    }
    $tel = trim((string) ($in['telefono'] ?? ''));
    if (strlen($tel) > 20) {
        return 'Teléfono inválido.';
    }
    $correo = trim((string) ($in['correo'] ?? ''));
    if ($correo !== '' && !filter_var($correo, FILTER_VALIDATE_EMAIL)) {
        return 'Correo electrónico no válido.';
    }
    if (strlen($correo) > 100) {
        return 'Correo demasiado largo.';
    }
    return null;
}

function crear(PDO $pdo, array $in): array
{
    $err = validar($in, true);
    if ($err) {
        return ['ok' => false, 'error' => $err];
    }
    $st = $pdo->prepare('INSERT INTO Importador (nombre, telefono, correo) VALUES (?, ?, ?)');
    $st->execute([
        trim($in['nombre']),
        trim((string) ($in['telefono'] ?? '')) ?: null,
        trim((string) ($in['correo'] ?? '')) ?: null,
    ]);
    return ['ok' => true, 'idImportador' => (int) $pdo->lastInsertId()];
}

function actualizar(PDO $pdo, int $id, array $in): array
{
    if ($id <= 0) {
        return ['ok' => false, 'error' => 'ID inválido'];
    }
    $err = validar($in, false);
    if ($err) {
        return ['ok' => false, 'error' => $err];
    }
    $st = $pdo->prepare('UPDATE Importador SET nombre = ?, telefono = ?, correo = ? WHERE idImportador = ?');
    $st->execute([
        trim($in['nombre']),
        trim((string) ($in['telefono'] ?? '')) ?: null,
        trim((string) ($in['correo'] ?? '')) ?: null,
        $id,
    ]);
    if ($st->rowCount() === 0) {
        $chk = $pdo->prepare('SELECT 1 FROM Importador WHERE idImportador = ?');
        $chk->execute([$id]);
        if (!$chk->fetch()) {
            return ['ok' => false, 'error' => 'Importador no encontrado'];
        }
    }
    return ['ok' => true, 'idImportador' => $id];
}

function eliminar(PDO $pdo, int $id): array
{
    if ($id <= 0) {
        return ['ok' => false, 'error' => 'ID inválido'];
    }
    $st = $pdo->prepare('SELECT COUNT(*) FROM Compra WHERE idImportador = ?');
    $st->execute([$id]);
    if ((int) $st->fetchColumn() > 0) {
        return ['ok' => false, 'error' => 'No se puede eliminar: hay compras asociadas a este importador.'];
    }
    $del = $pdo->prepare('DELETE FROM Importador WHERE idImportador = ?');
    $del->execute([$id]);
    if ($del->rowCount() === 0) {
        return ['ok' => false, 'error' => 'Importador no encontrado'];
    }
    return ['ok' => true];
}

try {
    $pdo = lb_pdo();
} catch (Throwable $e) {
    lb_json(['ok' => false, 'error' => 'Error de base de datos: ' . $e->getMessage()], 500);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    if (isset($_GET['id'])) {
        $id = (int) $_GET['id'];
        if ($id <= 0) {
            lb_json(['ok' => false, 'error' => 'ID inválido'], 400);
        }
        lb_json(uno($pdo, $id));
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

    if ($action === 'delete') {
        $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
        lb_json(eliminar($pdo, $id));
    }
    if ($action === 'update') {
        $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
        lb_json(actualizar($pdo, $id, $in));
    }
    lb_json(crear($pdo, $in));
}

lb_json(['ok' => false, 'error' => 'Método no permitido'], 405);
