<?php
declare(strict_types=1);

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as MailerException;

require_once dirname(__DIR__) . '/vendor/autoload.php';

/**
 * Wrapper de PHPMailer para Latas Boyacá.
 * Usa la configuración de config/mail.php.
 * Lanza RuntimeException si el envío falla.
 */
final class Mailer
{
    private array $cfg;

    public function __construct()
    {
        $cfgPath = dirname(__DIR__) . '/config/mail.php';
        if (!file_exists($cfgPath)) {
            throw new RuntimeException('Archivo config/mail.php no encontrado. Cópialo de config/mail.example.php y completa las credenciales.');
        }
        $this->cfg = require $cfgPath;
    }

    /**
     * Correo de recuperación de contraseña.
     * @throws RuntimeException si SMTP falla
     */
    public function sendRecoveryCode(string $toEmail, string $toName, string $code): void
    {
        $this->send(
            $toEmail,
            $toName,
            'Latas Boyacá — Código de recuperación',
            $this->buildHtml($toName, $code, 'recuperación de contraseña'),
            $this->buildPlainText($toName, $code, 'recuperación de contraseña')
        );
    }

    /**
     * Correo de verificación de correo electrónico nuevo.
     * @throws RuntimeException si SMTP falla
     */
    public function sendEmailVerification(string $toEmail, string $code): void
    {
        $this->send(
            $toEmail,
            '',
            'Latas Boyacá — Verifica tu correo',
            $this->buildHtml('', $code, 'verificación de correo'),
            $this->buildPlainText('', $code, 'verificación de correo')
        );
    }

    private function send(string $toEmail, string $toName, string $subject, string $html, string $plain): void
    {
        $mail = $this->buildMailer();
        $mail->addAddress($toEmail, $toName);
        $mail->Subject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        $mail->isHTML(true);
        $mail->Body    = $html;
        $mail->AltBody = $plain;
        try {
            $mail->send();
        } catch (MailerException $e) {
            throw new RuntimeException('Error SMTP: ' . $mail->ErrorInfo);
        }
    }

    private function buildMailer(): PHPMailer
    {
        $mail = new PHPMailer(true);

        // Servidor SMTP
        $mail->isSMTP();
        $mail->Host        = $this->cfg['host'];
        $mail->SMTPAuth    = true;
        $mail->Username    = $this->cfg['username'];
        $mail->Password    = $this->cfg['password'];
        $mail->SMTPSecure  = PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port        = $this->cfg['port'];
        $mail->Timeout     = $this->cfg['timeout'] ?? 30;

        // Codificación
        $mail->CharSet  = PHPMailer::CHARSET_UTF8;
        $mail->Encoding = PHPMailer::ENCODING_BASE64;

        // Remitente
        $mail->setFrom($this->cfg['from_email'], $this->cfg['from_name']);

        return $mail;
    }

    private function buildPlainText(string $nombre, string $code, string $motivo): string
    {
        $saludo = $nombre !== '' ? "Hola, $nombre." : 'Hola.';
        return <<<TXT
        $saludo

        Tu código de $motivo para Latas Boyacá es:

            $code

        Este código expira en 15 minutos.
        Si no solicitaste este código, ignora este mensaje.

        — Latas Boyacá
        TXT;
    }

    private function buildHtml(string $nombre, string $code, string $motivo): string
    {
        $year  = date('Y');
        $safe  = $nombre !== '' ? htmlspecialchars($nombre, ENT_QUOTES, 'UTF-8') : '';
        $saludo = $safe !== '' ? "Hola, <strong>$safe</strong>," : 'Hola,';
        $safMotivo = htmlspecialchars($motivo, ENT_QUOTES, 'UTF-8');

        return <<<HTML
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width,initial-scale=1.0">
          <title>Código de verificación</title>
        </head>
        <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="background-color:#f3f4f6;padding:40px 16px;">
            <tr>
              <td align="center">
                <table role="presentation" width="520" cellpadding="0" cellspacing="0"
                       style="background:#ffffff;border-radius:10px;overflow:hidden;
                              box-shadow:0 4px 12px rgba(0,0,0,.10);max-width:100%;">

                  <!-- ── Cabecera ── -->
                  <tr>
                    <td style="background:#1d4ed8;padding:30px 40px;text-align:center;">
                      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;
                                 letter-spacing:.4px;">Latas Boyacá</h1>
                      <p style="margin:6px 0 0;color:#bfdbfe;font-size:13px;">
                        Sistema de Administración
                      </p>
                    </td>
                  </tr>

                  <!-- ── Cuerpo ── -->
                  <tr>
                    <td style="padding:36px 40px 30px;">
                      <p style="margin:0 0 10px;color:#111827;font-size:15px;">
                        $saludo
                      </p>
                      <p style="margin:0 0 26px;color:#6b7280;font-size:14px;line-height:1.7;">
                        Tu código de <strong>$safMotivo</strong> es el siguiente.<br>
                        Expira en <strong>15 minutos</strong>.
                      </p>

                      <!-- Bloque del código -->
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                             style="margin-bottom:26px;">
                        <tr>
                          <td align="center">
                            <div style="display:inline-block;background:#eff6ff;
                                        border:2px dashed #3b82f6;border-radius:12px;
                                        padding:18px 52px;">
                              <span style="font-family:'Courier New',Courier,monospace;
                                           font-size:40px;font-weight:700;color:#1d4ed8;
                                           letter-spacing:12px;">$code</span>
                            </div>
                          </td>
                        </tr>
                      </table>

                      <!-- Aviso de seguridad -->
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                             style="background:#fefce8;border-left:4px solid #f59e0b;
                                    border-radius:4px;margin-bottom:10px;">
                        <tr>
                          <td style="padding:12px 16px;color:#92400e;font-size:13px;line-height:1.5;">
                            ⚠️ Si no solicitaste este código, ignora este mensaje.<br>
                            Tu contraseña no cambiará.
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <!-- ── Pie ── -->
                  <tr>
                    <td style="background:#f9fafb;padding:16px 40px;
                               border-top:1px solid #e5e7eb;text-align:center;">
                      <p style="margin:0;color:#9ca3af;font-size:12px;">
                        © $year Latas Boyacá &nbsp;·&nbsp; Mensaje automático — no responder.
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
        HTML;
    }
}
