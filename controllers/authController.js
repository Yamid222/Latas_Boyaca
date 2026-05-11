import { validateCredentials } from '../models/userModel.js';

const TITLES = {
  dashboard: ['Dashboard', 'Resumen general del negocio'],
  inventario: ['Inventario', 'Control de existencias'],
  productos: ['Productos', 'Catálogo de autopartes'],
  categoria: ['Categoría', 'Organización del catálogo'],
  proveedores: ['Proveedores', 'Importadores y contacto'],
  compras: ['Compras', 'Órdenes y adquisiciones'],
  ventas: ['Ventas', 'Desempeño comercial'],
  reportes: ['Reportes', 'Análisis y exportación'],
  configuracion: ['Configuración', 'Ajustes del sistema'],
};

let chartVentas = null;
let chartCats = null;

function getChartColors() {
  const muted = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#64748b';
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2563eb';
  const grid = getComputedStyle(document.documentElement).getPropertyValue('--chart-grid').trim() || 'rgba(148,163,184,0.2)';
  return { muted, accent, grid };
}

function destroyCharts() {
  if (chartVentas) {
    chartVentas.destroy();
    chartVentas = null;
  }
  if (chartCats) {
    chartCats.destroy();
    chartCats = null;
  }
}

function initCharts() {
  if (typeof Chart === 'undefined') return;
  destroyCharts();
  const { muted, accent, grid } = getChartColors();

  const ctx1 = document.getElementById('chartVentas');
  const ctx2 = document.getElementById('chartCategorias');
  if (!ctx1 || !ctx2) return;

  const ctx = ctx1.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 280);
  let r = 37;
  let gch = 99;
  let b = 235;
  const hex = accent && accent.startsWith('#') ? accent : '#2563eb';
  if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    r = parseInt(hex.slice(1, 3), 16);
    gch = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  }
  grad.addColorStop(0, `rgba(${r},${gch},${b},0.22)`);
  grad.addColorStop(1, `rgba(${r},${gch},${b},0)`);

  chartVentas = new Chart(ctx1, {
    type: 'line',
    data: {
      labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
      datasets: [
        {
          label: 'Ventas (millones COP)',
          data: [4.2, 5.1, 4.8, 6.2, 5.9, 7.1, 6.4],
          borderColor: accent,
          backgroundColor: grad,
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: grid }, ticks: { color: muted } },
        y: { grid: { color: grid }, ticks: { color: muted } },
      },
    },
  });

  chartCats = new Chart(ctx2, {
    type: 'doughnut',
    data: {
      labels: ['Bebidas', 'Envases', 'Accesorios', 'Otros'],
      datasets: [
        {
          data: [42, 28, 18, 12],
          backgroundColor: ['#2563eb', '#059669', '#d97706', '#64748b'],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: muted, boxWidth: 12, padding: 16 } },
      },
    },
  });
}

function setTheme(html, dark, iconSun, iconMoon) {
  if (dark) {
    html.setAttribute('data-theme', 'dark');
    localStorage.setItem('lb-theme', 'dark');
    iconSun.style.display = 'none';
    iconMoon.style.display = 'block';
  } else {
    html.removeAttribute('data-theme');
    localStorage.setItem('lb-theme', 'light');
    iconSun.style.display = 'block';
    iconMoon.style.display = 'none';
  }
  if (chartVentas || chartCats) {
    destroyCharts();
    const dash = document.getElementById('view-dashboard');
    if (dash && dash.classList.contains('is-active')) initCharts();
  }
}

function showView(id, pageTitle, nav) {
  const views = document.querySelectorAll('[data-view-panel]');
  views.forEach((v) => v.classList.toggle('is-active', v.dataset.viewPanel === id));
  nav.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.view === id);
  });
  const t = TITLES[id];
  if (t) {
    pageTitle.innerHTML = `${t[0]}<span>${t[1]}</span>`;
  }
}

export function initAuth() {
  const loginScreen = document.getElementById('loginScreen');
  const appShell = document.getElementById('appShell');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const pageTitle = document.getElementById('pageTitle');
  const userName = document.getElementById('userName');
  const userAvatar = document.getElementById('userAvatar');
  const nav = document.getElementById('mainNav');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const menuToggle = document.getElementById('menuToggle');
  const themeToggle = document.getElementById('themeToggle');
  const iconSun = document.getElementById('iconSun');
  const iconMoon = document.getElementById('iconMoon');
  const html = document.documentElement;

  const missing = [];
  if (!loginScreen) missing.push('loginScreen');
  if (!appShell) missing.push('appShell');
  if (!loginForm) missing.push('loginForm');
  if (!pageTitle) missing.push('pageTitle');
  if (!userName) missing.push('userName');
  if (!userAvatar) missing.push('userAvatar');
  if (!nav) missing.push('mainNav');
  if (!sidebar) missing.push('sidebar');
  if (!overlay) missing.push('sidebarOverlay');
  if (!menuToggle) missing.push('menuToggle');
  if (!themeToggle) missing.push('themeToggle');
  if (!iconSun || !iconMoon) missing.push('iconos de tema');
  if (missing.length) {
    throw new Error(`Vistas incompletas: faltan elementos (${missing.join(', ')}). ¿Se cargaron views/login.html y views/dashboard.html?`);
  }

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
    if (id === 'dashboard') {
      requestAnimationFrame(() => initCharts());
    } else {
      destroyCharts();
    }
  }

  function clearLoginError() {
    if (loginError) {
      loginError.textContent = '';
      loginError.hidden = true;
    }
  }

  function logout() {
    destroyCharts();
    appShell.classList.remove('is-visible');
    appShell.setAttribute('aria-hidden', 'true');
    loginScreen.classList.remove('is-hidden');
    loginScreen.setAttribute('aria-hidden', 'false');
    closeMobileMenu();
    const pwd = document.getElementById('password');
    if (pwd) pwd.value = '';
    clearLoginError();
    showView('dashboard', pageTitle, nav);
  }

  themeToggle.addEventListener('click', () => {
    setTheme(html, html.getAttribute('data-theme') !== 'dark', iconSun, iconMoon);
  });

  if (localStorage.getItem('lb-theme') === 'dark') {
    setTheme(html, true, iconSun, iconMoon);
  }

  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-item');
    if (!btn) return;
    if (btn.dataset.action === 'logout') {
      logout();
      return;
    }
    const view = btn.dataset.view;
    if (view) showDashboardView(view);
  });

  menuToggle.addEventListener('click', () => {
    if (sidebar.classList.contains('is-open')) closeMobileMenu();
    else openMobileMenu();
  });
  overlay.addEventListener('click', closeMobileMenu);

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!validateCredentials(email, password)) {
      if (loginError) {
        loginError.textContent = 'Correo o contraseña incorrectos.';
        loginError.hidden = false;
      }
      return;
    }

    clearLoginError();
    const local = email.split('@')[0] || 'Admin';
    userName.textContent = local.charAt(0).toUpperCase() + local.slice(1);
    userAvatar.textContent = (local.charAt(0) || 'A').toUpperCase();
    loginScreen.classList.add('is-hidden');
    loginScreen.setAttribute('aria-hidden', 'true');
    appShell.classList.add('is-visible');
    appShell.setAttribute('aria-hidden', 'false');
    showDashboardView('dashboard');
  });

  ['email', 'password'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', clearLoginError);
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) closeMobileMenu();
  });

  import('../assets/js/compras.js')
    .then((m) => {
      if (typeof m.initCompras === 'function') m.initCompras();
    })
    .catch((err) => console.error('Compras:', err));

  import('../assets/js/proveedores.js')
    .then((m) => {
      if (typeof m.initProveedores === 'function') m.initProveedores();
    })
    .catch((err) => console.error('Proveedores:', err));

  import('../assets/js/productos.js')
    .then((m) => {
      if (typeof m.initProductos === 'function') m.initProductos();
    })
    .catch((err) => console.error('Productos:', err));

  import('../assets/js/categorias.js')
    .then((m) => {
      if (typeof m.initCategorias === 'function') m.initCategorias();
    })
    .catch((err) => console.error('Categorías:', err));

  import('../assets/js/inventario.js')
    .then((m) => {
      if (typeof m.initInventario === 'function') m.initInventario();
    })
    .catch((err) => console.error('Inventario:', err));

  import('../assets/js/ventas.js')
    .then((m) => {
      if (typeof m.initVentas === 'function') m.initVentas();
    })
    .catch((err) => console.error('Ventas:', err));

  import('../assets/js/reportes.js')
    .then((m) => {
      if (typeof m.initReportes === 'function') m.initReportes();
    })
    .catch((err) => console.error('Reportes:', err));

  import('../assets/js/tipoPago.js')
    .then((m) => {
      if (typeof m.initTipoPago === 'function') m.initTipoPago();
    })
    .catch((err) => console.error('Tipo pago:', err));

  import('../assets/js/configuracion.js')
    .then((m) => {
      if (typeof m.initConfiguracion === 'function') m.initConfiguracion();
    })
    .catch((err) => console.error('Configuración:', err));
}
