/**
 * Si editas views/*.html y abres la app sin servidor (file://), ejecuta:
 *   node assets/js/build-view-bundles.mjs
 * para actualizar viewFallbacks.mjs.
 */
const VIEW_FILES = {
  login: '../../views/login.html',
  dashboard: '../../views/dashboard.html',
};

let cachedFallbacks = null;

async function getFallbacks() {
  if (!cachedFallbacks) {
    cachedFallbacks = await import('./viewFallbacks.mjs');
  }
  return cachedFallbacks;
}

/**
 * Carga HTML de vistas: intenta fetch (HTTP) y, si falla (file://, CORS, 404),
 * usa copia embebida en viewFallbacks.mjs.
 */
async function loadFragment(which) {
  const relativePath = VIEW_FILES[which];
  const url = new URL(relativePath, import.meta.url);
  try {
    const res = await fetch(url.href);
    if (res.ok) return res.text();
  } catch {
    /* fetch no disponible o bloqueado */
  }
  const fb = await getFallbacks();
  return which === 'login' ? fb.loginHtmlFallback : fb.dashboardHtmlFallback;
}

async function boot() {
  const loginMount = document.getElementById('loginMount');
  const dashboardMount = document.getElementById('dashboardMount');
  if (!loginMount || !dashboardMount) return;

  const [loginHtml, dashboardHtml] = await Promise.all([
    loadFragment('login'),
    loadFragment('dashboard'),
  ]);

  loginMount.innerHTML = loginHtml;
  dashboardMount.innerHTML = dashboardHtml;

  const { initAuth } = await import('../../controllers/authController.js');
  initAuth();
}

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML =
    '<p style="font-family:sans-serif;padding:2rem;">No se pudo iniciar la aplicación. Revisa la consola (F12) o vuelve a cargar la página.</p>';
});
