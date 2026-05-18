const TITLES = {
  dashboard:    ['Dashboard',     'Resumen general del negocio'],
  inventario:   ['Inventario',    'Control de existencias'],
  productos:    ['Productos',     'Catálogo de autopartes'],
  categoria:    ['Categoría',     'Organización del catálogo'],
  proveedores:  ['Proveedores',   'Importadores y contacto'],
  compras:      ['Compras',       'Órdenes y adquisiciones'],
  ventas:       ['Ventas',        'Desempeño comercial'],
  reportes:     ['Reportes',      'Análisis y exportación'],
  cuentas:      ['Cuentas',       'Usuarios y permisos'],
  configuracion:['Configuraciones', 'Umbral de stock y tipos de pago'],
};

function setTheme(html, dark, iconSun, iconMoon) {
  if (dark) {
    html.setAttribute('data-theme', 'dark');
    localStorage.setItem('lb-theme', 'dark');
    iconSun.style.display  = 'none';
    iconMoon.style.display = 'block';
  } else {
    html.removeAttribute('data-theme');
    localStorage.setItem('lb-theme', 'light');
    iconSun.style.display  = 'block';
    iconMoon.style.display = 'none';
  }
  window.dispatchEvent(new CustomEvent('lb-theme-changed'));
}

function showView(id, pageTitle, nav) {
  document.querySelectorAll('[data-view-panel]').forEach((v) =>
    v.classList.toggle('is-active', v.dataset.viewPanel === id)
  );
  nav.querySelectorAll('.nav-item[data-view]').forEach((btn) =>
    btn.classList.toggle('is-active', btn.dataset.view === id)
  );
  const t = TITLES[id];
  if (t) pageTitle.innerHTML = `${t[0]}<span>${t[1]}</span>`;
}

export function initAuth() {
  const loginScreen = document.getElementById('loginScreen');
  const appShell    = document.getElementById('appShell');
  const loginForm   = document.getElementById('loginForm');
  const loginError  = document.getElementById('loginError');
  const pageTitle   = document.getElementById('pageTitle');
  const userName    = document.getElementById('userName');
  const userAvatar  = document.getElementById('userAvatar');
  const nav         = document.getElementById('mainNav');
  const sidebar     = document.getElementById('sidebar');
  const overlay     = document.getElementById('sidebarOverlay');
  const menuToggle  = document.getElementById('menuToggle');
  const themeToggle = document.getElementById('themeToggle');
  const iconSun     = document.getElementById('iconSun');
  const iconMoon    = document.getElementById('iconMoon');
  const html        = document.documentElement;

  const missing = [];
  if (!loginScreen) missing.push('loginScreen');
  if (!appShell)    missing.push('appShell');
  if (!loginForm)   missing.push('loginForm');
  if (!pageTitle)   missing.push('pageTitle');
  if (!userName)    missing.push('userName');
  if (!userAvatar)  missing.push('userAvatar');
  if (!nav)         missing.push('mainNav');
  if (!sidebar)     missing.push('sidebar');
  if (!overlay)     missing.push('sidebarOverlay');
  if (!menuToggle)  missing.push('menuToggle');
  if (!themeToggle) missing.push('themeToggle');
  if (!iconSun || !iconMoon) missing.push('iconos de tema');
  if (missing.length) {
    throw new Error(`Vistas incompletas: faltan (${missing.join(', ')})`);
  }

  // ── Módulos de features ─────────────────────────────────────────────────
  let setCuentasUsuario = null;

  import('../assets/js/dashboard.js?v=20260517_01')
    .then((m) => { if (typeof m.initDashboard  === 'function') m.initDashboard();  })
    .catch((e) => console.error('Dashboard:', e));

  import('../assets/js/compras.js?v=20260517_03')
    .then((m) => { if (typeof m.initCompras    === 'function') m.initCompras();    })
    .catch((e) => console.error('Compras:', e));

  import('../assets/js/proveedores.js')
    .then((m) => { if (typeof m.initProveedores=== 'function') m.initProveedores();})
    .catch((e) => console.error('Proveedores:', e));

  import('../assets/js/productos.js?v=20260517_04')
    .then((m) => { if (typeof m.initProductos  === 'function') m.initProductos();  })
    .catch((e) => console.error('Productos:', e));

  import('../assets/js/categorias.js')
    .then((m) => { if (typeof m.initCategorias === 'function') m.initCategorias(); })
    .catch((e) => console.error('Categorías:', e));

  import('../assets/js/inventario.js?v=20260517_03')
    .then((m) => { if (typeof m.initInventario === 'function') m.initInventario(); })
    .catch((e) => console.error('Inventario:', e));

  import('../assets/js/ventas.js?v=20260517_02')
    .then((m) => { if (typeof m.initVentas     === 'function') m.initVentas();     })
    .catch((e) => console.error('Ventas:', e));

  import('../assets/js/reportes.js?v=20260517_04')
    .then((m) => { if (typeof m.initReportes   === 'function') m.initReportes();   })
    .catch((e) => console.error('Reportes:', e));

  import('../assets/js/tipoPago.js')
    .then((m) => { if (typeof m.initTipoPago   === 'function') m.initTipoPago();   })
    .catch((e) => console.error('Tipo pago:', e));

  import('../assets/js/configuracion.js')
    .then((m) => { if (typeof m.initConfiguracion==='function') m.initConfiguracion(); })
    .catch((e) => console.error('Configuración:', e));

  import('../assets/js/cuentas.js?v=20260518_01')
    .then((m) => {
      if (typeof m.initCuentas      === 'function') m.initCuentas();
      if (typeof m.setCuentasUsuario === 'function') setCuentasUsuario = m.setCuentasUsuario;
    })
    .catch((e) => console.error('Cuentas:', e));

  // ── Navegación sidebar ──────────────────────────────────────────────────
  let navAccesible = null;   // claves de vistas permitidas para el usuario actual

  function closeMobileMenu() {
    sidebar.classList.remove('is-open');
    overlay.classList.remove('is-open');
  }
  function openMobileMenu() {
    sidebar.classList.add('is-open');
    overlay.classList.add('is-open');
  }

  function showDashboardView(id) {
    showView(id, pageTitle, nav);
    window.dispatchEvent(new CustomEvent('lb-view', { detail: { id } }));
    closeMobileMenu();
  }

  function clearLoginError() {
    if (loginError) { loginError.textContent = ''; loginError.hidden = true; }
  }

  function aplicarPermisos(permisos) {
    // Mapeo permiso → vista del nav
    const vistaMap = {
      ver_inventario:  'inventario',
      ver_productos:   'productos',
      ver_categorias:  'categoria',
      ver_proveedores: 'proveedores',
      ver_compras:     'compras',
      ver_ventas:      'ventas',
      ver_reportes:    'reportes',
      gestionar_cuentas: 'cuentas',
    };
    navAccesible = new Set(['dashboard']);
    permisos.forEach(p => { if (vistaMap[p]) navAccesible.add(vistaMap[p]); });

    const SIEMPRE_VISIBLES = new Set(['dashboard', 'configuracion']);
    nav.querySelectorAll('.nav-item[data-view]').forEach(btn => {
      const v = btn.dataset.view;
      if (SIEMPRE_VISIBLES.has(v)) return;
      btn.style.display = navAccesible.has(v) ? '' : 'none';
    });
  }

  function logout() {
    fetch('api/auth.php?action=logout', { method: 'POST' }).catch(() => {});
    navAccesible = null;
    appShell.classList.remove('is-visible');
    appShell.setAttribute('aria-hidden', 'true');
    loginScreen.classList.remove('is-hidden');
    loginScreen.setAttribute('aria-hidden', 'false');
    closeMobileMenu();
    const pwd = document.getElementById('password');
    if (pwd) pwd.value = '';
    clearLoginError();
    showView('dashboard', pageTitle, nav);
    nav.querySelectorAll('.nav-item[data-view]').forEach(btn => { btn.style.display = ''; });
  }

  // ── Tema ────────────────────────────────────────────────────────────────
  themeToggle.addEventListener('click', () => {
    setTheme(html, html.getAttribute('data-theme') !== 'dark', iconSun, iconMoon);
  });
  if (localStorage.getItem('lb-theme') === 'dark') {
    setTheme(html, true, iconSun, iconMoon);
  }

  // ── Eventos de nav ──────────────────────────────────────────────────────
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-item');
    if (!btn) return;
    if (btn.dataset.action === 'logout') { logout(); return; }
    const view = btn.dataset.view;
    if (view) showDashboardView(view);
  });

  menuToggle.addEventListener('click', () => {
    if (sidebar.classList.contains('is-open')) closeMobileMenu(); else openMobileMenu();
  });
  overlay.addEventListener('click', closeMobileMenu);
  window.addEventListener('resize', () => { if (window.innerWidth > 900) closeMobileMenu(); });

  // ── Verificar sesión existente al cargar ────────────────────────────────
  fetch('api/auth.php?action=me')
    .then(r => r.json())
    .then(data => {
      if (data.ok && data.auth) {
        entrarConUsuario(data.usuario);
      }
    })
    .catch(() => {});

  function entrarConUsuario(u) {
    const local = u.nombre || u.email.split('@')[0] || 'Admin';
    userName.textContent  = local.charAt(0).toUpperCase() + local.slice(1);
    userAvatar.textContent = (local.charAt(0) || 'A').toUpperCase();
    loginScreen.classList.add('is-hidden');
    loginScreen.setAttribute('aria-hidden', 'true');
    appShell.classList.add('is-visible');
    appShell.setAttribute('aria-hidden', 'false');
    aplicarPermisos(u.permisos || []);
    if (setCuentasUsuario) setCuentasUsuario(u);
    showDashboardView('dashboard');
  }

  // ── Login ───────────────────────────────────────────────────────────────
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('email')?.value.trim()    ?? '';
    const password = document.getElementById('password')?.value ?? '';

    const submitBtn = loginForm.querySelector('[type=submit]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Ingresando…'; }

    try {
      const res  = await fetch('api/auth.php?action=login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!data.ok) {
        if (loginError) {
          loginError.textContent = data.error || 'Correo o contraseña incorrectos.';
          loginError.hidden = false;
        }
        return;
      }

      clearLoginError();
      entrarConUsuario(data.usuario);
      // Pasar usuario al módulo de cuentas (puede que aún no haya cargado)
      if (setCuentasUsuario) setCuentasUsuario(data.usuario);

    } catch (err) {
      if (loginError) {
        loginError.textContent = 'Error de conexión. Intente de nuevo.';
        loginError.hidden = false;
      }
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Ingresar'; }
    }
  });

  ['email', 'password'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', clearLoginError);
  });
}
