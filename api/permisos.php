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

$pdo = lb_pdo();

$rows = $pdo->query(
    'SELECT id, clave, etiqueta, modulo, descripcion FROM lb_permiso ORDER BY modulo, etiqueta'
)->fetchAll();

lb_json(['ok' => true, 'permisos' => $rows]);
