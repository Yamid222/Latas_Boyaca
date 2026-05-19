<?php
/**
 * Ejemplo de configuración SMTP.
 * Copia este archivo a config/mail.php y completa los valores reales.
 * Este archivo SÍ puede subirse al repositorio (no contiene credenciales).
 */
declare(strict_types=1);

return [
    'host'       => 'smtp.gmail.com',            // Gmail: smtp.gmail.com | Outlook: smtp-mail.outlook.com
    'port'       => 587,                          // Puerto TLS
    'encryption' => 'tls',                        // Cifrado: 'tls' (STARTTLS) o 'ssl'
    'username'   => 'tu@correo.com',              // Cuenta de correo
    'password'   => 'TU_CONTRASEÑA_AQUI',         // Contraseña de la cuenta / app password
    'from_email' => 'tu@correo.com',              // Dirección del remitente
    'from_name'  => 'Latas Boyacá',               // Nombre del remitente
    'timeout'    => 30,                            // Timeout en segundos
];
