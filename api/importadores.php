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

function tieneCodigoImportador(PDO $pdo): bool
{
    $st = $pdo->query("SHOW COLUMNS FROM Importador LIKE 'codigo'");
    return (bool) $st->fetch();
}

function asegurarCodigoImportador(PDO $pdo): void
{
    if (tieneCodigoImportador($pdo)) {
        return;
    }
    $pdo->exec("ALTER TABLE Importador ADD COLUMN codigo VARCHAR(50) NULL AFTER idImportador");
    $pdo->exec("UPDATE Importador SET codigo = CAST(idImportador AS CHAR) WHERE codigo IS NULL OR codigo = ''");
    $pdo->exec('ALTER TABLE Importador MODIFY codigo VARCHAR(50) NOT NULL');
    $pdo->exec('ALTER TABLE Importador ADD UNIQUE KEY uq_importador_codigo (codigo)');
}

function listar(PDO $pdo): array
{
    asegurarCodigoImportador($pdo);
    $rows = $pdo->query(
        'SELECT idImportador, codigo, nombre, telefono, correo FROM Importador ORDER BY nombre'
    )->fetchAll();
    return ['ok' => true, 'importadores' => $rows];
}

function uno(PDO $pdo, int $id): array
{
    asegurarCodigoImportador($pdo);
    $st = $pdo->prepare('SELECT idImportador, codigo, nombre, telefono, correo FROM Importador WHERE idImportador = ?');
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) {
        return ['ok' => false, 'error' => 'Importador no encontrado'];
    }
    return ['ok' => true, 'importador' => $row];
}

function validarCodigoOpcional(PDO $pdo, ?string $codigo, bool $crear, int $idExcluir = 0): ?string
{
    $codigo = $codigo !== null ? trim($codigo) : '';
    if ($codigo === '') {
        return null;
    }
    if (strlen($codigo) > 50) {
        return 'El código es demasiado largo.';
    }
    if (!preg_match('/^[a-zA-Z0-9_-]+$/', $codigo)) {
        return 'El código solo permite letras, números, guion y guion bajo.';
    }
    $sql = 'SELECT idImportador FROM Importador WHERE LOWER(codigo) = LOWER(?)';
    $params = [$codigo];
    if (!$crear && $idExcluir > 0) {
        $sql .= ' AND idImportador <> ?';
        $params[] = $idExcluir;
    }
    $st = $pdo->prepare($sql);
    $st->execute($params);
    if ($st->fetch()) {
        return 'Ese código ya está en uso por otro proveedor.';
    }
    return null;
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
    asegurarCodigoImportador($pdo);
    $err = validar($in, true);
    if ($err) {
        return ['ok' => false, 'error' => $err];
    }
    $codigoUsuario = trim((string) ($in['codigo'] ?? ''));
    if ($codigoUsuario !== '') {
        $errCod = validarCodigoOpcional($pdo, $codigoUsuario, true, 0);
        if ($errCod !== null) {
            return ['ok' => false, 'error' => $errCod];
        }
    }
    $st = $pdo->prepare('INSERT INTO Importador (nombre, telefono, correo) VALUES (?, ?, ?)');
    $st->execute([
        trim($in['nombre']),
        trim((string) ($in['telefono'] ?? '')) ?: null,
        trim((string) ($in['correo'] ?? '')) ?: null,
    ]);
    $id = (int) $pdo->lastInsertId();
    $codigoFinal = $codigoUsuario !== '' ? $codigoUsuario : (string) $id;
    if ($codigoUsuario === '') {
        $dup = $pdo->prepare('SELECT idImportador FROM Importador WHERE idImportador <> ? AND codigo = ?');
        $dup->execute([$id, $codigoFinal]);
        if ($dup->fetch()) {
            $codigoFinal = 'P' . $id;
        }
    }
    $up = $pdo->prepare('UPDATE Importador SET codigo = ? WHERE idImportador = ?');
    $up->execute([$codigoFinal, $id]);
    return ['ok' => true, 'idImportador' => $id, 'codigo' => $codigoFinal];
}

function actualizar(PDO $pdo, int $id, array $in): array
{
    asegurarCodigoImportador($pdo);
    if ($id <= 0) {
        return ['ok' => false, 'error' => 'ID inválido'];
    }
    $err = validar($in, false);
    if ($err) {
        return ['ok' => false, 'error' => $err];
    }
    if (array_key_exists('codigo', $in)) {
        $codigoUsuario = trim((string) $in['codigo']);
        if ($codigoUsuario === '') {
            return ['ok' => false, 'error' => 'El código no puede quedar vacío.'];
        }
        $errCod = validarCodigoOpcional($pdo, $codigoUsuario, false, $id);
        if ($errCod !== null) {
            return ['ok' => false, 'error' => $errCod];
        }
        $st = $pdo->prepare('UPDATE Importador SET nombre = ?, telefono = ?, correo = ?, codigo = ? WHERE idImportador = ?');
        $st->execute([
            trim($in['nombre']),
            trim((string) ($in['telefono'] ?? '')) ?: null,
            trim((string) ($in['correo'] ?? '')) ?: null,
            $codigoUsuario,
            $id,
        ]);
    } else {
        $st = $pdo->prepare('UPDATE Importador SET nombre = ?, telefono = ?, correo = ? WHERE idImportador = ?');
        $st->execute([
            trim($in['nombre']),
            trim((string) ($in['telefono'] ?? '')) ?: null,
            trim((string) ($in['correo'] ?? '')) ?: null,
            $id,
        ]);
    }
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

$pdo = lb_pdo();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
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
} catch (Throwable $e) {
    lb_json_sql_error($e, 'Error en importadores:');
}
