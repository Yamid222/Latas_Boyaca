// ── Estado del módulo ────────────────────────────────────────────────────────
let usuarioActual = null;   // set desde authController al hacer login
let rolesCache    = [];
let permisosCache = [];

// ── Helpers ──────────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function showMsg(el, msg, tipo = 'error') {
  if (!el) return;
  el.textContent = msg;
  el.className   = 'form-msg ' + tipo;
  el.hidden      = !msg;
}

function fmtFecha(iso) {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

// ── Tab interno de Cuentas ────────────────────────────────────────────────────
function switchCuentasTab(tab) {
  document.querySelectorAll('[data-ctab]').forEach(b => {
    b.classList.toggle('is-active', b.dataset.ctab === tab);
  });
  document.querySelectorAll('[data-ctab-panel]').forEach(p => {
    p.classList.toggle('is-active', p.dataset.ctabPanel === tab);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// MI CUENTA
// ════════════════════════════════════════════════════════════════════════════
function cargarMiCuenta() {
  if (!usuarioActual) return;
  const u = usuarioActual;
  const el = (id) => $(id);
  if (el('mcNombre'))  el('mcNombre').textContent  = u.nombre;
  if (el('mcEmail'))   el('mcEmail').textContent   = u.email;
  if (el('mcRol'))     el('mcRol').textContent     = u.rol;
  if (el('mcNombreI')) el('mcNombreI').value        = u.nombre;
  if (el('mcEmailI'))  el('mcEmailI').value         = u.email;
}

async function guardarMiCuenta() {
  const nombre = $('mcNombreI')?.value.trim() ?? '';
  const msg    = $('mcMsg');

  if (nombre === '') return showMsg(msg, 'El nombre no puede estar vacío.');

  const res  = await fetch('api/usuarios.php', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: usuarioActual.id, nombre }),
  });
  const data = await res.json();
  if (!data.ok) return showMsg(msg, data.error || 'Error al guardar.');

  usuarioActual.nombre = nombre;
  const un = document.getElementById('userName');
  const ua = document.getElementById('userAvatar');
  if (un) un.textContent = nombre.charAt(0).toUpperCase() + nombre.slice(1);
  if (ua) ua.textContent = (nombre.charAt(0) || 'A').toUpperCase();
  showMsg(msg, 'Nombre guardado.', 'ok');
}

function initMcPassFlow() {
  const step0       = $('mcPassStep0');
  const step1       = $('mcPassStep1');
  const btnEnviar   = $('mcPassEnviar');
  const btnVerif    = $('mcPassVerificar');
  const btnCancelar = $('mcPassCancelar');
  const msgNota     = $('mcPassNota');
  const msg         = $('mcPassMsg');
  if (!step0 || !btnEnviar) return;

  function resetPassFlow() {
    step0.hidden = false;
    step1.hidden = true;
    if ($('mcPassCodigo'))  $('mcPassCodigo').value  = '';
    if ($('mcPassNueva'))   $('mcPassNueva').value   = '';
    if ($('mcPassConfirm')) $('mcPassConfirm').value = '';
    showMsg(msg, '');
  }

  btnEnviar.addEventListener('click', async () => {
    if (!usuarioActual?.email) return;
    btnEnviar.disabled = true;
    btnEnviar.textContent = 'Enviando…';
    try {
      const res  = await fetch('api/auth.php?action=request_code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: usuarioActual.email }),
      });
      const data = await res.json();
      if (!data.ok) { showMsg($('mcMsg'), data.error || 'Error al enviar código.'); return; }
      step0.hidden = true;
      step1.hidden = false;
      if (msgNota) {
        msgNota.textContent = data.dev
          ? 'Código: ' + data.dev_codigo + ' (sin SMTP — solo desarrollo)'
          : 'Código enviado a ' + usuarioActual.email + '. Revisa tu correo.';
        msgNota.hidden = false;
      }
      showMsg(msg, '');
    } finally {
      btnEnviar.disabled = false;
      btnEnviar.textContent = 'Enviar código';
    }
  });

  btnCancelar?.addEventListener('click', resetPassFlow);

  btnVerif?.addEventListener('click', async () => {
    const codigo   = $('mcPassCodigo')?.value.trim()  ?? '';
    const password = $('mcPassNueva')?.value.trim()   ?? '';
    const confirm  = $('mcPassConfirm')?.value.trim() ?? '';
    if (!codigo)             return showMsg(msg, 'Ingresa el código.');
    if (!password)           return showMsg(msg, 'Ingresa la nueva contraseña.');
    if (password.length < 6) return showMsg(msg, 'La contraseña debe tener al menos 6 caracteres.');
    if (password !== confirm) return showMsg(msg, 'Las contraseñas no coinciden.');
    showMsg(msg, '');
    btnVerif.disabled = true;
    btnVerif.textContent = 'Verificando…';
    try {
      const res  = await fetch('api/auth.php?action=verify_code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: usuarioActual.email, codigo, password }),
      });
      const data = await res.json();
      if (!data.ok) return showMsg(msg, data.error || 'Error al cambiar contraseña.');
      resetPassFlow();
      showMsg($('mcMsg'), 'Contraseña cambiada correctamente.', 'ok');
    } finally {
      btnVerif.disabled = false;
      btnVerif.textContent = 'Cambiar contraseña';
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// GESTIÓN DE USUARIOS
// ════════════════════════════════════════════════════════════════════════════
let editingUserId      = null;
let emailVerificado    = false;   // true cuando el correo del modal fue confirmado con código
let emailOriginalModal = '';      // correo que tenía el usuario al abrir el modal (edición)

async function cargarUsuarios() {
  const tbody = $('usuariosBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="text-muted">Cargando…</td></tr>';

  const [resU, resR] = await Promise.all([
    fetch('api/usuarios.php').then(r => r.json()),
    cargarRolesCache(),
  ]);

  if (!resU.ok) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:var(--danger)">${resU.error}</td></tr>`;
    return;
  }

  llenarSelectRoles('usuRolSel');
  llenarSelectRoles('editUsuRolSel');

  if (!resU.usuarios.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-muted">No hay usuarios.</td></tr>';
    return;
  }

  tbody.innerHTML = resU.usuarios.map(u => `
    <tr>
      <td>${u.nombre}</td>
      <td>${u.email}</td>
      <td>${u.rol}</td>
      <td><span class="badge ${u.activo ? 'ok' : 'warn'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        <button class="btn-sm btn-outline" onclick="abrirEditUsuario(${u.id})">Editar</button>
        ${u.id !== usuarioActual?.id
          ? u.activo
            ? `<button class="btn-sm btn-danger" onclick="desactivarUsuario(${u.id})">Desactivar</button>`
            : `<button class="btn-sm btn-primary-inline" onclick="reactivarUsuario(${u.id})">Activar</button>`
          : ''}
      </td>
    </tr>`).join('');
}

function llenarSelectRoles(selId) {
  const sel = $(selId);
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">— Seleccionar rol —</option>' +
    rolesCache.map(r => `<option value="${r.id}">${r.nombre}</option>`).join('');
  if (current) sel.value = current;
}

async function cargarRolesCache() {
  if (rolesCache.length) return;
  const res = await fetch('api/roles.php').then(r => r.json());
  if (res.ok) rolesCache = res.roles;
}

function resetEmailVerUI() {
  emailVerificado = false;
  if ($('editUsuEmailVerRow'))  $('editUsuEmailVerRow').hidden  = true;
  if ($('editUsuEmailOkRow'))   $('editUsuEmailOkRow').hidden   = true;
  if ($('editUsuEmailCodigo'))  $('editUsuEmailCodigo').value   = '';
  if ($('editUsuEmailNota'))    $('editUsuEmailNota').textContent = '';
}

function abrirModalNuevoUsuario() {
  editingUserId      = null;
  emailOriginalModal = '';
  resetEmailVerUI();
  if ($('editUsuModal')) {
    $('editUsuTitulo').textContent = 'Nuevo usuario';
    $('editUsuNombre').value  = '';
    $('editUsuEmail').value   = '';
    $('editUsuPass').value    = '';
    $('editUsuRolSel').value  = '';
    $('editUsuPasswordRow').style.display = '';
    showMsg($('editUsuMsg'), '');
    $('editUsuModal').classList.add('is-open');
  }
}

function abrirEditUsuario(id) {
  fetch('api/usuarios.php').then(r => r.json()).then(data => {
    if (!data.ok) return;
    const u = data.usuarios.find(x => x.id === +id);
    if (!u) return;
    editingUserId      = id;
    emailOriginalModal = u.email;
    resetEmailVerUI();
    $('editUsuTitulo').textContent = 'Editar usuario';
    $('editUsuNombre').value  = u.nombre;
    $('editUsuEmail').value   = u.email;
    $('editUsuPass').value    = '';
    $('editUsuRolSel').value  = u.id_rol;
    $('editUsuPasswordRow').style.display = 'none';
    showMsg($('editUsuMsg'), '');
    $('editUsuModal').classList.add('is-open');
  });
}

function cerrarEditUsuario() {
  $('editUsuModal')?.classList.remove('is-open');
  resetEmailVerUI();
}

async function guardarUsuario() {
  const nombre   = $('editUsuNombre')?.value.trim()  ?? '';
  const email    = $('editUsuEmail')?.value.trim()   ?? '';
  const password = $('editUsuPass')?.value.trim()    ?? '';
  const id_rol   = parseInt($('editUsuRolSel')?.value ?? '0');
  const msg      = $('editUsuMsg');

  if (nombre === '' || email === '' || id_rol === 0) return showMsg(msg, 'Nombre, correo y rol son requeridos.');
  if (!editingUserId && password === '') return showMsg(msg, 'La contraseña es requerida para usuarios nuevos.');
  if (password && password.length < 6) return showMsg(msg, 'La contraseña debe tener al menos 6 caracteres.');

  // Verificación de correo obligatoria cuando es nuevo o cambió
  const emailCambio = !editingUserId || email !== emailOriginalModal;
  if (emailCambio && !emailVerificado) {
    return showMsg(msg, 'Debes verificar el correo antes de guardar. Haz clic en "Verificar".');
  }

  const body = { nombre, email, id_rol };
  if (editingUserId) body.id = editingUserId;
  if (password)      body.password = password;

  const method = editingUserId ? 'PUT' : 'POST';
  const res    = await fetch('api/usuarios.php', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data   = await res.json();
  if (!data.ok) return showMsg(msg, data.error || 'Error al guardar.');

  cerrarEditUsuario();
  cargarUsuarios();
}

async function desactivarUsuario(id) {
  if (!confirm('¿Desactivar este usuario? Puede reactivarlo desde la lista.')) return;
  const res  = await fetch('api/usuarios.php?id=' + id, { method: 'DELETE' });
  const data = await res.json();
  if (!data.ok) return alert(data.error || 'Error al desactivar.');
  cargarUsuarios();
}

async function reactivarUsuario(id) {
  if (!confirm('¿Activar este usuario?')) return;
  const res  = await fetch('api/usuarios.php', {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ id, activo: 1 }),
  });
  const data = await res.json();
  if (!data.ok) return alert(data.error || 'Error al activar.');
  cargarUsuarios();
}

// ════════════════════════════════════════════════════════════════════════════
// GESTIÓN DE ROLES
// ════════════════════════════════════════════════════════════════════════════
let editingRolId   = null;
let permisosGrupos = {};

async function cargarPermisos() {
  if (permisosCache.length) return;
  const res = await fetch('api/permisos.php').then(r => r.json());
  if (res.ok) {
    permisosCache = res.permisos;
    permisosGrupos = {};
    permisosCache.forEach(p => {
      if (!permisosGrupos[p.modulo]) permisosGrupos[p.modulo] = [];
      permisosGrupos[p.modulo].push(p);
    });
  }
}

async function cargarRoles() {
  const tbody = $('rolesBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" class="text-muted">Cargando…</td></tr>';

  await cargarPermisos();
  rolesCache = [];
  const res = await fetch('api/roles.php').then(r => r.json());
  if (!res.ok) {
    tbody.innerHTML = `<tr><td colspan="4" style="color:var(--danger)">${res.error}</td></tr>`;
    return;
  }
  rolesCache = res.roles;

  tbody.innerHTML = res.roles.map(r => `
    <tr>
      <td>${r.nombre}${r.es_sistema ? ' <span class="badge warn" style="font-size:.7rem;">Sistema</span>' : ''}</td>
      <td>${r.descripcion || '—'}</td>
      <td>${r.permisos.length}</td>
      <td>
        ${!r.es_sistema ? `<button class="btn-sm btn-outline" onclick="abrirEditRol(${r.id})">Editar</button>` : ''}
        ${!r.es_sistema ? `<button class="btn-sm btn-danger" onclick="eliminarRol(${r.id})">Eliminar</button>` : ''}
      </td>
    </tr>`).join('');
}

function buildCheckboxesPermisos(selectedPermisos) {
  const cont = $('rolPermisosCheck');
  if (!cont) return;
  cont.innerHTML = Object.entries(permisosGrupos).map(([modulo, perms]) => `
    <div class="perm-grupo">
      <strong>${modulo.charAt(0).toUpperCase() + modulo.slice(1)}</strong>
      ${perms.map(p => `
        <label class="perm-item">
          <input type="checkbox" value="${p.clave}" ${selectedPermisos.includes(p.clave) ? 'checked' : ''}>
          ${p.etiqueta}
        </label>`).join('')}
    </div>`).join('');
}

function abrirNuevoRol() {
  editingRolId = null;
  $('editRolTitulo').textContent  = 'Nuevo rol';
  $('editRolNombre').value        = '';
  $('editRolDesc').value          = '';
  $('editRolNombreRow').style.display = '';
  buildCheckboxesPermisos([]);
  showMsg($('editRolMsg'), '');
  $('editRolModal').classList.add('is-open');
}

async function abrirEditRol(id) {
  await cargarPermisos();
  const rol = rolesCache.find(r => r.id === +id);
  if (!rol) return;
  editingRolId = rol.id;
  $('editRolTitulo').textContent = 'Editar rol: ' + rol.nombre;
  $('editRolNombre').value       = rol.nombre;
  $('editRolDesc').value         = rol.descripcion || '';
  $('editRolNombreRow').style.display = '';
  buildCheckboxesPermisos(rol.permisos);
  showMsg($('editRolMsg'), '');
  $('editRolModal').classList.add('is-open');
}

function cerrarEditRol() {
  $('editRolModal')?.classList.remove('is-open');
}

async function guardarRol() {
  const nombre = $('editRolNombre')?.value.trim()  ?? '';
  const desc   = $('editRolDesc')?.value.trim()    ?? '';
  const msg    = $('editRolMsg');

  const permisos = Array.from($('rolPermisosCheck')?.querySelectorAll('input[type=checkbox]:checked') ?? [])
    .map(cb => cb.value);

  if (!editingRolId && nombre === '') return showMsg(msg, 'El nombre del rol es requerido.');

  const body   = { nombre, descripcion: desc, permisos };
  if (editingRolId) body.id = editingRolId;
  const method = editingRolId ? 'PUT' : 'POST';
  const res    = await fetch('api/roles.php', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data   = await res.json();
  if (!data.ok) return showMsg(msg, data.error || 'Error al guardar.');

  rolesCache = [];
  cerrarEditRol();
  cargarRoles();
}

async function eliminarRol(id) {
  if (!confirm('¿Eliminar este rol? Solo es posible si no tiene usuarios asignados.')) return;
  const res  = await fetch('api/roles.php?id=' + id, { method: 'DELETE' });
  const data = await res.json();
  if (!data.ok) return alert(data.error || 'Error al eliminar.');
  rolesCache = [];
  cargarRoles();
}

// ════════════════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════════════════
function aplicarTabsCuentas(permisos) {
  const esAdmin = permisos.includes('gestionar_cuentas');
  document.querySelectorAll('[data-ctab="usuarios"], [data-ctab="roles"]').forEach(btn => {
    btn.style.display = esAdmin ? '' : 'none';
  });
}

export function setCuentasUsuario(u) {
  usuarioActual = u;
  if (u?.permisos) aplicarTabsCuentas(u.permisos);
}

export function initCuentas() {
  // Tabs
  document.querySelectorAll('[data-ctab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.ctab;
      switchCuentasTab(tab);
      if (tab === 'mi-cuenta') cargarMiCuenta();
      if (tab === 'usuarios')  cargarUsuarios();
      if (tab === 'roles')     cargarRoles();
    });
  });

  // Mi cuenta — nombre
  $('mcGuardar')?.addEventListener('click', guardarMiCuenta);

  // Mi cuenta — cambio de contraseña vía código
  initMcPassFlow();

  // Usuarios
  $('btnNuevoUsuario')?.addEventListener('click', abrirModalNuevoUsuario);
  $('editUsuGuardar')?.addEventListener('click', guardarUsuario);
  $('editUsuCerrar')?.addEventListener('click', cerrarEditUsuario);

  // Verificación de correo — resetear si el usuario cambia el email
  $('editUsuEmail')?.addEventListener('input', () => {
    const email = $('editUsuEmail').value.trim();
    const cambio = !editingUserId || email !== emailOriginalModal;
    if (cambio) resetEmailVerUI();
  });

  // Verificación de correo — paso 1: enviar código
  $('btnVerificarEmail')?.addEventListener('click', async () => {
    const email = $('editUsuEmail')?.value.trim() ?? '';
    const msg   = $('editUsuMsg');
    if (!email) return showMsg(msg, 'Ingresa el correo antes de verificar.');

    const btn = $('btnVerificarEmail');
    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      const res  = await fetch('api/auth.php?action=request_email_verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!data.ok) return showMsg(msg, data.error || 'Error al enviar código.');
      showMsg(msg, '');
      $('editUsuEmailVerRow').hidden = false;
      $('editUsuEmailOkRow').hidden  = true;
      if ($('editUsuEmailNota')) $('editUsuEmailNota').textContent = `Código enviado a ${email}.`;
    } finally {
      btn.disabled = false; btn.textContent = 'Verificar';
    }
  });

  // Verificación de correo — paso 2: confirmar código
  $('btnConfirmarEmail')?.addEventListener('click', async () => {
    const email  = $('editUsuEmail')?.value.trim()      ?? '';
    const codigo = $('editUsuEmailCodigo')?.value.trim() ?? '';
    const msg    = $('editUsuMsg');
    if (!codigo) return showMsg(msg, 'Ingresa el código recibido.');

    const btn = $('btnConfirmarEmail');
    btn.disabled = true; btn.textContent = 'Confirmando…';
    try {
      const res  = await fetch('api/auth.php?action=verify_email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, codigo }),
      });
      const data = await res.json();
      if (!data.ok) return showMsg(msg, data.error || 'Código incorrecto.');
      emailVerificado = true;
      showMsg(msg, '');
      $('editUsuEmailVerRow').hidden = true;
      $('editUsuEmailOkRow').hidden  = false;
    } finally {
      btn.disabled = false; btn.textContent = 'Confirmar';
    }
  });

  // Roles
  $('btnNuevoRol')?.addEventListener('click', abrirNuevoRol);
  $('editRolGuardar')?.addEventListener('click', guardarRol);
  $('editRolCerrar')?.addEventListener('click', cerrarEditRol);

  // Exponer funciones globales para los botones generados dinámicamente
  window.abrirEditUsuario  = abrirEditUsuario;
  window.desactivarUsuario = desactivarUsuario;
  window.reactivarUsuario  = reactivarUsuario;
  window.abrirEditRol      = abrirEditRol;
  window.eliminarRol       = eliminarRol;

  // Activar pestaña inicial
  window.addEventListener('lb-view', (e) => {
    if (e.detail?.id === 'cuentas') {
      switchCuentasTab('mi-cuenta');
      cargarMiCuenta();
      if (usuarioActual?.permisos) aplicarTabsCuentas(usuarioActual.permisos);
    }
  });
}
