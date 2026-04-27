<?php
declare(strict_types=1);

final class InventarioModel
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function obtenerProductos(): array
    {
        $st = $this->pdo->query(
            'SELECT
                p.idProducto,
                p.nombre,
                p.marca,
                p.categoria,
                p.codigoOEM,
                p.precioInicial,
                p.estado,
                COALESCE(SUM(i.entrada - i.salida), 0) AS stock
             FROM Producto p
             LEFT JOIN Inventario i ON i.idProducto = p.idProducto
             GROUP BY p.idProducto, p.nombre, p.marca, p.categoria, p.codigoOEM, p.precioInicial, p.estado
             ORDER BY nombre ASC, idProducto ASC'
        );
        return $st->fetchAll();
    }

    public function existeProducto(int $idProducto): bool
    {
        $st = $this->pdo->prepare('SELECT 1 FROM Producto WHERE idProducto = ?');
        $st->execute([$idProducto]);
        return (bool) $st->fetchColumn();
    }

    public function registrarEntradaProductoExistente(int $idProducto, int $cantidad): void
    {
        $this->pdo->beginTransaction();
        try {
            if (!$this->existeProducto($idProducto)) {
                throw new RuntimeException('Producto no encontrado.');
            }

            $ins = $this->pdo->prepare(
                'INSERT INTO Inventario (idProducto, cantidad, entrada, salida, fechaActualizacion)
                 VALUES (?, ?, ?, 0, NOW())'
            );
            $ins->execute([$idProducto, $cantidad, $cantidad]);

            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }
}
