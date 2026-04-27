<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/models/InventarioModel.php';

final class InventarioController
{
    private InventarioModel $model;

    public function __construct(InventarioModel $model)
    {
        $this->model = $model;
    }

    public function listarProductos(): array
    {
        $rows = $this->model->obtenerProductos();
        foreach ($rows as &$row) {
            $stock = (int) ($row['stock'] ?? 0);
            $row['estadoStock'] = $stock > 20 ? 'OK' : 'Bajo';
        }
        unset($row);
        return ['ok' => true, 'productos' => $rows];
    }

    public function crearProductoInventario(array $in): array
    {
        $idProducto = isset($in['idProducto']) ? (int) $in['idProducto'] : 0;
        $cantidad = isset($in['cantidad']) ? (int) $in['cantidad'] : 0;

        if ($idProducto <= 0) {
            return ['ok' => false, 'error' => 'Seleccione un producto válido.'];
        }
        if ($cantidad <= 0) {
            return ['ok' => false, 'error' => 'La cantidad debe ser mayor a cero.'];
        }
        if (!$this->model->existeProducto($idProducto)) {
            return ['ok' => false, 'error' => 'El producto seleccionado no existe.'];
        }

        try {
            $this->model->registrarEntradaProductoExistente($idProducto, $cantidad);
        } catch (Throwable $e) {
            return ['ok' => false, 'error' => $e->getMessage()];
        }

        return [
            'ok' => true,
            'mensaje' => 'Entrada de inventario registrada correctamente.',
            'idProducto' => $idProducto,
        ];
    }
}
