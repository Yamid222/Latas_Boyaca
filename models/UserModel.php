<?php
declare(strict_types=1);

final class UserModel
{
    public function __construct(private readonly PDO $pdo) {}

    public function findActiveByEmail(string $email): array|false
    {
        $st = $this->pdo->prepare(
            'SELECT id, nombre, email
             FROM lb_usuario
             WHERE email = ? AND activo = 1'
        );
        $st->execute([$email]);
        return $st->fetch();
    }

    public function updatePassword(string $email, string $passwordHash): void
    {
        $this->pdo->prepare(
            'UPDATE lb_usuario SET password_hash = ? WHERE email = ? AND activo = 1'
        )->execute([$passwordHash, $email]);
    }
}
