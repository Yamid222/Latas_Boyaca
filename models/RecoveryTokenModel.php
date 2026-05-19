<?php
declare(strict_types=1);

final class RecoveryTokenModel
{
    public const MAX_ATTEMPTS = 5;

    public const PROP_RECUPERACION     = 'recuperacion';
    public const PROP_VERIFICAR_EMAIL  = 'verificar_email';

    public function __construct(private readonly PDO $pdo) {}

    /** Invalida todos los tokens activos previos del correo para un propósito dado. */
    public function invalidatePrevious(string $email, string $proposito): void
    {
        $this->pdo->prepare(
            'UPDATE lb_recovery_token SET usado = 1 WHERE email = ? AND proposito = ? AND usado = 0'
        )->execute([$email, $proposito]);
    }

    /** Inserta un nuevo token con expiración y propósito. */
    public function create(string $email, string $token, string $expiresAt, string $proposito): void
    {
        $this->pdo->prepare(
            'INSERT INTO lb_recovery_token (email, proposito, token, expires_at) VALUES (?, ?, ?, ?)'
        )->execute([$email, $proposito, $token, $expiresAt]);
    }

    /**
     * Busca el token activo más reciente para el correo y propósito.
     * Retorna id, token e intentos — sin validar el código todavía,
     * para poder incrementar intentos en caso de código incorrecto.
     */
    public function findActiveByEmail(string $email, string $proposito): array|false
    {
        $st = $this->pdo->prepare(
            'SELECT id, token, intentos
             FROM lb_recovery_token
             WHERE email = ? AND proposito = ? AND usado = 0 AND expires_at > NOW()
             ORDER BY id DESC LIMIT 1'
        );
        $st->execute([$email, $proposito]);
        return $st->fetch();
    }

    /** Incrementa el contador de intentos fallidos. */
    public function incrementAttempts(int $id): void
    {
        $this->pdo->prepare(
            'UPDATE lb_recovery_token SET intentos = intentos + 1 WHERE id = ?'
        )->execute([$id]);
    }

    /** Marca el token como usado (no reutilizable). */
    public function markUsed(int $id): void
    {
        $this->pdo->prepare(
            'UPDATE lb_recovery_token SET usado = 1 WHERE id = ?'
        )->execute([$id]);
    }
}
