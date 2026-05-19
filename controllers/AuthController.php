<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/models/UserModel.php';
require_once dirname(__DIR__) . '/models/RecoveryTokenModel.php';
require_once dirname(__DIR__) . '/services/Mailer.php';

final class AuthController
{
    private UserModel          $users;
    private RecoveryTokenModel $tokens;
    private Mailer             $mailer;

    public function __construct(private readonly PDO $pdo)
    {
        $this->users  = new UserModel($pdo);
        $this->tokens = new RecoveryTokenModel($pdo);
        $this->mailer = new Mailer();
    }

    // ── Recuperación de contraseña: solicitar código ──────────────────────────
    public function requestCode(string $email): array
    {
        $email = trim($email);
        if ($email === '') return $this->fail('El correo es requerido.', 422);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) return $this->fail('Formato de correo inválido.', 422);

        $genericOk = $this->ok('Si el correo está registrado, recibirás un código en breve.');

        $user = $this->users->findActiveByEmail($email);
        if (!$user) return $genericOk;

        $this->tokens->invalidatePrevious($email, RecoveryTokenModel::PROP_RECUPERACION);
        $codigo    = $this->generarCodigo();
        $expiresAt = date('Y-m-d H:i:s', strtotime('+15 minutes'));
        $this->tokens->create($email, $codigo, $expiresAt, RecoveryTokenModel::PROP_RECUPERACION);

        try {
            $this->mailer->sendRecoveryCode($email, $user['nombre'], $codigo);
        } catch (Throwable $e) {
            error_log('[LatasBoyaca][SMTP] ' . $e->getMessage());
            return $this->fail('No se pudo enviar el correo. Intenta de nuevo más tarde.', 500);
        }

        return $genericOk;
    }

    // ── Recuperación de contraseña: verificar código y cambiar contraseña ─────
    public function verifyCode(string $email, string $codigo, string $password): array
    {
        $email    = trim($email);
        $codigo   = trim($codigo);
        $password = trim($password);

        if ($email === '' || $codigo === '' || $password === '') {
            return $this->fail('Correo, código y contraseña son requeridos.', 422);
        }
        if (strlen($password) < 6) {
            return $this->fail('La contraseña debe tener al menos 6 caracteres.', 422);
        }

        $result = $this->validarToken($email, $codigo, RecoveryTokenModel::PROP_RECUPERACION);
        if ($result !== true) return $result;

        $tokenRow = $this->tokens->findActiveByEmail($email, RecoveryTokenModel::PROP_RECUPERACION);

        $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
        try {
            $this->pdo->beginTransaction();
            $this->users->updatePassword($email, $hash);
            $this->tokens->markUsed((int) $tokenRow['id']);
            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            error_log('[LatasBoyaca][DB] verifyCode: ' . $e->getMessage());
            return $this->fail('Error al actualizar la contraseña.', 500);
        }

        return $this->ok('Contraseña actualizada correctamente.');
    }

    // ── Verificación de correo: solicitar código ──────────────────────────────
    public function requestEmailVerify(string $email): array
    {
        $email = trim($email);
        if ($email === '') return $this->fail('El correo es requerido.', 422);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) return $this->fail('Formato de correo inválido.', 422);

        $this->tokens->invalidatePrevious($email, RecoveryTokenModel::PROP_VERIFICAR_EMAIL);
        $codigo    = $this->generarCodigo();
        $expiresAt = date('Y-m-d H:i:s', strtotime('+15 minutes'));
        $this->tokens->create($email, $codigo, $expiresAt, RecoveryTokenModel::PROP_VERIFICAR_EMAIL);

        try {
            $this->mailer->sendEmailVerification($email, $codigo);
        } catch (Throwable $e) {
            error_log('[LatasBoyaca][SMTP] requestEmailVerify: ' . $e->getMessage());
            return $this->fail('No se pudo enviar el correo de verificación. Revisa que el correo sea válido.', 500);
        }

        return $this->ok('Código enviado. Revisa la bandeja de entrada del correo ingresado.');
    }

    // ── Verificación de correo: confirmar código ──────────────────────────────
    public function verifyEmail(string $email, string $codigo): array
    {
        $email  = trim($email);
        $codigo = trim($codigo);

        if ($email === '' || $codigo === '') {
            return $this->fail('Correo y código son requeridos.', 422);
        }

        $result = $this->validarToken($email, $codigo, RecoveryTokenModel::PROP_VERIFICAR_EMAIL);
        if ($result !== true) return $result;

        $tokenRow = $this->tokens->findActiveByEmail($email, RecoveryTokenModel::PROP_VERIFICAR_EMAIL);
        $this->tokens->markUsed((int) $tokenRow['id']);

        return $this->ok('Correo verificado correctamente.');
    }

    // ── Helpers privados ──────────────────────────────────────────────────────

    /** Valida token activo, límite de intentos y código. Retorna true si todo ok, array de error si no. */
    private function validarToken(string $email, string $codigo, string $proposito): true|array
    {
        $tokenRow = $this->tokens->findActiveByEmail($email, $proposito);
        if (!$tokenRow) {
            return $this->fail('No hay código activo o ha expirado. Solicita uno nuevo.', 422);
        }

        $intentos = (int) $tokenRow['intentos'];
        if ($intentos >= RecoveryTokenModel::MAX_ATTEMPTS) {
            return $this->fail('Demasiados intentos fallidos. Solicita un nuevo código.', 429);
        }

        if (!hash_equals($tokenRow['token'], $codigo)) {
            $this->tokens->incrementAttempts((int) $tokenRow['id']);
            $restantes = RecoveryTokenModel::MAX_ATTEMPTS - $intentos - 1;
            return $this->fail("Código incorrecto. Te quedan $restantes intento(s).", 422);
        }

        return true;
    }

    private function generarCodigo(): string
    {
        return str_pad((string) random_int(0, 999_999), 6, '0', STR_PAD_LEFT);
    }

    private function ok(string $mensaje): array
    {
        return ['ok' => true, 'mensaje' => $mensaje, '_httpCode' => 200];
    }

    private function fail(string $error, int $httpCode): array
    {
        return ['ok' => false, 'error' => $error, '_httpCode' => $httpCode];
    }
}
