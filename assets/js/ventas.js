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

window.addEventListener('lb-stock-changed', () => {
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

function invalidateStockTrasVenta() {
  window.dispatchEvent(new CustomEvent('lb-invalidate-ventas-catalog'));
  window.dispatchEvent(new CustomEvent('lb-invalidate-compras-catalog'));
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
  // deprecated (antes usábamos <select>); se deja por compat si alguien lo llama.
  let html = '<option value="">— Producto —</option>';
  productos.forEach((p) => {
    html += `<option value="${p.idProducto}">${escapeHtml(p.nombre)}</option>`;
  });
  return html;
}

function codigoProductoVisible(p) {
  const c = p.codigoOEM != null ? String(p.codigoOEM).trim() : '';
  return c || String(p.idProducto ?? '');
}

function productoLabel(p) {
  return `${codigoProductoVisible(p)} - ${p.nombre}`;
}

let ventasProductListSeq = 0;

function ventasProductDatalistHtml(productos) {
  let html = '';
  productos.forEach((p) => {
    const precio = p.precioInicial ?? '';
    const stock = p.stock ?? '';
    html += `<option value="${escapeHtml(productoLabel(p))}" data-id="${p.idProducto}" data-precio="${precio}" data-stock="${stock}"></option>`;
  });
  return html;
}

function addFilaVenta(tbody, productos, valores) {
  ventasProductListSeq += 1;
  const listId = `ventasProductosList${ventasProductListSeq}`;
  const tr = document.createElement('tr');
  tr.className = 'ventas-fila';
  tr._ventasProductos = productos;
  tr.innerHTML = `
    <td>
      <input type="search" class="compras-control ventas-in-producto" placeholder="Buscar por código o nombre..." list="${listId}" autocomplete="off" required>
      <datalist id="${listId}">${ventasProductDatalistHtml(productos)}</datalist>
      <input type="hidden" class="ventas-sel-producto" value="">
    </td>
    <td>
      <input type="number" class="compras-control ventas-in-cant" min="1" step="1" value="${valores?.cantidad ?? 1}" required>
      <small class="compras-sub" style="display:block;margin-top:0.25rem;">Disp: <span class="ventas-stock">—</span></small>
    </td>
    <td><input type="number" class="compras-control ventas-in-precio" min="0" step="0.01" value="${valores?.precio ?? ''}" required readonly title="Precio de venta unitario (catálogo)"></td>
    <td class="compras-cel-sub ventas-cel-sub">—</td>
    <td><button type="button" class="btn btn-ghost compras-btn-quitar ventas-btn-quitar">Eliminar</button></td>
  `;
  const sel = tr.querySelector('.ventas-sel-producto');
  const inProd = tr.querySelector('.ventas-in-producto');
  const precioIn = tr.querySelector('.ventas-in-precio');
  const stockEl = tr.querySelector('.ventas-stock');

  if (valores?.idProducto) {
    const found = productos.find((p) => String(p.idProducto) === String(valores.idProducto));
    if (found) {
      sel.value = String(found.idProducto);
      sel.dataset.stock = String(found.stock ?? '');
      inProd.value = productoLabel(found);
      if (stockEl) stockEl.textContent = String(found.stock ?? '0');
      if (valores?.precio == null || valores.precio === '') precioIn.value = String(found.precioInicial ?? '');
      const max = parseInt(found.stock ?? '0', 10);
      const cantIn = tr.querySelector('.ventas-in-cant');
      if (!Number.isNaN(max) && max >= 0) cantIn.max = String(max);
    }
  }

  tbody.appendChild(tr);
  bindFilaVenta(tr);
  recalcFilaVenta(tr);
}

function limpiarFilaVenta(tr) {
  const sel = tr.querySelector('.ventas-sel-producto');
  const inProd = tr.querySelector('.ventas-in-producto');
  const cant = tr.querySelector('.ventas-in-cant');
  const precio = tr.querySelector('.ventas-in-precio');
  if (sel) {
    sel.value = '';
    delete sel.dataset.stock;
  }
  if (inProd) inProd.value = '';
  if (cant) cant.value = '1';
  if (cant) cant.removeAttribute('max');
  if (precio) precio.value = '';
  const stockEl = tr.querySelector('.ventas-stock');
  if (stockEl) stockEl.textContent = '—';
  recalcFilaVenta(tr);
}

function resolverProductoVentaFila(tr, completar) {
  const productos = tr._ventasProductos || [];
  const inProd = tr.querySelector('.ventas-in-producto');
  const sel = tr.querySelector('.ventas-sel-producto');
  const precio = tr.querySelector('.ventas-in-precio');
  const cant = tr.querySelector('.ventas-in-cant');
  const stockEl = tr.querySelector('.ventas-stock');
  if (!inProd || !sel || !cant) return;

  const typed = inProd.value.trim();
  let found = productos.find((p) => productoLabel(p) === typed);
  if (!found && typed !== '') {
    found = productos.find((p) => codigoProductoVisible(p) === typed);
  }
  if (!found && /^\d+$/.test(typed)) {
    found = productos.find((p) => String(p.idProducto) === typed);
  }
  if (!found) {
    const legacy = /^(\d+)\s*-\s*/.exec(typed);
    if (legacy) found = productos.find((p) => String(p.idProducto) === legacy[1]);
  }

  if (!found) {
    sel.value = '';
    delete sel.dataset.stock;
    cant.removeAttribute('max');
    if (stockEl) stockEl.textContent = '—';
    cant.setCustomValidity('Seleccione un producto válido de la lista.');
    return;
  }

  const form = tr.closest('form');
  const repetido = form
    ? [...form.querySelectorAll('.ventas-tbody-filas tr')]
      .filter((row) => row !== tr)
      .some((row) => String(row.querySelector('.ventas-sel-producto')?.value || '') === String(found.idProducto))
    : false;
  if (repetido) {
    sel.value = '';
    delete sel.dataset.stock;
    inProd.value = '';
    cant.removeAttribute('max');
    if (stockEl) stockEl.textContent = '—';
    cant.setCustomValidity('Ese producto ya está agregado en otra línea.');
    alert('Ese producto ya está agregado en esta venta. Use otra línea solo para productos distintos o aumente la cantidad en la línea existente.');
    return;
  }

  sel.value = String(found.idProducto);
  sel.dataset.stock = String(found.stock ?? '0');
  inProd.value = productoLabel(found);
  const max = parseInt(found.stock ?? '0', 10);
  if (!Number.isNaN(max) && max >= 0) cant.max = String(max);
  if (stockEl) stockEl.textContent = String(found.stock ?? '0');

  if (completar) {
    const v = parseFloat(found.precioInicial ?? '');
    if (precio && !Number.isNaN(v)) precio.value = String(v);
  }

  cant.setCustomValidity('');
}

function clampCantidadToStock(tr) {
  const cant = tr.querySelector('.ventas-in-cant');
  const sel = tr.querySelector('.ventas-sel-producto');
  if (!cant || !sel) return;
  const max = parseInt(sel.dataset.stock ?? cant.max ?? '', 10);
  if (Number.isNaN(max) || max < 0) return;
  const v = parseInt(cant.value || '0', 10) || 0;
  if (v > max) {
    cant.value = String(max);
    cant.setCustomValidity(`Stock insuficiente. Disponibles: ${max}.`);
  } else if (v >= 1) {
    cant.setCustomValidity('');
  }
}

function bindFilaVenta(tr) {
  const sel = tr.querySelector('.ventas-sel-producto');
  const inProd = tr.querySelector('.ventas-in-producto');
  const cant = tr.querySelector('.ventas-in-cant');
  const precio = tr.querySelector('.ventas-in-precio');
  const quitar = tr.querySelector('.ventas-btn-quitar');
  [inProd, cant].forEach((el) => el.addEventListener('input', () => recalcFilaVenta(tr)));
  inProd.addEventListener('change', () => {
    resolverProductoVentaFila(tr, true);
    clampCantidadToStock(tr);
    recalcFilaVenta(tr);
  });
  inProd.addEventListener('blur', () => {
    resolverProductoVentaFila(tr, false);
    clampCantidadToStock(tr);
    recalcFilaVenta(tr);
  });
  cant.addEventListener('input', () => {
    clampCantidadToStock(tr);
    recalcFilaVenta(tr);
  });
  quitar.addEventListener('click', () => {
    const tbody = tr.parentElement;
    const form = tbody?.closest('form');
    if (tbody.querySelectorAll('tr').length <= 1) {
      limpiarFilaVenta(tr);
      if (form) recalcTotalVentaForm(form);
      return;
    }
    tr.remove();
    if (form) recalcTotalVentaForm(form);
  });
}

function recalcFilaVenta(tr) {
  clampCantidadToStock(tr);
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
  const ids = new Set();
  let tieneDuplicado = false;
  form.querySelectorAll('.ventas-tbody-filas tr').forEach((tr) => {
    const idProducto = parseInt(tr.querySelector('.ventas-sel-producto')?.value, 10);
    const cantidad = parseInt(tr.querySelector('.ventas-in-cant')?.value, 10);
    const precio = parseFloat(tr.querySelector('.ventas-in-precio')?.value);
    const stock = parseInt(tr.querySelector('.ventas-sel-producto')?.dataset?.stock ?? '', 10);
    if (idProducto && cantidad > 0 && !Number.isNaN(precio)) {
      if (ids.has(idProducto)) {
        tieneDuplicado = true;
        return;
      }
      ids.add(idProducto);
      if (!Number.isNaN(stock) && stock >= 0 && cantidad > stock) return;
      detalles.push({ idProducto, cantidad, precio });
    }
  });
  return { detalles, tieneDuplicado };
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

let ventasListaDebounce = null;

async function loadLista() {
  const tbody = document.getElementById('ventasTablaBody');
  const empty = document.getElementById('ventasEmpty');
  const msg = document.getElementById('ventasModuleMsg');
  if (!tbody) return;
  msg.hidden = true;
  const idRaw = document.getElementById('ventasBuscarId')?.value?.trim() ?? '';
  const fecha = document.getElementById('ventasFiltroFecha')?.value ?? '';
  const params = new URLSearchParams();
  if (idRaw !== '' && /^\d+$/.test(idRaw)) params.set('q', idRaw);
  if (fecha) params.set('fecha', fecha);
  const qs = params.toString();
  const url = qs ? `${apiUrl('api/ventas.php')}?${qs}` : apiUrl('api/ventas.php');
  const hasFiltro = !!(idRaw || fecha);

  tbody.innerHTML = '<tr><td colspan="6">Cargando…</td></tr>';
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al listar');
    tbody.innerHTML = '';
    const rows = data.ventas || [];
    if (!rows.length) {
      empty.hidden = false;
      empty.textContent = hasFiltro
        ? 'Ninguna venta coincide con el ID o la fecha seleccionados.'
        : 'No hay ventas registradas.';
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

  const trazEl = document.getElementById('ventaVerTraz');
  if (trazEl) {
    const creadoPor = v.creado_por_nombre ? escapeHtml(v.creado_por_nombre) : '—';
    let trazHtml = `<span>Registrado por: <strong>${creadoPor}</strong></span>`;
    if (v.modificado_por_nombre) {
      trazHtml += ` &nbsp;·&nbsp; <span>Editado por: <strong>${escapeHtml(v.modificado_por_nombre)}</strong>`;
      if (v.modificado_en) trazHtml += ` <span style="color:var(--text-muted)">(${formatFechaIso(v.modificado_en)})</span>`;
      trazHtml += '</span>';
    }
    trazEl.innerHTML = trazHtml;
  }

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

function renderDevolucionesSection(container, devoluciones) {
  if (!devoluciones.length) { container.innerHTML = ''; return; }
  const badgeStyle = {
    pendiente: 'background:#f59e0b;color:#fff',
    aprobada:  'background:#22c55e;color:#fff',
    rechazada: 'background:#ef4444;color:#fff',
  };
  const resumen = {};
  devoluciones.forEach((dev) => {
    if (dev.estado === 'aprobada') {
      dev.productos.forEach((p) => {
        if (!resumen[p.id_producto]) resumen[p.id_producto] = { nombre: p.producto, cantidad: 0 };
        resumen[p.id_producto].cantidad += p.cantidad;
      });
    }
  });
  const resumenEntries = Object.values(resumen);
  let html = `<div style="margin-top:1.5rem;border-top:1px solid var(--border);padding-top:1rem;">
    <h3 style="font-size:.95rem;font-weight:600;margin:0 0 .75rem;">Devoluciones (${devoluciones.length})</h3>`;
  if (resumenEntries.length) {
    html += `<p style="font-size:.8rem;font-weight:600;margin:0 0 .4rem;color:var(--text-muted)">Unidades devueltas y aprobadas:</p>
      <div class="table-wrap" style="margin-bottom:.75rem;"><table class="data-table" style="font-size:.82rem;">
        <thead><tr><th>Producto</th><th>Cant. devuelta</th></tr></thead><tbody>`;
    resumenEntries.forEach((r) => {
      html += `<tr><td>${escapeHtml(r.nombre)}</td><td>${r.cantidad}</td></tr>`;
    });
    html += '</tbody></table></div>';
  }
  devoluciones.forEach((dev) => {
    const bs = badgeStyle[dev.estado] ?? 'background:#888;color:#fff';
    html += `<div style="border:1px solid var(--border);border-radius:.5rem;padding:.65rem .8rem;margin-bottom:.5rem;font-size:.83rem;">
      <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin-bottom:.25rem;">
        <strong>Dev. #${dev.id}</strong>
        <span style="display:inline-block;padding:.1rem .45rem;border-radius:.25rem;font-size:.72rem;font-weight:700;${bs}">${escapeHtml(dev.estado)}</span>
        <span style="color:var(--text-muted)">${escapeHtml(dev.fecha)}</span>
      </div>
      <p style="margin:.1rem 0 .35rem;color:var(--text-muted)">Motivo: ${escapeHtml(dev.motivo)}${dev.notas ? ` · ${escapeHtml(dev.notas)}` : ''}</p>
      <table class="data-table" style="font-size:.8rem;">
        <thead><tr><th>Producto</th><th>Cant.</th><th>P. unit.</th></tr></thead><tbody>`;
    dev.productos.forEach((p) => {
      html += `<tr><td>${escapeHtml(p.producto)}</td><td>${p.cantidad}</td><td>${money.format(Number(p.precio_unitario))}</td></tr>`;
    });
    html += '</tbody></table></div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

async function loadDevolucionesVenta(id) {
  const container = document.getElementById('ventaVerDevoluciones');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;margin-top:1.5rem;padding-top:.75rem;border-top:1px solid var(--border)">Cargando devoluciones…</p>';
  try {
    const res = await fetch(`${apiUrl('api/devoluciones.php')}?action=by_ref&tipo=venta&id=${id}`, { cache: 'no-store' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error');
    renderDevolucionesSection(container, data.devoluciones);
  } catch {
    container.innerHTML = '';
  }
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

  document.getElementById('ventasBuscarId')?.addEventListener('input', () => {
    clearTimeout(ventasListaDebounce);
    ventasListaDebounce = setTimeout(() => loadLista(), 320);
  });
  document.getElementById('ventasFiltroFecha')?.addEventListener('change', () => loadLista());

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
    const { detalles, tieneDuplicado } = collectDetallesFromForm(formNueva);
    if (tieneDuplicado) {
      alert('No puede repetir el mismo producto en una venta.');
      return;
    }
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
      invalidateStockTrasVenta();
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
    const { detalles, tieneDuplicado } = collectDetallesFromForm(formEdit);
    if (tieneDuplicado) {
      alert('No puede repetir el mismo producto en una venta.');
      return;
    }
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
      invalidateStockTrasVenta();
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
        loadDevolucionesVenta(data.venta.id_venta);
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
        // Suma las cantidades de esta venta al stock mostrado: al editar, esos productos están "disponibles"
        const prodsAjustados = cat.productos.map((p) => {
          const d = dets.find((det) => String(det.idProducto) === String(p.idProducto));
          if (!d) return p;
          return { ...p, stock: (Number(p.stock) || 0) + Number(d.cantidad) };
        });
        if (dets.length) {
          dets.forEach((d) =>
            addFilaVenta(tb, prodsAjustados, {
              idProducto: d.idProducto,
              cantidad: d.cantidad,
              precio: d.precio,
            })
          );
        } else {
          addFilaVenta(tb, prodsAjustados, null);
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
      invalidateStockTrasVenta();
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
