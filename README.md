# Latas_Boyaca
primer paso en php my admyn en el apartado de sql pegan esto y le dan en continuar

------------
CREATE DATABASE IF NOT EXISTS latas_boyaca;
USE latas_boyaca;

-------
luego buelven a sql y pegan esto y le dan a continuar

-------------
-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Tiempo de generación: 27-04-2026 a las 22:40:37
-- Versión del servidor: 10.4.32-MariaDB
-- Versión de PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `latas_boyaca`
--

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `categoria`
--

CREATE TABLE `categoria` (
  `idCategoria` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `categoria`
--

INSERT INTO `categoria` (`idCategoria`, `nombre`) VALUES
(1, 'aceite'),
(5, 'espejos'),
(3, 'repuestos'),
(4, 'tmp_cat_173810');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `compra`
--

CREATE TABLE `compra` (
  `idCompra` int(11) NOT NULL,
  `idImportador` int(11) NOT NULL,
  `fecha` date DEFAULT NULL,
  `estado` enum('pendiente','en_transito','recibida') DEFAULT 'pendiente'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `compra`
--

INSERT INTO `compra` (`idCompra`, `idImportador`, `fecha`, `estado`) VALUES
(1, 2, '2026-04-18', 'pendiente'),
(2, 3, '2026-04-24', 'pendiente'),
(3, 2, '2026-04-27', 'pendiente'),
(4, 1, '2026-04-27', 'recibida');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `detallecompra`
--

CREATE TABLE `detallecompra` (
  `idDetalle` int(11) NOT NULL,
  `idCompra` int(11) NOT NULL,
  `idProducto` int(11) NOT NULL,
  `cantidad` int(11) NOT NULL,
  `precioCompra` decimal(10,2) NOT NULL,
  `valorTotal` decimal(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `detallecompra`
--

INSERT INTO `detallecompra` (`idDetalle`, `idCompra`, `idProducto`, `cantidad`, `precioCompra`, `valorTotal`) VALUES
(1, 1, 1, 30, 68000.00, 2040000.00),
(2, 2, 1, 35, 68000.00, 2380000.00),
(3, 3, 1, 12, 68000.00, 816000.00),
(4, 4, 1, 12, 68000.00, 816000.00);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `importador`
--

CREATE TABLE `importador` (
  `idImportador` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `telefono` varchar(20) DEFAULT NULL,
  `correo` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `importador`
--

INSERT INTO `importador` (`idImportador`, `nombre`, `telefono`, `correo`) VALUES
(1, 'Autopartes Boyacá', '3101234567', 'ventas@boyaca.com'),
(2, 'auto deluxe', '3224124525', 'autotodeluxe@car.com'),
(3, 'carplay', '322351651', 'ascadc@jnbahjc.com');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `inventario`
--

CREATE TABLE `inventario` (
  `idInventario` int(11) NOT NULL,
  `fechaActualizacion` datetime DEFAULT current_timestamp(),
  `idProducto` int(11) NOT NULL,
  `cantidad` int(11) NOT NULL,
  `entrada` int(11) DEFAULT 0,
  `salida` int(11) DEFAULT 0,
  `stock` int(11) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `inventario`
--

INSERT INTO `inventario` (`idInventario`, `fechaActualizacion`, `idProducto`, `cantidad`, `entrada`, `salida`, `stock`) VALUES
(1, '2026-04-27 10:46:26', 5, 20, 20, 0, 0),
(2, '2026-04-27 10:46:35', 5, 50, 50, 0, 0),
(3, '2026-04-27 10:46:54', 5, 21, 21, 0, 0),
(4, '2026-04-27 15:20:50', 1, 12, 12, 0, 0);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `producto`
--

CREATE TABLE `producto` (
  `idProducto` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `marca` varchar(100) DEFAULT NULL,
  `tipoAlbergue` varchar(100) DEFAULT NULL,
  `categoria` varchar(100) DEFAULT NULL,
  `codigoOEM` varchar(50) DEFAULT NULL,
  `vehiculoCompatible` varchar(150) DEFAULT NULL,
  `precioInicial` decimal(10,2) DEFAULT NULL,
  `estado` tinyint(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `producto`
--

INSERT INTO `producto` (`idProducto`, `nombre`, `marca`, `tipoAlbergue`, `categoria`, `codigoOEM`, `vehiculoCompatible`, `precioInicial`, `estado`) VALUES
(1, 'aceite', 'iphone', NULL, 'aceite', NULL, NULL, 75000.00, 1),
(2, 'aceite', 'yamaha', NULL, 'aceite', NULL, NULL, 0.00, 1),
(3, 'cunas', 'bmw', NULL, 'aceites', NULL, NULL, 200000.00, 1),
(4, 'RACIN', 'iphone', NULL, 'aceites', NULL, NULL, 72500.00, 1),
(5, 'cunas', 'porche', NULL, 'lata', NULL, NULL, 250000.00, 1),
(6, 'tmp_prod_173812', 'm', NULL, 'tmp_cat_173810', NULL, NULL, 1234.00, 1),
(7, 'cunasrr', 'bmw', NULL, 'repuestos', NULL, NULL, 250222.00, 1);

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `categoria`
--
ALTER TABLE `categoria`
  ADD PRIMARY KEY (`idCategoria`),
  ADD UNIQUE KEY `nombre` (`nombre`);

--
-- Indices de la tabla `compra`
--
ALTER TABLE `compra`
  ADD PRIMARY KEY (`idCompra`),
  ADD KEY `idImportador` (`idImportador`);

--
-- Indices de la tabla `detallecompra`
--
ALTER TABLE `detallecompra`
  ADD PRIMARY KEY (`idDetalle`),
  ADD KEY `idCompra` (`idCompra`),
  ADD KEY `idProducto` (`idProducto`);

--
-- Indices de la tabla `importador`
--
ALTER TABLE `importador`
  ADD PRIMARY KEY (`idImportador`);

--
-- Indices de la tabla `inventario`
--
ALTER TABLE `inventario`
  ADD PRIMARY KEY (`idInventario`),
  ADD KEY `idProducto` (`idProducto`);

--
-- Indices de la tabla `producto`
--
ALTER TABLE `producto`
  ADD PRIMARY KEY (`idProducto`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `categoria`
--
ALTER TABLE `categoria`
  MODIFY `idCategoria` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT de la tabla `compra`
--
ALTER TABLE `compra`
  MODIFY `idCompra` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT de la tabla `detallecompra`
--
ALTER TABLE `detallecompra`
  MODIFY `idDetalle` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT de la tabla `importador`
--
ALTER TABLE `importador`
  MODIFY `idImportador` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT de la tabla `inventario`
--
ALTER TABLE `inventario`
  MODIFY `idInventario` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT de la tabla `producto`
--
ALTER TABLE `producto`
  MODIFY `idProducto` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `compra`
--
ALTER TABLE `compra`
  ADD CONSTRAINT `compra_ibfk_1` FOREIGN KEY (`idImportador`) REFERENCES `importador` (`idImportador`);

--
-- Filtros para la tabla `detallecompra`
--
ALTER TABLE `detallecompra`
  ADD CONSTRAINT `detallecompra_ibfk_1` FOREIGN KEY (`idCompra`) REFERENCES `compra` (`idCompra`) ON DELETE CASCADE,
  ADD CONSTRAINT `detallecompra_ibfk_2` FOREIGN KEY (`idProducto`) REFERENCES `producto` (`idProducto`);

--
-- Filtros para la tabla `inventario`
--
ALTER TABLE `inventario`
  ADD CONSTRAINT `inventario_ibfk_1` FOREIGN KEY (`idProducto`) REFERENCES `producto` (`idProducto`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

