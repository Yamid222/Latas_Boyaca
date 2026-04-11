/**
 * Modelo de usuario simulado (sin base de datos).
 */
const DEMO_USER = {
  email: 'admin@latasboyaca.com',
  password: 'admin123',
};

/**
 * @param {string} email
 * @param {string} password
 * @returns {boolean}
 */
export function validateCredentials(email, password) {
  const e = String(email || '').trim().toLowerCase();
  const p = String(password || '');
  return e === DEMO_USER.email.toLowerCase() && p === DEMO_USER.password;
}
