/**
 * Ventas — ventas + detalle_venta + tipo_pago
 */

function apiUrl(path) {
  const p = window.location.pathname;
  const dir = p.lastIndexOf('/') > 0 ? p.slice(0, p.lastIndexOf('/') + 1) : '/';
  return `${window.location.origin}${dir}${path}`;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

const money = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

let catalogoCache = null;

window.addEventListener('lb-invalidate-ventas-catalog', () => {
  catalogoCache = null;
});

async function fetchCatalogo() {
  if (catalogoCache) return catalogoCache;
  const res = await fetch(`${apiUrl('api/ventas.php')}?catalog=1`, { cache: 'no-store' });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'No se pudo cargar el catálogo');
  catalogoCache = data;
  return data;
}

function formatFechaIso(fechaStr) {
  if (!fechaStr) return '—';
  const d = new Date(String(fechaStr).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return escapeHtml(fechaStr);
  return d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

function datetimeLocalValue(fechaMysql) {
  if (!fechaMysql) return '';
  const s = String(fechaMysql).replace(' ', 'T');
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valor para input datetime-local: fecha y hora actual del equipo (editable por el usuario). */
function datetimeLocalNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fillTipoPagoSelect(select, tipos, value) {
  if (!select) return;
  select.innerHTML = '<option value="">— Seleccione —</option>';
  tipos.forEach((t) => {
    const o = document.createElement('option');
    o.value = String(t.id_tipo_pago);
    o.textContent = t.nombre;
    select.appendChild(o);
  });
  if (value != null && value !== '') select.value = String(value);
}

function productOptionsHtml(productos) {
  let html = '<option value="">— Producto —</option>';
  productos.forEach((p) => {
    const precio = p.precioInicial ?? '';
    html += `<option value="${p.idProducto}" data-precio="${precio}">${escapeHtml(p.nombre)}</option>`;
  });
  return html;
}

function addFilaVenta(tbody, productos, valores) {
  const tr = document.createElement('tr');
  tr.className = 'ventas-fila';
  tr.innerHTML = `
    <td><select class="compras-control ventas-sel-producto" required>${productOptionsHtml(productos)}</select></td>
    <td><input type="number" class="compras-control ventas-in-cant" min="1" step="1" value="${valores?.cantidad ?? 1}" required></td>
    <td><input type="number" class="compras-control ventas-in-precio" min="0" step="0.01" value="${valores?.precio ?? ''}" required title="Precio de venta unitario"></td>
    <td class="compras-cel-sub ventas-cel-sub">—</td>
    <td><button type="button" class="btn btn-ghost compras-btn-quitar ventas-btn-quitar">Quitar</button></td>
  `;
  const sel = tr.querySelector('.ventas-sel-producto');
  const precioIn = tr.querySelector('.ventas-in-precio');
  if (valores?.idProducto) sel.value = String(valores.idProducto);
  if ((valores?.precio == null || valores.precio === '') && sel.selectedOptions[0]?.dataset.precio) {
    const dp = sel.selectedOptions[0].dataset.precio;
    if (dp !== '' && !Number.isNaN(parseFloat(dp))) precioIn.value = dp;
  }
  tbody.appendChild(tr);
  bindFilaVenta(tr);
  recalcFilaVenta(tr);
}

function bindFilaVenta(tr) {
  const sel = tr.querySelector('.ventas-sel-producto');
  const cant = tr.querySelector('.ventas-in-cant');
  const precio = tr.querySelector('.ventas-in-precio');
  const quitar = tr.querySelector('.ventas-btn-quitar');
  [sel, cant, precio].forEach((el) => el.addEventListener('input', () => recalcFilaVenta(tr)));
  sel.addEventListener('change', () => {
    const opt = sel.selectedOptions[0];
    if (opt?.dataset.precio !== undefined && opt.dataset.precio !== '') {
      const v = parseFloat(opt.dataset.precio);
      if (!Number.isNaN(v)) precio.value = String(v);
    }
    recalcFilaVenta(tr);
  });
  quitar.addEventListener('click', () => {
    const tbody = tr.parentElement;
    if (tbody.querySelectorAll('tr').length <= 1) {
      alert('Debe haber al menos una línea de producto.');
      return;
    }
    tr.remove();
    recalcTotalVentaForm(tbody.closest('form'));
  });
}

function recalcFilaVenta(tr) {
  const cant = parseFloat(tr.querySelector('.ventas-in-cant').value) || 0;
  const precio = parseFloat(tr.querySelector('.ventas-in-precio').value) || 0;
  const sub = cant * precio;
  tr.querySelector('.ventas-cel-sub').textContent = money.format(sub);
  recalcTotalVentaForm(tr.closest('form'));
}

function recalcTotalVentaForm(form) {
  if (!form) return;
  const idTotal = form.dataset.totalId;
  if (!idTotal) return;
  const el = document.getElementById(idTotal);
  if (!el) return;
  let sum = 0;
  form.querySelectorAll('.ventas-tbody-filas tr').forEach((tr) => {
    const cant = parseFloat(tr.querySelector('.ventas-in-cant')?.value) || 0;
    const precio = parseFloat(tr.querySelector('.ventas-in-precio')?.value) || 0;
    sum += cant * precio;
  });
  el.textContent = money.format(sum);
}

function collectDetallesFromForm(form) {
  const detalles = [];
  form.querySelectorAll('.ventas-tbody-filas tr').forEach((tr) => {
    const idProducto = parseInt(tr.querySelector('.ventas-sel-producto')?.value, 10);
    const cantidad = parseInt(tr.querySelector('.ventas-in-cant')?.value, 10);
    const precio = parseFloat(tr.querySelector('.ventas-in-precio')?.value);
    if (idProducto && cantidad > 0 && !Number.isNaN(precio)) {
      detalles.push({ idProducto, cantidad, precio });
    }
  });
  return detalles;
}

async function loadStats() {
  const hoy = document.getElementById('ventaStatHoy');
  const sem = document.getElementById('ventaStatSemana');
  const ticket = document.getElementById('ventaStatTicket');
  if (!hoy || !sem || !ticket) return;
  try {
    const res = await fetch(`${apiUrl('api/ventas.php')}?stats=1`, { cache: 'no-store' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Sin estadísticas');
    const st = data.stats || {};
    hoy.textContent = money.format(Number(st.totalHoy) || 0);
    sem.textContent = money.format(Number(st.totalSemana) || 0);
    ticket.textContent = money.format(Number(st.ticketPromedioMes) || 0);
  } catch {
    hoy.textContent = '—';
    sem.textContent = '—';
    ticket.textContent = '—';
  }
}

async function loadLista() {
  const tbody = document.getElementById('ventasTablaBody');
  const empty = document.getElementById('ventasEmpty');
  const msg = document.getElementById('ventasModuleMsg');
  if (!tbody) return;
  msg.hidden = true;
  tbody.innerHTML = '<tr><td colspan="6">Cargando…</td></tr>';
  try {
    const res = await fetch(apiUrl('api/ventas.php'), { cache: 'no-store' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al listar');
    tbody.innerHTML = '';
    const rows = data.ventas || [];
    if (!rows.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      const nl = Number(r.num_lineas) || 0;
      tr.innerHTML = `
        <td>${r.id_venta}</td>
        <td>${formatFechaIso(r.fecha)}</td>
        <td>${money.format(Number(r.total) || 0)}</td>
        <td>${escapeHtml(r.nombre_tipo_pago || '')}</td>
        <td>${nl}</td>
        <td class="compras-acciones">
          <button type="button" class="btn btn-sm btn-ghost" data-v-act="ver" data-v-id="${r.id_venta}">Ver</button>
          <button type="button" class="btn btn-sm btn-primary-inline" data-v-act="editar" data-v-id="${r.id_venta}">Editar</button>
          <button type="button" class="btn btn-sm btn-ghost" data-v-act="eliminar" data-v-id="${r.id_venta}">Eliminar</button>
        </td>`;
      tbody.appendChild(tr);
    });
  } catch (e) {
    tbody.innerHTML = '';
    msg.textContent = e.message || String(e);
    msg.hidden = false;
  }
}

function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.add('is-open');
  m.setAttribute('aria-hidden', 'false');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.remove('is-open');
  m.setAttribute('aria-hidden', 'true');
}

function renderVerDetalle(data) {
  const head = document.getElementById('ventaVerHead');
  const tbody = document.getElementById('ventaVerLineasBody');
  if (!head || !tbody) return;
  const v = data.venta;
  head.textContent = `Venta #${v.id_venta} · ${formatFechaIso(v.fecha)} · ${v.nombre_tipo_pago || ''} · Total ${money.format(Number(v.total) || 0)}`;
  tbody.innerHTML = '';
  (data.detalles || []).forEach((d) => {
    const sub = Number(d.cantidad) * Number(d.precio);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(d.nombreProducto || '')}</td>
      <td>${d.cantidad}</td>
      <td>${money.format(Number(d.precio) || 0)}</td>
      <td>${money.format(sub)}</td>
      <td class="ventas-ver-cat">${money.format(Number(d.precioCatalogo) || 0)}</td>`;
    tbody.appendChild(tr);
  });
}

export function initVentas() {
  const btnNueva = document.getElementById('ventasBtnNueva');
  const formNueva = document.getElementById('formVentaNueva');
  const formEdit = document.getElementById('formVentaEdit');
  const tabla = document.getElementById('ventasTabla');

  window.addEventListener('lb-view', (e) => {
    if (e.detail?.id === 'ventas') {
      loadLista();
      loadStats();
    }
  });

  btnNueva?.addEventListener('click', async () => {
    try {
      const cat = await fetchCatalogo();
      if (!cat.tipos_pago?.length) {
        alert('Primero registre al menos un tipo de pago en Configuración.');
        return;
      }
      fillTipoPagoSelect(document.getElementById('ventaNuevaTipo'), cat.tipos_pago, '');
      const tb = document.getElementById('ventasNuevaFilas');
      tb.innerHTML = '';
      addFilaVenta(tb, cat.productos, null);
      const feNueva = document.getElementById('ventaNuevaFecha');
      if (feNueva) feNueva.value = datetimeLocalNow();
      openModal('modalVentaNueva');
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  document.getElementById('ventasBtnAddFilaNueva')?.addEventListener('click', async () => {
    try {
      const cat = await fetchCatalogo();
      const tb = document.getElementById('ventasNuevaFilas');
      addFilaVenta(tb, cat.productos, null);
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  document.getElementById('ventasBtnAddFilaEdit')?.addEventListener('click', async () => {
    try {
      const cat = await fetchCatalogo();
      const tb = document.getElementById('ventasEditFilas');
      addFilaVenta(tb, cat.productos, null);
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  document
    .querySelectorAll(
      '#modalVentaNueva [data-close-modal], #modalVentaEdit [data-close-modal], #modalVentaEliminar [data-close-modal], #modalVentaVer [data-close-modal]'
    )
    .forEach((el) => {
      el.addEventListener('click', () => {
        const modal = el.closest('.lb-modal');
        if (modal) closeModal(modal.id);
      });
    });

  formNueva?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idTipo = parseInt(document.getElementById('ventaNuevaTipo').value, 10);
    const fechaEl = document.getElementById('ventaNuevaFecha');
    const detalles = collectDetallesFromForm(formNueva);
    const payload = { id_tipo_pago: idTipo, detalles };
    if (fechaEl?.value) payload.fecha = fechaEl.value.replace('T', ' ');
    try {
      const res = await fetch(apiUrl('api/ventas.php'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No se pudo guardar');
      closeModal('modalVentaNueva');
      await loadLista();
      await loadStats();
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  formEdit?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = parseInt(document.getElementById('ventaEditId').value, 10);
    const idTipo = parseInt(document.getElementById('ventaEditTipo').value, 10);
    const fechaEl = document.getElementById('ventaEditFecha');
    const detalles = collectDetallesFromForm(formEdit);
    const payload = {
      id_tipo_pago: idTipo,
      fecha: fechaEl?.value ? fechaEl.value.replace('T', ' ') : '',
      detalles,
    };
    try {
      const res = await fetch(`${apiUrl('api/ventas.php')}?action=update&id=${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No se pudo actualizar');
      closeModal('modalVentaEdit');
      await loadLista();
      await loadStats();
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  tabla?.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-v-act]');
    if (!btn) return;
    const id = parseInt(btn.dataset.vId, 10);
    const act = btn.dataset.vAct;
    if (act === 'eliminar') {
      document.getElementById('ventaEliminarId').value = String(id);
      document.getElementById('ventaEliminarMsg').textContent = `¿Eliminar la venta #${id}? Esta acción no se puede deshacer.`;
      openModal('modalVentaEliminar');
      return;
    }
    try {
      const res = await fetch(`${apiUrl('api/ventas.php')}?id=${id}`, { cache: 'no-store' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No se encontró la venta');
      if (act === 'ver') {
        renderVerDetalle(data);
        openModal('modalVentaVer');
        return;
      }
      if (act === 'editar') {
        const cat = await fetchCatalogo();
        if (!cat.tipos_pago?.length) {
          alert('Registre tipos de pago en Configuración.');
          return;
        }
        const v = data.venta;
        document.getElementById('ventaEditId').value = String(v.id_venta);
        fillTipoPagoSelect(document.getElementById('ventaEditTipo'), cat.tipos_pago, v.id_tipo_pago);
        const fe = document.getElementById('ventaEditFecha');
        if (fe) fe.value = datetimeLocalValue(v.fecha);
        const tb = document.getElementById('ventasEditFilas');
        tb.innerHTML = '';
        const dets = data.detalles || [];
        if (dets.length) {
          dets.forEach((d) =>
            addFilaVenta(tb, cat.productos, {
              idProducto: d.idProducto,
              cantidad: d.cantidad,
              precio: d.precio,
            })
          );
        } else {
          addFilaVenta(tb, cat.productos, null);
        }
        recalcTotalVentaForm(formEdit);
        openModal('modalVentaEdit');
      }
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  document.getElementById('ventaBtnConfirmEliminar')?.addEventListener('click', async () => {
    const id = parseInt(document.getElementById('ventaEliminarId').value, 10);
    if (!id) return;
    try {
      const res = await fetch(`${apiUrl('api/ventas.php')}?action=delete&id=${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No se pudo eliminar');
      closeModal('modalVentaEliminar');
      await loadLista();
      await loadStats();
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  const viewVentas = document.getElementById('view-ventas');
  if (viewVentas?.classList.contains('is-active')) {
    loadLista();
    loadStats();
  }
}
