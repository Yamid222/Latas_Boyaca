// ── Estado del módulo ────────────────────────────────────────────────────────
let devCache   = [];
let refDetalle = [];  // productos de la venta/compra cargada en el formulario

// ── Helpers ──────────────────────────────────────────────────────────────────
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function fmt(val) {
  const n = parseFloat(val) || 0;
  if (n >= 1_000_000) return '$ ' + (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return '$ ' + Math.round(n / 1_000).toLocaleString('es-CO') + 'K';
  return '$ ' + Math.round(n).toLocaleString('es-CO');
}

function badgeEstado(estado) {
  const map = { pendiente: 'warn', aprobada: 'ok', rechazada: 'danger' };
  return `<span class="badge ${map[estado] || ''}">${estado}</span>`;
}

function badgeTipo(tipo) {
  return `<span class="badge ${tipo === 'venta' ? 'blue' : 'amber'}">${tipo}</span>`;
}

function showDevMsg(msg, tipo = 'error') {
  const el = document.getElementById('devMsg');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'compras-msg' + (msg ? '' : '');
  el.hidden      = !msg;
  if (msg) el.style.color = tipo === 'ok' ? 'var(--success,#059669)' : 'var(--danger)';
}

// ── Cargar listado ────────────────────────────────────────────────────────────
async function cargarDevoluciones() {
  const tbody = document.getElementById('devTablaBody');
  const empty = document.getElementById('devEmpty');
  if (!tbody) return;

  const tipo   = document.getElementById('devFiltroTipo')?.value   ?? '';
  const estado = document.getElementById('devFiltroEstado')?.value ?? '';
  const desde  = document.getElementById('devFiltroDe')?.value     ?? '';
  const hasta  = document.getElementById('devFiltroHasta')?.value  ?? '';

  const params = new URLSearchParams();
  if (tipo)   params.set('tipo',   tipo);
  if (estado) params.set('estado', estado);
  if (desde)  params.set('desde',  desde);
  if (hasta)  params.set('hasta',  hasta);

  tbody.innerHTML = '<tr><td colspan="7" class="text-muted">Cargando…</td></tr>';
  if (empty) empty.hidden = true;

  try {
    const res  = await fetch('api/devoluciones.php?' + params).then(r => r.json());
    if (!res.ok) throw new Error(res.error);
    devCache = res.devoluciones;

    if (!devCache.length) {
      tbody.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }

    tbody.innerHTML = devCache.map(d => `
      <tr>
        <td>#${d.id}</td>
        <td>${badgeTipo(d.tipo)}</td>
        <td>${d.tipo === 'venta' ? 'Venta #' : 'Compra #'}${d.id_referencia}</td>
        <td>${esc(d.motivo)}</td>
        <td>${fmt(d.total || 0)}</td>
        <td>${badgeEstado(d.estado)}</td>
        <td class="compras-acciones">
          <button class="btn btn-sm btn-outline" onclick="verDevolucion(${d.id})">Ver</button>
          ${d.estado === 'pendiente' ? `
            <button class="btn btn-sm btn-primary-inline" onclick="cambiarEstado(${d.id},'aprobada')">Aprobar</button>
            <button class="btn btn-sm btn-ghost"          onclick="cambiarEstado(${d.id},'rechazada')">Rechazar</button>
            <button class="btn btn-sm btn-danger"         onclick="eliminarDevolucion(${d.id})">Eliminar</button>
          ` : ''}
        </td>
      </tr>`).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:var(--danger)">${e.message}</td></tr>`;
  }
}

// ── Ver detalle ───────────────────────────────────────────────────────────────
async function verDevolucion(id) {
  const dev = devCache.find(d => d.id === +id);
  if (!dev) return;

  // Cargar detalles de la referencia para mostrar productos
  const tipo   = dev.tipo;
  const action = tipo === 'venta' ? 'ref_venta' : 'ref_compra';
  const refId  = dev.id_referencia;

  const el = {
    titulo:      document.getElementById('devVerTitulo'),
    ref:         document.getElementById('devVerRef'),
    motivo:      document.getElementById('devVerMotivo'),
    estado:      document.getElementById('devVerEstado'),
    fecha:       document.getElementById('devVerFecha'),
    notas:       document.getElementById('devVerNotas'),
    body:        document.getElementById('devVerBody'),
    total:       document.getElementById('devVerTotal'),
  };

  if (el.titulo) el.titulo.textContent = `Devolución #${dev.id}`;
  if (el.ref)    el.ref.innerHTML      = `${tipo === 'venta' ? 'Venta' : 'Compra'} #${refId} &nbsp; ${badgeTipo(tipo)}`;
  if (el.motivo) el.motivo.textContent = dev.motivo;
  if (el.estado) el.estado.innerHTML   = badgeEstado(dev.estado);
  if (el.fecha)  el.fecha.textContent  = dev.fecha;
  if (el.notas)  el.notas.textContent  = dev.notas || '—';
  if (el.body)   el.body.innerHTML     = '<tr><td colspan="4" class="text-muted">Cargando…</td></tr>';

  document.getElementById('devVerModal')?.classList.add('is-open');

  try {
    const res = await fetch(`api/devoluciones.php?action=${action}&id=${refId}`).then(r => r.json());
    if (!res.ok) throw new Error(res.error);

    // Filtrar solo los productos de esta devolución
    const devRes = await fetch('api/devoluciones.php').then(r => r.json());
    // Recuperar los detalles de esta devolución desde el backend
    // (simplificado: mostramos los productos de la referencia como contexto)
    if (el.body) {
      el.body.innerHTML = res.detalle.map(p => `
        <tr>
          <td>${esc(p.producto)}</td>
          <td>${p.cantidad}</td>
          <td>${fmt(p.precio_unitario)}</td>
          <td>${fmt(p.cantidad * p.precio_unitario)}</td>
        </tr>`).join('');
    }
  } catch (e) {
    if (el.body) el.body.innerHTML = `<tr><td colspan="4" style="color:var(--danger)">${e.message}</td></tr>`;
  }
}

// ── Aprobar / Rechazar ────────────────────────────────────────────────────────
async function cambiarEstado(id, estado) {
  const labels = { aprobada: 'aprobar', rechazada: 'rechazar' };
  if (!confirm(`¿${labels[estado].charAt(0).toUpperCase() + labels[estado].slice(1)} la devolución #${id}?`)) return;

  const res  = await fetch('api/devoluciones.php', {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ id, estado }),
  }).then(r => r.json());

  if (!res.ok) return alert(res.error || 'Error al actualizar.');
  if (estado === 'aprobada') {
    window.dispatchEvent(new CustomEvent('lb-stock-changed'));
  }
  cargarDevoluciones();
}

// ── Eliminar ──────────────────────────────────────────────────────────────────
async function eliminarDevolucion(id) {
  if (!confirm(`¿Eliminar la devolución #${id}? Esta acción no se puede deshacer.`)) return;
  const res = await fetch(`api/devoluciones.php?id=${id}`, { method: 'DELETE' }).then(r => r.json());
  if (!res.ok) return alert(res.error || 'Error al eliminar.');
  cargarDevoluciones();
}

// ── Formulario nueva devolución ───────────────────────────────────────────────
function abrirNuevaDevolucion() {
  refDetalle = [];
  document.getElementById('devFormTipo').value    = 'venta';
  document.getElementById('devFormRef').value     = '';
  document.getElementById('devFormMotivo').value  = '';
  document.getElementById('devFormNotas').value   = '';
  document.getElementById('devRefInfo').hidden    = true;
  document.getElementById('devProductosArea').innerHTML = '';
  showFormMsg('');
  document.getElementById('devFormModal')?.classList.add('is-open');
}

function cerrarNuevaDevolucion() {
  document.getElementById('devFormModal')?.classList.remove('is-open');
}

function cerrarVerDevolucion() {
  document.getElementById('devVerModal')?.classList.remove('is-open');
}

function showFormMsg(msg, tipo = 'error') {
  const el = document.getElementById('devFormMsg');
  if (!el) return;
  el.textContent = msg;
  el.hidden      = !msg;
  el.style.color = tipo === 'ok' ? 'var(--success,#059669)' : 'var(--danger)';
}

async function buscarReferencia() {
  const tipo  = document.getElementById('devFormTipo').value;
  const refId = parseInt(document.getElementById('devFormRef').value);
  if (!refId) return showFormMsg('Ingrese un número de ' + (tipo === 'venta' ? 'venta' : 'compra') + '.');

  const action = tipo === 'venta' ? 'ref_venta' : 'ref_compra';
  showFormMsg('');
  document.getElementById('devRefInfo').hidden = true;
  document.getElementById('devProductosArea').innerHTML = '<p class="text-muted" style="padding:.5rem 0">Buscando…</p>';

  try {
    const res = await fetch(`api/devoluciones.php?action=${action}&id=${refId}`).then(r => r.json());
    if (!res.ok) {
      document.getElementById('devProductosArea').innerHTML = '';
      return showFormMsg(res.error);
    }

    const cab = res.cabecera;
    const info = document.getElementById('devRefInfo');
    const infoText = document.getElementById('devRefInfoText');
    if (info && infoText) {
      infoText.innerHTML = tipo === 'venta'
        ? `Venta #${cab.id_venta} &nbsp;·&nbsp; ${cab.fecha} &nbsp;·&nbsp; Total: ${fmt(cab.total)}`
        : `Compra #${cab.id_compra} &nbsp;·&nbsp; ${cab.fecha}`;
      info.hidden = false;
    }

    refDetalle = res.detalle;
    renderProductosDevolucion(res.detalle);
  } catch (e) {
    document.getElementById('devProductosArea').innerHTML = '';
    showFormMsg(e.message);
  }
}

function renderProductosDevolucion(detalle) {
  const cont = document.getElementById('devProductosArea');
  if (!cont) return;

  if (!detalle.length) {
    cont.innerHTML = '<p class="text-muted">No se encontraron productos en esta referencia.</p>';
    return;
  }

  cont.innerHTML = `
    <table class="data-table" style="margin-top:.5rem;">
      <thead>
        <tr>
          <th><input type="checkbox" id="devChkAll" title="Seleccionar todos"> Producto</th>
          <th>Disp.</th>
          <th>Devolver</th>
          <th>Precio unit.</th>
        </tr>
      </thead>
      <tbody>
        ${detalle.map((p, i) => `
          <tr>
            <td>
              <label style="display:flex;align-items:center;gap:.4rem;">
                <input type="checkbox" class="dev-chk-prod" data-idx="${i}" checked>
                ${esc(p.producto)}
              </label>
            </td>
            <td>${p.cantidad}</td>
            <td>
              <input type="number" class="compras-control dev-qty" data-idx="${i}"
                     style="width:5rem;" min="1" max="${p.cantidad}" value="${p.cantidad}">
            </td>
            <td>${fmt(p.precio_unitario)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  // Seleccionar / deseleccionar todos
  document.getElementById('devChkAll')?.addEventListener('change', (e) => {
    cont.querySelectorAll('.dev-chk-prod').forEach(cb => { cb.checked = e.target.checked; });
  });
}

async function guardarDevolucion() {
  const tipo         = document.getElementById('devFormTipo').value;
  const id_referencia= parseInt(document.getElementById('devFormRef').value);
  const motivo       = document.getElementById('devFormMotivo').value.trim();
  const notas        = document.getElementById('devFormNotas').value.trim();

  if (!id_referencia) return showFormMsg('Busque y seleccione una ' + (tipo === 'venta' ? 'venta' : 'compra') + '.');
  if (!motivo)        return showFormMsg('El motivo es requerido.');
  if (!refDetalle.length) return showFormMsg('Busque la referencia primero.');

  // Recopilar productos seleccionados
  const area    = document.getElementById('devProductosArea');
  const checks  = area?.querySelectorAll('.dev-chk-prod:checked') ?? [];
  if (!checks.length) return showFormMsg('Seleccione al menos un producto.');

  const detalle = [];
  checks.forEach(cb => {
    const idx = parseInt(cb.dataset.idx);
    const qty = parseInt(area.querySelector(`.dev-qty[data-idx="${idx}"]`)?.value ?? '0');
    const p   = refDetalle[idx];
    if (!p || qty <= 0) return;
    if (qty > p.cantidad) { showFormMsg(`Cantidad de «${p.producto}» supera lo disponible (${p.cantidad}).`); return; }
    detalle.push({ id_producto: p.id_producto, cantidad: qty, precio_unitario: p.precio_unitario });
  });

  if (!detalle.length) return showFormMsg('Ningún producto válido seleccionado.');

  const res = await fetch('api/devoluciones.php', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ tipo, id_referencia, motivo, notas, detalle }),
  }).then(r => r.json());

  if (!res.ok) return showFormMsg(res.error || 'Error al guardar.');
  cerrarNuevaDevolucion();
  cargarDevoluciones();
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function initDevoluciones() {
  window.verDevolucion      = verDevolucion;
  window.cambiarEstado      = cambiarEstado;
  window.eliminarDevolucion = eliminarDevolucion;

  window.addEventListener('lb-view', (e) => {
    if (e.detail?.id === 'devoluciones') cargarDevoluciones();
  });

  document.getElementById('devBtnNuevo')?.addEventListener('click', abrirNuevaDevolucion);
  document.getElementById('devFormCerrar')?.addEventListener('click', cerrarNuevaDevolucion);
  document.getElementById('devVerCerrar')?.addEventListener('click', cerrarVerDevolucion);
  document.getElementById('devBtnGuardar')?.addEventListener('click', guardarDevolucion);
  document.getElementById('devBtnBuscar')?.addEventListener('click', buscarReferencia);
  document.getElementById('devBtnFiltrar')?.addEventListener('click', cargarDevoluciones);

  // Enter en campo referencia dispara búsqueda
  document.getElementById('devFormRef')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); buscarReferencia(); }
  });

  // Cambio de tipo limpia el formulario
  document.getElementById('devFormTipo')?.addEventListener('change', () => {
    document.getElementById('devFormRef').value = '';
    document.getElementById('devRefInfo').hidden = true;
    document.getElementById('devProductosArea').innerHTML = '';
    refDetalle = [];
    showFormMsg('');
  });

  const view = document.getElementById('view-devoluciones');
  if (view?.classList.contains('is-active')) cargarDevoluciones();
}
