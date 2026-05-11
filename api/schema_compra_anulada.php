<?php
declare(strict_types=1);

function lb_ensure_compra_anulada(PDO $pdo): void
{
    static $ok = false;
    if ($ok) {
        return;
    }
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS CompraAnulada (
            id INT AUTO_INCREMENT PRIMARY KEY,
            idCompra INT NOT NULL,
            anulado_en DATETIME NOT NULL,
            fecha_compra DATE NULL,
            idImportador INT NULL,
            nombre_importador VARCHAR(200) NULL,
            estado VARCHAR(32) NOT NULL,
            total DECIMAL(18,2) NOT NULL DEFAULT 0,
            detalle_json MEDIUMTEXT NULL,
            KEY idx_anulado_en (anulado_en),
            KEY idx_fecha_compra (fecha_compra),
            KEY idx_id_compra (idCompra)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $ok = true;
}
