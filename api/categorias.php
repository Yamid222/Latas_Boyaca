<?php
declare(strict_types=1);

require_once __DIR__ . '/lib.php';

function tieneCodigoCategoria(PDO $pdo): bool
{
    $st = $pdo->query("SHOW COLUMNS FROM Categoria LIKE 'codigo'");
    return (bool) $st->fetch();
}

function asegurarCodigoCategoria(PDO $pdo): void
{
    if (tieneCodigoCategoria($pdo)) {
        return;
    }
    $pdo->exec("ALTER TABLE Categoria ADD COLUMN codigo VARCHAR(50) NULL AFTER idCategoria");
    $pdo->exec("UPDATE Categoria SET codigo = CAST(idCategoria AS CHAR) WHERE codigo IS NULL OR codigo = ''");
    $pdo->exec("ALTER TABLE Categoria MODIFY codigo VARCHAR(50) NOT NULL");
    $pdo->exec("ALTER TABLE Categoria ADD UNIQUE KEY uq_categoria_codigo (codigo)");
}

function productoTieneIdCategoria(PDO $pdo): bool
{
    $st = $pdo->query("SHOW COLUMNS FROM Producto LIKE 'idCategoria'");
    return (bool) $st->fetch();
}

function listar(PDO $pdo): array
{
    asegurarCodigoCategoria($pdo);
    $rows = $pdo->query('SELECT idCategoria, codigo, nombre FROM Categoria ORDER BY nombre')->fetchAll();
    return ['ok' => true, 'categorias' => $rows];
}

function una(PDO $pdo, int $id): array
{
    asegurarCodigoCategoria($pdo);
    $st = $pdo->prepare('SELECT idCategoria, codigo, nombre FROM Categoria WHERE idCategoria = ?');
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) {
        return ['ok' => false, 'error' => 'Categoría no encontrada.'];
    }
    return ['ok' => true, 'categoria' => $row];
}

function validar(array $in): ?string
{
    $nombre = trim((string) ($in['nombre'] ?? ''));
    if ($nombre === '') {
        return 'El nombre es obligatorio.';
    }
    if (strlen($nombre) > 100) {
        return 'El nombre es demasiado largo.';
    }
    return null;
}

function crear(PDO $pdo, array $in): array
{
    asegurarCodigoCategoria($pdo);
    $err = validar($in);
    if ($err) {
        return ['ok' => false, 'error' => $err];
    }
    $codigo = trim((string) ($in['codigo'] ?? ''));
    if ($codigo === '') {
        return ['ok' => false, 'error' => 'El código es obligatorio.'];
    }
    if (strlen($codigo) > 50) {
        return ['ok' => false, 'error' => 'El código es demasiado largo.'];
    }
    if (!preg_match('/^[a-zA-Z0-9_-]+$/', $codigo)) {
        return ['ok' => false, 'error' => 'El código solo permite letras, números, guion y guion bajo.'];
    }
    $dupCode = $pdo->prepare('SELECT idCategoria FROM Categoria WHERE LOWER(codigo) = LOWER(?)');
    $dupCode->execute([$codigo]);
    if ($dupCode->fetch()) {
        return ['ok' => false, 'error' => 'El código ya existe. Ingrese uno diferente.'];
    }
    $nombre = trim((string) $in['nombre']);
    $st = $pdo->prepare('SELECT idCategoria FROM Categoria WHERE LOWER(nombre) = LOWER(?)');
    $st->execute([$nombre]);
    if ($st->fetch()) {
        return ['ok' => false, 'error' => 'La categoría ya existe.'];
    }
    $ins = $pdo->prepare('INSERT INTO Categoria (codigo, nombre) VALUES (?, ?)');
    $ins->execute([$codigo, $nombre]);
    return ['ok' => true, 'idCategoria' => (int) $pdo->lastInsertId()];
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
    $dup = $pdo->prepare('SELECT idCategoria FROM Categoria WHERE LOWER(nombre) = LOWER(?) AND idCategoria <> ?');
    $dup->execute([$nombre, $id]);
    if ($dup->fetch()) {
        return ['ok' => false, 'error' => 'Ya existe otra categoría con ese nombre.'];
    }
    $oldNombre = null;
    if (!productoTieneIdCategoria($pdo)) {
        $old = $pdo->prepare('SELECT nombre FROM Categoria WHERE idCategoria = ?');
        $old->execute([$id]);
        $oldNombre = $old->fetchColumn();
    }
    $up = $pdo->prepare('UPDATE Categoria SET nombre = ? WHERE idCategoria = ?');
    $up->execute([$nombre, $id]);
    if ($up->rowCount() === 0) {
        $chk = $pdo->prepare('SELECT 1 FROM Categoria WHERE idCategoria = ?');
        $chk->execute([$id]);
        if (!$chk->fetch()) {
            return ['ok' => false, 'error' => 'Categoría no encontrada.'];
        }
    }
    if (productoTieneIdCategoria($pdo)) {
        $upProd = $pdo->prepare('UPDATE Producto SET categoria = ? WHERE idCategoria = ?');
        $upProd->execute([$nombre, $id]);
    } else {
        if ($oldNombre !== false) {
            $upProd = $pdo->prepare('UPDATE Producto SET categoria = ? WHERE categoria = ?');
            $upProd->execute([$nombre, (string) $oldNombre]);
        }
    }
    return ['ok' => true, 'idCategoria' => $id];
}

function eliminar(PDO $pdo, int $id): array
{
    if ($id <= 0) {
        return ['ok' => false, 'error' => 'ID inválido.'];
    }
    if (productoTieneIdCategoria($pdo)) {
        $st = $pdo->prepare('SELECT COUNT(*) FROM Producto WHERE idCategoria = ?');
        $st->execute([$id]);
    } else {
        $cat = $pdo->prepare('SELECT nombre FROM Categoria WHERE idCategoria = ?');
        $cat->execute([$id]);
        $nombre = (string) ($cat->fetchColumn() ?: '');
        $st = $pdo->prepare('SELECT COUNT(*) FROM Producto WHERE categoria = ?');
        $st->execute([$nombre]);
    }
    if ((int) $st->fetchColumn() > 0) {
        return ['ok' => false, 'error' => 'No se puede eliminar: hay productos asociados.'];
    }
    $del = $pdo->prepare('DELETE FROM Categoria WHERE idCategoria = ?');
    $del->execute([$id]);
    if ($del->rowCount() === 0) {
        return ['ok' => false, 'error' => 'Categoría no encontrada.'];
    }
    return ['ok' => true];
}

try {
    $pdo = lb_pdo();
} catch (Throwable $e) {
    lb_json(['ok' => false, 'error' => 'Error de base de datos: ' . $e->getMessage()], 500);
}

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
    lb_json(['ok' => false, 'error' => 'Error en categorías: ' . $e->getMessage()], 500);
}
