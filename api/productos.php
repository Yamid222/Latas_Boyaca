<?php
/**
 * CRUD Producto (adaptado a categoria por FK)
 */
declare(strict_types=1);

require_once __DIR__ . '/lib.php';

function tieneIdCategoria(PDO $pdo): bool
{
    $st = $pdo->query("SHOW COLUMNS FROM Producto LIKE 'idCategoria'");
    return (bool) $st->fetch();
}

function tieneCodigoOEM(PDO $pdo): bool
{
    $st = $pdo->query("SHOW COLUMNS FROM Producto LIKE 'codigoOEM'");
    return (bool) $st->fetch();
}

function listar(PDO $pdo): array
{
    if (tieneIdCategoria($pdo)) {
        $rows = $pdo->query(
            'SELECT
                p.idProducto,
                p.codigoOEM,
                p.nombre,
                p.marca,
                p.categoria,
                p.precioInicial,
                p.estado,
                p.idCategoria,
                c.nombre AS nombreCategoria
             FROM Producto p
             LEFT JOIN Categoria c ON c.idCategoria = p.idCategoria
             ORDER BY p.nombre'
        )->fetchAll();
    } else {
        $rows = $pdo->query(
            'SELECT
                p.idProducto,
                p.codigoOEM,
                p.nombre,
                p.marca,
                p.categoria,
                p.precioInicial,
                p.estado,
                c.idCategoria,
                c.nombre AS nombreCategoria
             FROM Producto p
             LEFT JOIN Categoria c ON c.nombre = p.categoria
             ORDER BY p.nombre'
        )->fetchAll();
    }
    return ['ok' => true, 'productos' => $rows];
}

function uno(PDO $pdo, int $id): array
{
    $sql = tieneIdCategoria($pdo)
        ? 'SELECT
                p.idProducto,
                p.codigoOEM,
                p.nombre,
                p.marca,
                p.categoria,
                p.precioInicial,
                p.estado,
                p.idCategoria,
                c.nombre AS nombreCategoria
           FROM Producto p
           LEFT JOIN Categoria c ON c.idCategoria = p.idCategoria
           WHERE p.idProducto = ?'
        : 'SELECT
                p.idProducto,
                p.codigoOEM,
                p.nombre,
                p.marca,
                p.categoria,
                p.precioInicial,
                p.estado,
                c.idCategoria,
                c.nombre AS nombreCategoria
           FROM Producto p
           LEFT JOIN Categoria c ON c.nombre = p.categoria
           WHERE p.idProducto = ?';
    $st = $pdo->prepare($sql);
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) {
        return ['ok' => false, 'error' => 'Producto no encontrado'];
    }
    return ['ok' => true, 'producto' => $row];
}

function validar(array $in): ?string
{
    $codigo = trim((string) ($in['codigoOEM'] ?? ''));
    if ($codigo === '') {
        return 'El código es obligatorio.';
    }
    if (strlen($codigo) > 50) {
        return 'El código es demasiado largo.';
    }
    $nombre = trim((string) ($in['nombre'] ?? ''));
    if ($nombre === '') {
        return 'El nombre es obligatorio.';
    }
    if (strlen($nombre) > 100) {
        return 'El nombre es demasiado largo.';
    }
    $marca = trim((string) ($in['marca'] ?? ''));
    if (strlen($marca) > 100) {
        return 'Marca demasiado larga.';
    }
    $idCategoria = isset($in['idCategoria']) ? (int) $in['idCategoria'] : 0;
    if ($idCategoria <= 0) {
        return 'Seleccione una categoría válida.';
    }
    $precio = isset($in['precioInicial']) ? (float) $in['precioInicial'] : 0;
    if ($precio < 0) {
        return 'El precio no puede ser negativo.';
    }
    return null;
}

function crear(PDO $pdo, array $in): array
{
    $err = validar($in);
    if ($err) {
        return ['ok' => false, 'error' => $err];
    }
    $codigo = trim((string) ($in['codigoOEM'] ?? ''));
    if (tieneCodigoOEM($pdo)) {
        $dupCod = $pdo->prepare('SELECT idProducto FROM Producto WHERE LOWER(codigoOEM) = LOWER(?)');
        $dupCod->execute([$codigo]);
        if ($dupCod->fetch()) {
            return ['ok' => false, 'error' => 'El código del producto ya existe.'];
        }
    }
    $idCategoria = (int) ($in['idCategoria'] ?? 0);
    $precio = round((float) ($in['precioInicial'] ?? 0), 2);
    $stCat = $pdo->prepare('SELECT nombre FROM Categoria WHERE idCategoria = ?');
    $stCat->execute([$idCategoria]);
    $nombreCat = $stCat->fetchColumn();
    if ($nombreCat === false) {
        return ['ok' => false, 'error' => 'Categoría no encontrada.'];
    }
    $st = $pdo->prepare(
        (tieneIdCategoria($pdo) && tieneCodigoOEM($pdo))
            ? 'INSERT INTO Producto (codigoOEM, nombre, marca, categoria, precioInicial, idCategoria)
               VALUES (?, ?, ?, ?, ?, ?)'
            : (tieneIdCategoria($pdo)
                ? 'INSERT INTO Producto (nombre, marca, categoria, precioInicial, idCategoria)
                   VALUES (?, ?, ?, ?, ?)'
                : (tieneCodigoOEM($pdo)
                    ? 'INSERT INTO Producto (codigoOEM, nombre, marca, categoria, precioInicial)
                       VALUES (?, ?, ?, ?, ?)'
                    : 'INSERT INTO Producto (nombre, marca, categoria, precioInicial)
                       VALUES (?, ?, ?, ?)'))
    );
    if (tieneIdCategoria($pdo) && tieneCodigoOEM($pdo)) {
        $st->execute([
            $codigo,
            trim($in['nombre']),
            trim((string) ($in['marca'] ?? '')) ?: null,
            (string) $nombreCat,
            $precio,
            $idCategoria,
        ]);
    } elseif (tieneIdCategoria($pdo)) {
        $st->execute([
            trim($in['nombre']),
            trim((string) ($in['marca'] ?? '')) ?: null,
            (string) $nombreCat,
            $precio,
            $idCategoria,
        ]);
    } elseif (tieneCodigoOEM($pdo)) {
        $st->execute([
            $codigo,
            trim($in['nombre']),
            trim((string) ($in['marca'] ?? '')) ?: null,
            (string) $nombreCat,
            $precio,
        ]);
    } else {
        $st->execute([
            trim($in['nombre']),
            trim((string) ($in['marca'] ?? '')) ?: null,
            (string) $nombreCat,
            $precio,
        ]);
    }
    return ['ok' => true, 'idProducto' => (int) $pdo->lastInsertId()];
}

function actualizar(PDO $pdo, int $id, array $in): array
{
    if ($id <= 0) {
        return ['ok' => false, 'error' => 'ID inválido'];
    }
    $err = validar($in);
    if ($err) {
        return ['ok' => false, 'error' => $err];
    }
    $codigo = trim((string) ($in['codigoOEM'] ?? ''));
    if (tieneCodigoOEM($pdo)) {
        $dupCod = $pdo->prepare('SELECT idProducto FROM Producto WHERE LOWER(codigoOEM) = LOWER(?) AND idProducto <> ?');
        $dupCod->execute([$codigo, $id]);
        if ($dupCod->fetch()) {
            return ['ok' => false, 'error' => 'El código del producto ya existe.'];
        }
    }
    $idCategoria = (int) ($in['idCategoria'] ?? 0);
    $precio = round((float) ($in['precioInicial'] ?? 0), 2);
    $stCat = $pdo->prepare('SELECT nombre FROM Categoria WHERE idCategoria = ?');
    $stCat->execute([$idCategoria]);
    $nombreCat = $stCat->fetchColumn();
    if ($nombreCat === false) {
        return ['ok' => false, 'error' => 'Categoría no encontrada.'];
    }
    $st = $pdo->prepare(
        (tieneIdCategoria($pdo) && tieneCodigoOEM($pdo))
            ? 'UPDATE Producto
               SET codigoOEM = ?, nombre = ?, marca = ?, categoria = ?, precioInicial = ?, idCategoria = ?
               WHERE idProducto = ?'
            : (tieneIdCategoria($pdo)
                ? 'UPDATE Producto
                   SET nombre = ?, marca = ?, categoria = ?, precioInicial = ?, idCategoria = ?
                   WHERE idProducto = ?'
                : (tieneCodigoOEM($pdo)
                    ? 'UPDATE Producto
                       SET codigoOEM = ?, nombre = ?, marca = ?, categoria = ?, precioInicial = ?
                       WHERE idProducto = ?'
                    : 'UPDATE Producto
                       SET nombre = ?, marca = ?, categoria = ?, precioInicial = ?
                       WHERE idProducto = ?'))
    );
    if (tieneIdCategoria($pdo) && tieneCodigoOEM($pdo)) {
        $st->execute([
            $codigo,
            trim($in['nombre']),
            trim((string) ($in['marca'] ?? '')) ?: null,
            (string) $nombreCat,
            $precio,
            $idCategoria,
            $id,
        ]);
    } elseif (tieneIdCategoria($pdo)) {
        $st->execute([
            trim($in['nombre']),
            trim((string) ($in['marca'] ?? '')) ?: null,
            (string) $nombreCat,
            $precio,
            $idCategoria,
            $id,
        ]);
    } elseif (tieneCodigoOEM($pdo)) {
        $st->execute([
            $codigo,
            trim($in['nombre']),
            trim((string) ($in['marca'] ?? '')) ?: null,
            (string) $nombreCat,
            $precio,
            $id,
        ]);
    } else {
        $st->execute([
            trim($in['nombre']),
            trim((string) ($in['marca'] ?? '')) ?: null,
            (string) $nombreCat,
            $precio,
            $id,
        ]);
    }
    if ($st->rowCount() === 0) {
        $chk = $pdo->prepare('SELECT 1 FROM Producto WHERE idProducto = ?');
        $chk->execute([$id]);
        if (!$chk->fetch()) {
            return ['ok' => false, 'error' => 'Producto no encontrado'];
        }
    }
    return ['ok' => true, 'idProducto' => $id];
}

function eliminar(PDO $pdo, int $id): array
{
    if ($id <= 0) {
        return ['ok' => false, 'error' => 'ID inválido'];
    }
    $st = $pdo->prepare('SELECT COUNT(*) FROM DetalleCompra WHERE idProducto = ?');
    $st->execute([$id]);
    if ((int) $st->fetchColumn() > 0) {
        return ['ok' => false, 'error' => 'No se puede eliminar: el producto figura en compras.'];
    }
    $st2 = $pdo->prepare('SELECT COUNT(*) FROM Inventario WHERE idProducto = ?');
    $st2->execute([$id]);
    if ((int) $st2->fetchColumn() > 0) {
        return ['ok' => false, 'error' => 'No se puede eliminar: hay movimientos de inventario.'];
    }
    $del = $pdo->prepare('DELETE FROM Producto WHERE idProducto = ?');
    $del->execute([$id]);
    if ($del->rowCount() === 0) {
        return ['ok' => false, 'error' => 'Producto no encontrado'];
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
    lb_json(['ok' => false, 'error' => 'Error en productos: ' . $e->getMessage()], 500);
}
