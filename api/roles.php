<?php
declare(strict_types=1);

require_once __DIR__ . '/lib.php';

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Strict']);
    session_start();
}

if (empty($_SESSION['lb_uid'])) {
    lb_json(['ok' => false, 'error' => 'No autenticado.'], 401);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$pdo    = lb_pdo();

// Verificar permiso
$stPerm = $pdo->prepare(
    'SELECT COUNT(*) FROM lb_usuario u
     JOIN lb_rol_permiso rp ON rp.id_rol = u.id_rol
     JOIN lb_permiso p ON p.id = rp.id_permiso
     WHERE u.id = ? AND p.clave = ?'
);
$stPerm->execute([$_SESSION['lb_uid'], 'gestionar_cuentas']);
if ((int)$stPerm->fetchColumn() === 0) {
    lb_json(['ok' => false, 'error' => 'Sin permiso para gestionar roles.'], 403);
}

// ── GET — listar roles con sus permisos ─────────────────────────────────────
if ($method === 'GET') {
    $roles = $pdo->query(
        'SELECT r.id, r.nombre, r.descripcion, r.es_sistema,
                GROUP_CONCAT(p.clave ORDER BY p.clave) AS permisos
         FROM lb_rol r
         LEFT JOIN lb_rol_permiso rp ON rp.id_rol = r.id
         LEFT JOIN lb_permiso p ON p.id = rp.id_permiso
         GROUP BY r.id ORDER BY r.nombre'
    )->fetchAll();

    foreach ($roles as &$r) {
        $r['permisos'] = $r['permisos'] ? explode(',', $r['permisos']) : [];
        $r['es_sistema'] = (bool)$r['es_sistema'];
    }
    lb_json(['ok' => true, 'roles' => $roles]);
}

// ── POST — crear rol ─────────────────────────────────────────────────────────
if ($method === 'POST') {
    $b          = json_decode(file_get_contents('php://input'), true) ?? [];
    $nombre     = trim($b['nombre']      ?? '');
    $descripcion= trim($b['descripcion'] ?? '');
    $permisos   = $b['permisos'] ?? [];

    if ($nombre === '') lb_json(['ok' => false, 'error' => 'El nombre del rol es requerido.'], 422);

    try {
        $pdo->beginTransaction();
        $st = $pdo->prepare('INSERT INTO lb_rol (nombre, descripcion) VALUES (?,?)');
        $st->execute([$nombre, $descripcion ?: null]);
        $id_rol = (int)$pdo->lastInsertId();

        if (!empty($permisos)) {
            $stP = $pdo->prepare('INSERT IGNORE INTO lb_rol_permiso (id_rol, id_permiso) SELECT ?, id FROM lb_permiso WHERE clave = ?');
            foreach ($permisos as $clave) {
                $stP->execute([$id_rol, $clave]);
            }
        }
        $pdo->commit();
        lb_json(['ok' => true, 'id' => $id_rol]);
    } catch (PDOException $e) {
        $pdo->rollBack();
        if (str_contains($e->getMessage(), 'Duplicate')) {
            lb_json(['ok' => false, 'error' => 'Ya existe un rol con ese nombre.'], 409);
        }
        lb_json_sql_error($e, 'Error al crear rol.');
    }
}

// ── PUT — actualizar rol ─────────────────────────────────────────────────────
if ($method === 'PUT') {
    $b          = json_decode(file_get_contents('php://input'), true) ?? [];
    $id         = (int)($b['id']          ?? 0);
    $nombre     = trim($b['nombre']       ?? '');
    $descripcion= trim($b['descripcion']  ?? '');
    $permisos   = $b['permisos']          ?? null;

    if ($id === 0) lb_json(['ok' => false, 'error' => 'id requerido.'], 422);

    $rowCheck = $pdo->prepare('SELECT es_sistema FROM lb_rol WHERE id = ?');
    $rowCheck->execute([$id]);
    $rolCheck = $rowCheck->fetch();
    if ($rolCheck && $rolCheck['es_sistema']) {
        lb_json(['ok' => false, 'error' => 'El rol Super Admin no puede modificarse.'], 403);
    }

    try {
        $pdo->beginTransaction();
        if ($nombre !== '') {
            $pdo->prepare('UPDATE lb_rol SET nombre=?, descripcion=? WHERE id=?')
                ->execute([$nombre, $descripcion ?: null, $id]);
        }

        if ($permisos !== null) {
            $pdo->prepare('DELETE FROM lb_rol_permiso WHERE id_rol = ?')->execute([$id]);
            if (!empty($permisos)) {
                $stP = $pdo->prepare('INSERT IGNORE INTO lb_rol_permiso (id_rol, id_permiso) SELECT ?, id FROM lb_permiso WHERE clave = ?');
                foreach ($permisos as $clave) {
                    $stP->execute([$id, $clave]);
                }
            }
        }
        $pdo->commit();
        lb_json(['ok' => true]);
    } catch (PDOException $e) {
        $pdo->rollBack();
        lb_json_sql_error($e, 'Error al actualizar rol.');
    }
}

// ── DELETE — eliminar rol (solo si no es de sistema y no tiene usuarios) ─────
if ($method === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    if ($id === 0) lb_json(['ok' => false, 'error' => 'id requerido.'], 422);

    $row = $pdo->query("SELECT es_sistema FROM lb_rol WHERE id = $id")->fetch();
    if (!$row) lb_json(['ok' => false, 'error' => 'Rol no encontrado.'], 404);
    if ($row['es_sistema']) lb_json(['ok' => false, 'error' => 'No se puede eliminar un rol de sistema.'], 422);

    $count = (int)$pdo->query("SELECT COUNT(*) FROM lb_usuario WHERE id_rol = $id")->fetchColumn();
    if ($count > 0) lb_json(['ok' => false, 'error' => "Este rol tiene $count usuario(s) asignado(s). Reasígnalos antes de eliminar."], 422);

    $pdo->prepare('DELETE FROM lb_rol WHERE id = ?')->execute([$id]);
    lb_json(['ok' => true]);
}

lb_json(['ok' => false, 'error' => 'Método no permitido.'], 405);
