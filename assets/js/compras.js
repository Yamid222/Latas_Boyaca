/**
 * Módulo Compras — API PHP + MySQL (LATAS_BOYACA)
 */

function apiUrl(path) {
  const p = window.location.pathname;
  const dir = p.lastIndexOf('/') > 0 ? p.slice(0, p.lastIndexOf('/') + 1) : '/';
  return `${window.location.origin}${dir}${path}`;
}

const money = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

let catalogoCache = null;

window.addEventListener('lb-invalidate-compras-catalog', () => {
  catalogoCache = null;
});

async function fetchCatalogo() {
  if (catalogoCache) return catalogoCache;
  const res = await fetch(apiUrl('api/compras.php?catalog=1'), { cache: 'no-store' });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'No se pudo cargar el catálogo');
  catalogoCache = data;
  return data;
}

function codigoImportadorVisible(i) {
  const c = i.codigo != null ? String(i.codigo).trim() : '';
  return c || String(i.idImportador ?? '');
}

function importadorLabel(i) {
  return `${codigoImportadorVisible(i)} - ${i.nombre}`;
}

function fillImportadorPicker(hiddenInput, textInput, importadores, value) {
  const listId = textInput?.getAttribute('list');
  const dl = listId ? document.getElementById(listId) : null;
  if (!hiddenInput || !textInput || !dl) return;
  dl.innerHTML = '';
  importadores.forEach((i) => {
    const opt = document.createElement('option');
    opt.value = importadorLabel(i);
    opt.dataset.id = String(i.idImportador);
    dl.appendChild(opt);
  });
  if (value != null) {
    const found = importadores.find((i) => String(i.idImportador) === String(value));
    if (found) {
      hiddenInput.value = String(found.idImportador);
      textInput.value = importadorLabel(found);
      return;
    }
  }
  hiddenInput.value = '';
  textInput.value = '';
}

function resolverImportadorInput(hiddenInput, textInput) {
  const listId = textInput?.getAttribute('list');
  const dl = listId ? document.getElementById(listId) : null;
  if (!hiddenInput || !textInput || !dl) return;
  const typed = textInput.value.trim();
  const options = [...dl.querySelectorAll('option')];
  const exact = options.find((opt) => opt.value === typed);
  if (exact?.dataset.id) {
    hiddenInput.value = exact.dataset.id;
    return;
  }
  if (/^\d+$/.test(typed)) {
    const byId = options.find((opt) => String(opt.dataset.id) === typed);
    if (byId?.dataset.id) {
      hiddenInput.value = byId.dataset.id;
      textInput.value = byId.value;
      return;
    }
  }
  hiddenInput.value = '';
}

let comprasProductListSeq = 0;

/** Código mostrado al usuario: OEM si existe, si no el id (mismo criterio que Productos). */
function codigoProductoVisible(p) {
  const c = p.codigoOEM != null ? String(p.codigoOEM).trim() : '';
  return c || String(p.idProducto ?? '');
}

function productoLabel(p) {
  return `${codigoProductoVisible(p)} - ${p.nombre}`;
}

function productDatalistHtml(productos) {
  let html = '';
  productos.forEach((p) => {
    html += `<option value="${escapeHtml(productoLabel(p))}" data-id="${p.idProducto}" data-precio="${p.precioInicial ?? ''}"></option>`;
  });
  return html;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function addFila(tbody, productos, valores) {
  comprasProductListSeq += 1;
  const listId = `comprasProductosList${comprasProductListSeq}`;
  const tr = document.createElement('tr');
  tr.className = 'compras-fila';
  tr._comprasProductos = productos;
  tr.innerHTML = `
    <td>
      <input type="search" class="compras-control compras-in-producto" placeholder="Buscar producto..." list="${listId}" autocomplete="off" required>
      <datalist id="${listId}">${productDatalistHtml(productos)}</datalist>
      <input type="hidden" class="compras-sel-producto" value="">
    </td>
    <td><input type="number" class="compras-control compras-in-cant" min="1" step="1" value="${valores?.cantidad ?? 1}" required></td>
    <td><input type="number" class="compras-control compras-in-precio" min="0" step="0.01" value="${valores?.precioCompra ?? ''}" required></td>
    <td><input type="number" class="compras-control compras-in-venta" min="0" step="0.01" value="${valores?.precioVenta ?? ''}" required></td>
    <td class="compras-cel-sub">—</td>
    <td><button type="button" class="btn btn-ghost compras-btn-quitar">Eliminar</button></td>
  `;
  const sel = tr.querySelector('.compras-sel-producto');
  const inProd = tr.querySelector('.compras-in-producto');
  const cant = tr.querySelector('.compras-in-cant');
  const precio = tr.querySelector('.compras-in-precio');
  const venta = tr.querySelector('.compras-in-venta');
  if (valores?.idProducto) {
    const found = productos.find((p) => String(p.idProducto) === String(valores.idProducto));
    if (found) {
      sel.value = String(found.idProducto);
      inProd.value = productoLabel(found);
      if (valores?.precioCompra == null) precio.value = String(found.precioInicial ?? '');
      if (valores?.precioVenta == null) venta.value = String(found.precioInicial ?? '');
    }
  }
  if (!inProd.value) sel.value = '';
  tbody.appendChild(tr);
  bindFilaEvents(tr);
  recalcFila(tr);
}

function limpiarFilaCompra(tr) {
  const sel = tr.querySelector('.compras-sel-producto');
  const inProd = tr.querySelector('.compras-in-producto');
  const cant = tr.querySelector('.compras-in-cant');
  const precio = tr.querySelector('.compras-in-precio');
  const venta = tr.querySelector('.compras-in-venta');
  if (sel) sel.value = '';
  if (inProd) inProd.value = '';
  if (cant) cant.value = '1';
  if (precio) precio.value = '';
  if (venta) venta.value = '';
  recalcFila(tr);
}

function resolverProductoFila(tr, completarPrecios) {
  const productos = tr._comprasProductos || [];
  const inProd = tr.querySelector('.compras-in-producto');
  const sel = tr.querySelector('.compras-sel-producto');
  const precio = tr.querySelector('.compras-in-precio');
  const venta = tr.querySelector('.compras-in-venta');
  if (!inProd || !sel) return;
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
    return;
  }
  sel.value = String(found.idProducto);
  inProd.value = productoLabel(found);
  const price = parseFloat(found.precioInicial ?? '');
  if (completarPrecios && !Number.isNaN(price)) {
    precio.value = String(price);
    venta.value = String(price);
  }
}

function bindFilaEvents(tr) {
  const sel = tr.querySelector('.compras-sel-producto');
  const inProd = tr.querySelector('.compras-in-producto');
  const cant = tr.querySelector('.compras-in-cant');
  const precio = tr.querySelector('.compras-in-precio');
  const venta = tr.querySelector('.compras-in-venta');
  const quitar = tr.querySelector('.compras-btn-quitar');
  [inProd, cant, precio, venta].forEach((el) => el.addEventListener('input', () => recalcFila(tr)));
  inProd.addEventListener('change', () => {
    resolverProductoFila(tr, true);
    recalcFila(tr);
  });
  inProd.addEventListener('blur', () => {
    resolverProductoFila(tr, false);
    recalcFila(tr);
  });
  quitar.addEventListener('click', () => {
    const tbody = tr.parentElement;
    const form = tbody?.closest('form');
    if (tbody.querySelectorAll('tr').length <= 1) {
      limpiarFilaCompra(tr);
      if (form) recalcTotalForm(form);
      return;
    }
    tr.remove();
    if (form) recalcTotalForm(form);
  });
}

function recalcFila(tr) {
  const cant = parseFloat(tr.querySelector('.compras-in-cant').value) || 0;
  const precio = parseFloat(tr.querySelector('.compras-in-precio').value) || 0;
  const sub = cant * precio;
  tr.querySelector('.compras-cel-sub').textContent = money.format(sub);
  const form = tr.closest('form');
  if (form) recalcTotalForm(form);
}

function recalcTotalForm(form) {
  if (!form) return;
  const idTotal = form.dataset.totalId;
  if (!idTotal) return;
  const el = document.getElementById(idTotal);
  if (!el) return;
  let sum = 0;
  form.querySelectorAll('tbody.compras-tbody-filas tr').forEach((tr) => {
    const cant = parseFloat(tr.querySelector('.compras-in-cant')?.value) || 0;
    const precio = parseFloat(tr.querySelector('.compras-in-precio')?.value) || 0;
    sum += cant * precio;
  });
  el.textContent = money.format(sum);
}

async function fillComprasProveedorFilter() {
  const sel = document.getElementById('comprasFiltroProveedor');
  if (!sel) return;
  const prev = sel.value;
  try {
    const cat = await fetchCatalogo();
    sel.innerHTML = '<option value="">Todos los proveedores</option>';
    cat.importadores.forEach((i) => {
      const o = document.createElement('option');
      o.value = String(i.idImportador);
      o.textContent = i.nombre;
      sel.appendChild(o);
    });
    if (prev && [...sel.options].some((opt) => opt.value === prev)) {
      sel.value = prev;
    }
  } catch {
    sel.innerHTML = '<option value="">Todos los proveedores</option>';
  }
}

let comprasListaDebounce = null;

async function loadLista() {
  const tbody = document.getElementById('comprasTablaBody');
  const empty = document.getElementById('comprasEmpty');
  const msg = document.getElementById('comprasModuleMsg');
  if (!tbody) return;
  msg.hidden = true;
  const q = document.getElementById('comprasBuscar')?.value?.trim() ?? '';
  const prov = document.getElementById('comprasFiltroProveedor')?.value ?? '';
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (prov) params.set('proveedor', prov);
  const qs = params.toString();
  const url = qs ? `${apiUrl('api/compras.php')}?${qs}` : apiUrl('api/compras.php');

  tbody.innerHTML = '<tr><td colspan="5">Cargando…</td></tr>';
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al listar');
    tbody.innerHTML = '';
    const hasFiltro = !!(q || prov);
    if (!data.compras.length) {
      empty.hidden = false;
      empty.textContent = hasFiltro
        ? 'Ninguna compra coincide con la búsqueda o el proveedor seleccionado.'
        : 'No hay compras registradas.';
      tbody.innerHTML = '';
      return;
    }
    empty.hidden = true;
    data.compras.forEach((c) => {
      const total = Number(c.total);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.idCompra}</td>
        <td>${escapeHtml(c.nombreImportador)}</td>
        <td>${money.format(total)}</td>
        <td>${c.fecha || '—'}</td>
        <td class="compras-acciones">
          <button type="button" class="btn btn-sm btn-ghost" data-act="ver" data-id="${c.idCompra}">Ver detalle</button>
          <button type="button" class="btn btn-sm btn-primary-inline" data-act="editar" data-id="${c.idCompra}">Editar</button>
          <button type="button" class="btn btn-sm btn-danger-inline" data-act="eliminar" data-id="${c.idCompra}">Eliminar</button>
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

const COMPRAS_PANEL_NUEVA = 'comprasPanelNueva';
const COMPRAS_PANEL_EDITAR = 'comprasPanelEditar';

function setComprasPanelOpen(panelId, open, triggerBtn) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  if (open) {
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    if (triggerBtn) {
      triggerBtn.setAttribute('aria-expanded', 'true');
      triggerBtn.classList.add('is-active');
    }
  } else {
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    if (triggerBtn) {
      triggerBtn.setAttribute('aria-expanded', 'false');
      triggerBtn.classList.remove('is-active');
    }
  }
}

function closeCompraNuevaPanel() {
  setComprasPanelOpen(COMPRAS_PANEL_NUEVA, false, document.getElementById('comprasBtnNueva'));
}

function clearCompraEditAlert() {
  const el = document.getElementById('compraEditAlert');
  if (!el) return;
  el.textContent = '';
  el.hidden = true;
}

function showCompraEditAlert(text) {
  const el = document.getElementById('compraEditAlert');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
}

function closeCompraEditarPanel() {
  clearCompraEditAlert();
  const btnDel = document.getElementById('comprasBtnEliminarEdit');
  if (btnDel) btnDel.disabled = false;
  setComprasPanelOpen(COMPRAS_PANEL_EDITAR, false, null);
}

function closeComprasExpandables() {
  closeCompraNuevaPanel();
  closeCompraEditarPanel();
}

function openCompraNuevaPanel() {
  closeCompraEditarPanel();
  setComprasPanelOpen(COMPRAS_PANEL_NUEVA, true, document.getElementById('comprasBtnNueva'));
}

function openCompraEditarPanel() {
  setComprasPanelOpen(COMPRAS_PANEL_NUEVA, false, document.getElementById('comprasBtnNueva'));
  setComprasPanelOpen(COMPRAS_PANEL_EDITAR, true, null);
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

async function loadDevolucionesCompra(id) {
  const container = document.getElementById('compraDetalleDevoluciones');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;margin-top:1.5rem;padding-top:.75rem;border-top:1px solid var(--border)">Cargando devoluciones…</p>';
  try {
    const res = await fetch(`${apiUrl('api/devoluciones.php')}?action=by_ref&tipo=compra&id=${id}`, { cache: 'no-store' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error');
    renderDevolucionesSection(container, data.devoluciones);
  } catch {
    container.innerHTML = '';
  }
}

export async function initCompras() {
  const btnNueva = document.getElementById('comprasBtnNueva');
  const formNueva = document.getElementById('formCompraNueva');
  const formEdit = document.getElementById('formCompraEditar');
  const tbody = document.getElementById('comprasTablaBody');
  if (!btnNueva || !formNueva || !tbody) return;
  const impNuevaId = document.getElementById('compraNuevaImportador');
  const impNuevaBuscar = document.getElementById('compraNuevaImportadorBuscar');
  const impEditId = document.getElementById('compraEditImportador');
  const impEditBuscar = document.getElementById('compraEditImportadorBuscar');

  ['modalCompraDetalle', 'modalCompraEliminar'].forEach((mid) => {
    const modal = document.getElementById(mid);
    if (!modal) return;
    modal.querySelectorAll('[data-close-modal]').forEach((el) => {
      el.addEventListener('click', () => closeModal(mid));
    });
  });

  document.getElementById('compraBtnConfirmEliminar')?.addEventListener('click', async () => {
    const id = parseInt(document.getElementById('compraEliminarId').value, 10);
    if (!id) return;
    try {
      const res = await fetch(apiUrl(`api/compras.php?action=delete&id=${id}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No se pudo eliminar');
      closeModal('modalCompraEliminar');
      const editId = parseInt(document.getElementById('compraEditId')?.value ?? '', 10);
      if (editId === id) closeCompraEditarPanel();
      loadLista();
      window.dispatchEvent(new CustomEvent('lb-stock-changed'));
    } catch (err) {
      closeModal('modalCompraEliminar');
      alert(err.message || String(err));
    }
  });

  document.getElementById('comprasBtnCerrarNueva')?.addEventListener('click', () => closeCompraNuevaPanel());
  document.getElementById('comprasBtnCancelarNueva')?.addEventListener('click', () => closeCompraNuevaPanel());
  document.getElementById('comprasBtnCerrarEditar')?.addEventListener('click', () => closeCompraEditarPanel());
  document.getElementById('comprasBtnCancelarEditar')?.addEventListener('click', () => closeCompraEditarPanel());

  window.addEventListener('lb-view', (e) => {
    if (e.detail?.id === 'compras') {
      fillComprasProveedorFilter().finally(() => loadLista());
    } else {
      closeComprasExpandables();
    }
  });

  document.getElementById('comprasBuscar')?.addEventListener('input', () => {
    clearTimeout(comprasListaDebounce);
    comprasListaDebounce = setTimeout(() => loadLista(), 320);
  });
  document.getElementById('comprasFiltroProveedor')?.addEventListener('change', () => loadLista());
  [ [impNuevaId, impNuevaBuscar], [impEditId, impEditBuscar] ].forEach(([hid, txt]) => {
    if (!hid || !txt) return;
    txt.addEventListener('input', () => resolverImportadorInput(hid, txt));
    txt.addEventListener('change', () => resolverImportadorInput(hid, txt));
    txt.addEventListener('blur', () => resolverImportadorInput(hid, txt));
  });

  btnNueva.addEventListener('click', async () => {
    const panelNueva = document.getElementById(COMPRAS_PANEL_NUEVA);
    const impSel = document.getElementById('compraNuevaImportador');
    const impTxt = document.getElementById('compraNuevaImportadorBuscar');
    const tb = document.getElementById('comprasNuevaFilas');
    if (panelNueva?.classList.contains('is-open')) {
      closeCompraNuevaPanel();
      return;
    }
    openCompraNuevaPanel();
    panelNueva?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (!impSel || !impTxt || !tb) {
      const msg = document.getElementById('comprasModuleMsg');
      if (msg) {
        msg.textContent = 'No se pudo mostrar el formulario de nueva compra.';
        msg.hidden = false;
      }
      closeCompraNuevaPanel();
      return;
    }
    impSel.value = '';
    impTxt.value = '';
    impTxt.disabled = true;
    impTxt.placeholder = 'Cargando proveedores...';
    tb.innerHTML =
      '<tr><td colspan="6" class="compras-panel-loading">Cargando catálogo de productos…</td></tr>';
    try {
      const cat = await fetchCatalogo();
      if (!impSel || !impTxt || !tb) throw new Error('No se encontró el formulario de nueva compra.');
      impTxt.disabled = false;
      impTxt.placeholder = 'Buscar proveedor...';
      fillImportadorPicker(impSel, impTxt, cat.importadores, null);
      const f = document.getElementById('compraNuevaFecha');
      if (f) f.value = new Date().toISOString().slice(0, 10);
      tb.innerHTML = '';
      addFila(tb, cat.productos, null);
      recalcTotalForm(formNueva);
    } catch (err) {
      if (impTxt) {
        impTxt.disabled = false;
        impTxt.placeholder = 'Buscar proveedor...';
        impTxt.value = '';
      }
      if (impSel) {
        impSel.value = '';
      }
      if (tb) tb.innerHTML = '';
      const msg = document.getElementById('comprasModuleMsg');
      msg.textContent = err.message || String(err);
      msg.hidden = false;
    }
  });

  document.getElementById('comprasBtnAddFilaNueva')?.addEventListener('click', async () => {
    const cat = await fetchCatalogo();
    const tb = document.getElementById('comprasNuevaFilas');
    addFila(tb, cat.productos, null);
  });

  formNueva.addEventListener('submit', async (e) => {
    e.preventDefault();
    const imp = document.getElementById('compraNuevaImportador').value;
    const fecha = document.getElementById('compraNuevaFecha').value;
    const detalles = [];
    document.querySelectorAll('#comprasNuevaFilas tr').forEach((tr) => {
      const idProducto = parseInt(tr.querySelector('.compras-sel-producto').value, 10);
      const cantidad = parseInt(tr.querySelector('.compras-in-cant').value, 10);
      const precioCompra = parseFloat(tr.querySelector('.compras-in-precio').value);
      const precioVenta = parseFloat(tr.querySelector('.compras-in-venta').value);
      if (idProducto && cantidad > 0 && !Number.isNaN(precioCompra) && !Number.isNaN(precioVenta)) {
        detalles.push({ idProducto, cantidad, precioCompra, precioVenta });
      }
    });
    if (!imp || Number.isNaN(parseInt(imp, 10))) {
      alert('Seleccione un proveedor válido de la lista.');
      return;
    }
    if (detalles.length < 1) {
      alert('Agregue al menos un producto con cantidad y precio válidos.');
      return;
    }
    try {
      const res = await fetch(apiUrl('api/compras.php'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idImportador: parseInt(imp, 10), fecha, detalles }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No se pudo crear');
      closeCompraNuevaPanel();
      loadLista();
      window.dispatchEvent(new CustomEvent('lb-stock-changed'));
    } catch (err) {
      alert(err.message || String(err));
    }
  });


  formEdit?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearCompraEditAlert();
    const idCompra = parseInt(document.getElementById('compraEditId').value, 10);
    const imp = document.getElementById('compraEditImportador').value;
    const fecha = document.getElementById('compraEditFecha').value;
    const detalles = [];
    document.querySelectorAll('#comprasEditFilas tr').forEach((tr) => {
      const idProducto = parseInt(tr.querySelector('.compras-sel-producto').value, 10);
      const cantidad = parseInt(tr.querySelector('.compras-in-cant').value, 10);
      const precioCompra = parseFloat(tr.querySelector('.compras-in-precio').value);
      const precioVenta = parseFloat(tr.querySelector('.compras-in-venta').value);
      if (idProducto && cantidad > 0 && !Number.isNaN(precioCompra) && !Number.isNaN(precioVenta)) {
        detalles.push({ idProducto, cantidad, precioCompra, precioVenta });
      }
    });
    if (!imp || Number.isNaN(parseInt(imp, 10))) {
      showCompraEditAlert('Seleccione un proveedor válido de la lista.');
      return;
    }
    if (detalles.length < 1) {
      alert('Debe haber al menos una línea de producto válida.');
      return;
    }
    try {
      const res = await fetch(apiUrl(`api/compras.php?action=update&id=${idCompra}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idImportador: parseInt(imp, 10),
          fecha,
          detalles,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No se pudo guardar');
      clearCompraEditAlert();
      closeCompraEditarPanel();
      loadLista();
      window.dispatchEvent(new CustomEvent('lb-stock-changed'));
    } catch (err) {
      showCompraEditAlert(err.message || String(err));
    }
  });

  document.getElementById('comprasBtnAddFilaEdit')?.addEventListener('click', async () => {
    const cat = await fetchCatalogo();
    const tb = document.getElementById('comprasEditFilas');
    addFila(tb, cat.productos, null);
  });

  document.getElementById('comprasTabla')?.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-act]');
    if (!btn) return;
    const id = parseInt(btn.dataset.id, 10);
    const act = btn.dataset.act;
    if (act === 'eliminar') {
      document.getElementById('compraEliminarId').value = String(id);
      document.getElementById('compraEliminarMsg').textContent =
        `¿Eliminar la compra #${id}? Se revertirá el inventario de los productos incluidos.`;
      openModal('modalCompraEliminar');
      return;
    }
    if (act === 'ver') {
      try {
        const res = await fetch(apiUrl(`api/compras.php?id=${id}`), { cache: 'no-store' });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Error');
        const c = data.compra;
        document.getElementById('detalleCompraTitulo').textContent = `Compra #${c.idCompra}`;
        document.getElementById('detalleCompraMeta').innerHTML = `
          <strong>${escapeHtml(c.nombreImportador)}</strong> · Fecha: ${c.fecha || '—'}`;
        const trazEl = document.getElementById('detalleCompraTraz');
        if (trazEl) {
          const creadoPor = c.creado_por_nombre ? escapeHtml(c.creado_por_nombre) : '—';
          let trazHtml = `Registrado por: <strong>${creadoPor}</strong>`;
          if (c.modificado_por_nombre) {
            trazHtml += ` &nbsp;·&nbsp; Editado por: <strong>${escapeHtml(c.modificado_por_nombre)}</strong>`;
            if (c.modificado_en) trazHtml += ` <span style="color:var(--text-muted)">(${escapeHtml(c.modificado_en)})</span>`;
          }
          trazEl.innerHTML = trazHtml;
        }
        const body = document.getElementById('comprasDetalleCuerpo');
        body.innerHTML = '';
        data.detalles.forEach((d) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${escapeHtml(d.nombreProducto)}</td>
            <td>${d.cantidad}</td>
            <td>${money.format(Number(d.precioCompra))}</td>
            <td>${money.format(Number(d.valorTotal))}</td>`;
          body.appendChild(tr);
        });
        document.getElementById('comprasDetalleTotal').textContent = money.format(Number(data.total));
        openModal('modalCompraDetalle');
        loadDevolucionesCompra(id);
      } catch (err) {
        alert(err.message || String(err));
      }
    }
    if (act === 'editar') {
      try {
        const res = await fetch(apiUrl(`api/compras.php?id=${id}`), { cache: 'no-store' });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Error');
        const cat = await fetchCatalogo();
        document.getElementById('compraEditId').value = String(data.compra.idCompra);
        const impSel = document.getElementById('compraEditImportador');
        const impTxt = document.getElementById('compraEditImportadorBuscar');
        fillImportadorPicker(impSel, impTxt, cat.importadores, data.compra.idImportador);
        document.getElementById('compraEditFecha').value = data.compra.fecha || '';
        const tb = document.getElementById('comprasEditFilas');
        tb.innerHTML = '';
        data.detalles.forEach((d) => {
          addFila(tb, cat.productos, {
            idProducto: d.idProducto,
            cantidad: d.cantidad,
            precioCompra: d.precioCompra,
            precioVenta: d.precioVenta,
          });
        });
        recalcTotalForm(formEdit);
        const tituloEdit = document.getElementById('comprasEditTitulo');
        if (tituloEdit) tituloEdit.textContent = `Editar compra #${data.compra.idCompra}`;
        clearCompraEditAlert();
        openCompraEditarPanel();
        document.getElementById(COMPRAS_PANEL_EDITAR)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (err) {
        alert(err.message || String(err));
      }
    }
  });
}
