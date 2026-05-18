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
    lb_json(['ok' => false, 'error' => 'Sin permiso para gestionar cuentas.'], 403);
}

// ── GET — listar usuarios ────────────────────────────────────────────────────
if ($method === 'GET') {
    $rows = $pdo->query(
        'SELECT u.id, u.nombre, u.email, u.activo, u.creado_en,
                r.id AS id_rol, r.nombre AS rol
         FROM lb_usuario u JOIN lb_rol r ON r.id = u.id_rol
         ORDER BY u.nombre'
    )->fetchAll();
    lb_json(['ok' => true, 'usuarios' => $rows]);
}

// ── POST — crear usuario ─────────────────────────────────────────────────────
if ($method === 'POST') {
    $b = json_decode(file_get_contents('php://input'), true) ?? [];
    $nombre   = trim($b['nombre']   ?? '');
    $email    = trim($b['email']    ?? '');
    $password = trim($b['password'] ?? '');
    $id_rol   = (int)($b['id_rol']  ?? 0);

    if ($nombre === '' || $email === '' || $password === '' || $id_rol === 0) {
        lb_json(['ok' => false, 'error' => 'Campos requeridos: nombre, email, password, id_rol.'], 422);
    }
    if (strlen($password) < 6) {
        lb_json(['ok' => false, 'error' => 'La contraseña debe tener al menos 6 caracteres.'], 422);
    }

    $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
    try {
        $st = $pdo->prepare('INSERT INTO lb_usuario (nombre, email, password_hash, id_rol) VALUES (?,?,?,?)');
        $st->execute([$nombre, $email, $hash, $id_rol]);
        lb_json(['ok' => true, 'id' => (int)$pdo->lastInsertId()]);
    } catch (PDOException $e) {
        if (str_contains($e->getMessage(), 'Duplicate')) {
            lb_json(['ok' => false, 'error' => 'Ya existe un usuario con ese correo.'], 409);
        }
        lb_json_sql_error($e, 'Error al crear usuario.');
    }
}

// ── PUT — actualizar usuario ─────────────────────────────────────────────────
if ($method === 'PUT') {
    $b      = json_decode(file_get_contents('php://input'), true) ?? [];
    $id     = (int)($b['id']     ?? 0);
    $nombre = trim($b['nombre']  ?? '');
    $email  = trim($b['email']   ?? '');
    $id_rol = (int)($b['id_rol'] ?? 0);
    $activo = isset($b['activo']) ? (int)(bool)$b['activo'] : null;

    if ($id === 0) lb_json(['ok' => false, 'error' => 'id requerido.'], 422);

    $sets  = [];
    $vals  = [];
    if ($nombre !== '') { $sets[] = 'nombre = ?';      $vals[] = $nombre; }
    if ($email  !== '') { $sets[] = 'email = ?';       $vals[] = $email;  }
    if ($id_rol  >  0)  { $sets[] = 'id_rol = ?';      $vals[] = $id_rol; }
    if ($activo !== null){ $sets[] = 'activo = ?';     $vals[] = $activo; }

    if (!empty($b['password']) && trim($b['password']) !== '') {
        if (strlen(trim($b['password'])) < 6) {
            lb_json(['ok' => false, 'error' => 'La contraseña debe tener al menos 6 caracteres.'], 422);
        }
        $sets[] = 'password_hash = ?';
        $vals[] = password_hash(trim($b['password']), PASSWORD_BCRYPT, ['cost' => 12]);
    }

    if (empty($sets)) lb_json(['ok' => false, 'error' => 'Nada que actualizar.'], 422);
    $vals[] = $id;

    try {
        $pdo->prepare('UPDATE lb_usuario SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($vals);
        lb_json(['ok' => true]);
    } catch (PDOException $e) {
        if (str_contains($e->getMessage(), 'Duplicate')) {
            lb_json(['ok' => false, 'error' => 'Ya existe un usuario con ese correo.'], 409);
        }
        lb_json_sql_error($e, 'Error al actualizar usuario.');
    }
}

// ── DELETE — desactivar (soft delete) ───────────────────────────────────────
if ($method === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    if ($id === 0) lb_json(['ok' => false, 'error' => 'id requerido.'], 422);
    if ($id === (int)$_SESSION['lb_uid']) {
        lb_json(['ok' => false, 'error' => 'No puedes desactivar tu propia cuenta.'], 422);
    }
    $pdo->prepare('UPDATE lb_usuario SET activo = 0 WHERE id = ?')->execute([$id]);
    lb_json(['ok' => true]);
}

lb_json(['ok' => false, 'error' => 'Método no permitido.'], 405);
