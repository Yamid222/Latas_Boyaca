<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/config/database.php';

header('Content-Type: application/json; charset=utf-8');

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

function json_out(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function get_pdo(): PDO
{
    try {
        return lb_get_pdo();
    } catch (PDOException $e) {
        json_out(['ok' => false, 'error' => 'DB: ' . $e->getMessage()], 500);
    }
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? '';

// ── GET /api/auth.php?action=me ─────────────────────────────────────────────
if ($method === 'GET' && $action === 'me') {
    if (empty($_SESSION['lb_uid'])) {
        json_out(['ok' => false, 'auth' => false]);
    }
    $pdo = get_pdo();
    $st  = $pdo->prepare(
        'SELECT u.id, u.nombre, u.email, u.activo, r.nombre AS rol,
                GROUP_CONCAT(p.clave ORDER BY p.clave) AS permisos
         FROM lb_usuario u
         JOIN lb_rol r ON r.id = u.id_rol
         LEFT JOIN lb_rol_permiso rp ON rp.id_rol = u.id_rol
         LEFT JOIN lb_permiso p ON p.id = rp.id_permiso
         WHERE u.id = ?
         GROUP BY u.id, r.nombre'
    );
    $st->execute([$_SESSION['lb_uid']]);
    $row = $st->fetch();
    if (!$row || !$row['activo']) {
        session_destroy();
        json_out(['ok' => false, 'auth' => false]);
    }
    $row['permisos'] = $row['permisos'] ? explode(',', $row['permisos']) : [];
    json_out(['ok' => true, 'auth' => true, 'usuario' => $row]);
}

// ── POST /api/auth.php?action=login ─────────────────────────────────────────
if ($method === 'POST' && $action === 'login') {
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $email    = trim($body['email']    ?? '');
    $password = trim($body['password'] ?? '');

    if ($email === '' || $password === '') {
        json_out(['ok' => false, 'error' => 'Correo y contraseña requeridos.'], 422);
    }

    $pdo = get_pdo();
    $st  = $pdo->prepare(
        'SELECT u.id, u.nombre, u.email, u.password_hash, u.activo, r.nombre AS rol,
                GROUP_CONCAT(p.clave ORDER BY p.clave) AS permisos
         FROM lb_usuario u
         JOIN lb_rol r ON r.id = u.id_rol
         LEFT JOIN lb_rol_permiso rp ON rp.id_rol = u.id_rol
         LEFT JOIN lb_permiso p ON p.id = rp.id_permiso
         WHERE u.email = ?
         GROUP BY u.id, r.nombre'
    );
    $st->execute([$email]);
    $row = $st->fetch();

    if (!$row || !password_verify($password, $row['password_hash'])) {
        json_out(['ok' => false, 'error' => 'Correo o contraseña incorrectos.'], 401);
    }
    if (!$row['activo']) {
        json_out(['ok' => false, 'error' => 'Cuenta desactivada. Contacte al administrador.'], 403);
    }

    session_regenerate_id(true);
    $_SESSION['lb_uid'] = $row['id'];

    $row['permisos'] = $row['permisos'] ? explode(',', $row['permisos']) : [];
    unset($row['password_hash']);
    json_out(['ok' => true, 'usuario' => $row]);
}

// ── POST /api/auth.php?action=logout ────────────────────────────────────────
if ($method === 'POST' && $action === 'logout') {
    session_unset();
    session_destroy();
    json_out(['ok' => true]);
}

json_out(['ok' => false, 'error' => 'Acción no reconocida.'], 400);
