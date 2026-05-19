<?php
/**
 * CRUD Producto (adaptado a categoria por FK)
 */
declare(strict_types=1);

require_once __DIR__ . '/lib.php';

function listar(PDO $pdo): array
{
    $rows = $pdo->query(
        'SELECT idProducto, codigoOEM, nombre, marca, lineaVehiculo, modelo, descripcion, categoria, condicionProducto, precioInicial
         FROM Producto
         ORDER BY nombre'
    )->fetchAll();
    return ['ok' => true, 'productos' => $rows];
}

function uno(PDO $pdo, int $id): array
{
    $st = $pdo->prepare(
        'SELECT idProducto, codigoOEM, nombre, marca, lineaVehiculo, modelo, descripcion, categoria, condicionProducto, precioInicial
         FROM Producto
         WHERE idProducto = ?'
    );
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
    $modelo = trim((string) ($in['modelo'] ?? ''));
    if ($modelo === '') {
        return 'El modelo es obligatorio.';
    }
    $precio = isset($in['precioInicial']) ? (float) $in['precioInicial'] : 0;
    if ($precio < 0) {
        return 'El precio no puede ser negativo.';
    }
    $condicion = trim((string) ($in['condicionProducto'] ?? ''));
    if (!in_array($condicion, ['nuevo', 'segunda mano'], true)) {
        return 'La condición debe ser "nuevo" o "segunda mano".';
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
    $dup = $pdo->prepare('SELECT idProducto FROM Producto WHERE LOWER(codigoOEM) = LOWER(?)');
    $dup->execute([$codigo]);
    if ($dup->fetch()) {
        return ['ok' => false, 'error' => 'El código del producto ya existe.'];
    }
    $modelo = trim((string) ($in['modelo'] ?? ''));
    $pdo->prepare(
        'INSERT INTO Producto (codigoOEM, nombre, marca, lineaVehiculo, modelo, descripcion, categoria, precioInicial, condicionProducto)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        $codigo,
        $modelo,
        trim((string) ($in['marca'] ?? '')) ?: null,
        trim((string) ($in['lineaVehiculo'] ?? '')) ?: null,
        $modelo,
        trim((string) ($in['descripcion'] ?? '')) ?: null,
        trim((string) ($in['categoria'] ?? '')) ?: null,
        round((float) ($in['precioInicial'] ?? 0), 2),
        trim((string) ($in['condicionProducto'] ?? 'nuevo')),
    ]);
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
    $dup = $pdo->prepare('SELECT idProducto FROM Producto WHERE LOWER(codigoOEM) = LOWER(?) AND idProducto <> ?');
    $dup->execute([$codigo, $id]);
    if ($dup->fetch()) {
        return ['ok' => false, 'error' => 'El código del producto ya existe.'];
    }
    $modelo = trim((string) ($in['modelo'] ?? ''));
    $st = $pdo->prepare(
        'UPDATE Producto
         SET codigoOEM = ?, nombre = ?, marca = ?, lineaVehiculo = ?, modelo = ?, descripcion = ?, categoria = ?, precioInicial = ?, condicionProducto = ?
         WHERE idProducto = ?'
    );
    $st->execute([
        $codigo,
        $modelo,
        trim((string) ($in['marca'] ?? '')) ?: null,
        trim((string) ($in['lineaVehiculo'] ?? '')) ?: null,
        $modelo,
        trim((string) ($in['descripcion'] ?? '')) ?: null,
        trim((string) ($in['categoria'] ?? '')) ?: null,
        round((float) ($in['precioInicial'] ?? 0), 2),
        trim((string) ($in['condicionProducto'] ?? 'nuevo')),
        $id,
    ]);
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

$pdo = lb_pdo();

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
    lb_json_sql_error($e, 'Error en productos:');
}
