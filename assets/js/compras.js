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

function fmtEstado(estado) {
  const map = {
    pendiente: 'Pendiente',
    en_transito: 'En tránsito',
    recibida: 'Recibida',
  };
  return map[estado] || estado;
}

function badgeClass(estado) {
  if (estado === 'recibida') return 'ok';
  if (estado === 'en_transito') return 'warn';
  return 'pend';
}

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

function fillImportadorSelect(select, importadores, value) {
  select.innerHTML = '<option value="">— Seleccione —</option>';
  importadores.forEach((i) => {
    const o = document.createElement('option');
    o.value = String(i.idImportador);
    o.textContent = i.nombre;
    select.appendChild(o);
  });
  if (value != null) select.value = String(value);
}

function productOptionsHtml(productos) {
  let html = '<option value="">— Producto —</option>';
  productos.forEach((p) => {
    html += `<option value="${p.idProducto}" data-precio="${p.precioInicial ?? ''}">${escapeHtml(p.nombre)}</option>`;
  });
  return html;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function addFila(tbody, productos, valores) {
  const tr = document.createElement('tr');
  tr.className = 'compras-fila';
  tr.innerHTML = `
    <td><select class="compras-control compras-sel-producto" required>${productOptionsHtml(productos)}</select></td>
    <td><input type="number" class="compras-control compras-in-cant" min="1" step="1" value="${valores?.cantidad ?? 1}" required></td>
    <td><input type="number" class="compras-control compras-in-precio" min="0" step="0.01" value="${valores?.precioCompra ?? ''}" required></td>
    <td><input type="number" class="compras-control compras-in-venta" min="0" step="0.01" value="${valores?.precioVenta ?? ''}" required></td>
    <td class="compras-cel-sub">—</td>
    <td><button type="button" class="btn btn-ghost compras-btn-quitar">Quitar</button></td>
  `;
  const sel = tr.querySelector('.compras-sel-producto');
  const cant = tr.querySelector('.compras-in-cant');
  const precio = tr.querySelector('.compras-in-precio');
  const venta = tr.querySelector('.compras-in-venta');
  if (valores?.idProducto) sel.value = String(valores.idProducto);
  if (valores?.precioCompra == null && sel.selectedOptions[0]?.dataset.precio) {
    const dp = sel.selectedOptions[0].dataset.precio;
    if (dp && !Number.isNaN(parseFloat(dp))) precio.value = dp;
  }
  if (valores?.precioVenta == null && sel.selectedOptions[0]?.dataset.precio) {
    const dp = sel.selectedOptions[0].dataset.precio;
    if (dp && !Number.isNaN(parseFloat(dp))) venta.value = dp;
  }
  tbody.appendChild(tr);
  bindFilaEvents(tr);
  recalcFila(tr);
}

function bindFilaEvents(tr) {
  const sel = tr.querySelector('.compras-sel-producto');
  const cant = tr.querySelector('.compras-in-cant');
  const precio = tr.querySelector('.compras-in-precio');
  const venta = tr.querySelector('.compras-in-venta');
  const quitar = tr.querySelector('.compras-btn-quitar');
  [sel, cant, precio, venta].forEach((el) => el.addEventListener('input', () => recalcFila(tr)));
  sel.addEventListener('change', () => {
    const opt = sel.selectedOptions[0];
    if (opt?.dataset.precio && !Number.isNaN(parseFloat(opt.dataset.precio))) {
      precio.value = opt.dataset.precio;
      venta.value = opt.dataset.precio;
    }
    recalcFila(tr);
  });
  quitar.addEventListener('click', () => {
    const tbody = tr.parentElement;
    if (tbody.querySelectorAll('tr').length <= 1) {
      alert('Debe haber al menos una línea de producto.');
      return;
    }
    tr.remove();
    recalcTotalForm(tbody.closest('form'));
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

async function loadLista() {
  const tbody = document.getElementById('comprasTablaBody');
  const empty = document.getElementById('comprasEmpty');
  const msg = document.getElementById('comprasModuleMsg');
  if (!tbody) return;
  msg.hidden = true;
  tbody.innerHTML = '<tr><td colspan="6">Cargando…</td></tr>';
  try {
    const res = await fetch(apiUrl('api/compras.php'), { cache: 'no-store' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al listar');
    tbody.innerHTML = '';
    if (!data.compras.length) {
      empty.hidden = false;
      tbody.innerHTML = '';
      return;
    }
    empty.hidden = true;
    data.compras.forEach((c) => {
      const total = Number(c.total);
      const tr = document.createElement('tr');
      const bc = badgeClass(c.estado);
      const canEdit = c.estado !== 'recibida';
      tr.innerHTML = `
        <td>${c.idCompra}</td>
        <td>${escapeHtml(c.nombreImportador)}</td>
        <td><span class="badge ${bc}">${fmtEstado(c.estado)}</span></td>
        <td>${money.format(total)}</td>
        <td>${c.fecha || '—'}</td>
        <td class="compras-acciones">
          <button type="button" class="btn btn-sm btn-ghost" data-act="ver" data-id="${c.idCompra}">Ver detalle</button>
          <button type="button" class="btn btn-sm btn-primary-inline" data-act="editar" data-id="${c.idCompra}" ${canEdit ? '' : 'disabled'}>Editar</button>
          <button type="button" class="btn btn-sm btn-recibir" data-act="recibir" data-id="${c.idCompra}" ${canEdit ? '' : 'disabled'}>Recibir</button>
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

function closeCompraEditarPanel() {
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

export async function initCompras() {
  const btnNueva = document.getElementById('comprasBtnNueva');
  const formNueva = document.getElementById('formCompraNueva');
  const formEdit = document.getElementById('formCompraEditar');
  const tbody = document.getElementById('comprasTablaBody');
  if (!btnNueva || !formNueva || !tbody) return;

  ['modalCompraDetalle', 'modalCompraRecibir'].forEach((mid) => {
    const modal = document.getElementById(mid);
    if (!modal) return;
    modal.querySelectorAll('[data-close-modal]').forEach((el) => {
      el.addEventListener('click', () => closeModal(mid));
    });
  });

  document.getElementById('comprasBtnCerrarNueva')?.addEventListener('click', () => closeCompraNuevaPanel());
  document.getElementById('comprasBtnCancelarNueva')?.addEventListener('click', () => closeCompraNuevaPanel());
  document.getElementById('comprasBtnCerrarEditar')?.addEventListener('click', () => closeCompraEditarPanel());
  document.getElementById('comprasBtnCancelarEditar')?.addEventListener('click', () => closeCompraEditarPanel());

  window.addEventListener('lb-view', (e) => {
    if (e.detail?.id === 'compras') {
      loadLista();
    } else {
      closeComprasExpandables();
    }
  });

  btnNueva.addEventListener('click', async () => {
    const panelNueva = document.getElementById(COMPRAS_PANEL_NUEVA);
    const impSel = document.getElementById('compraNuevaImportador');
    const tb = document.getElementById('comprasNuevaFilas');
    if (panelNueva?.classList.contains('is-open')) {
      closeCompraNuevaPanel();
      return;
    }
    openCompraNuevaPanel();
    panelNueva?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (!impSel || !tb) {
      const msg = document.getElementById('comprasModuleMsg');
      if (msg) {
        msg.textContent = 'No se pudo mostrar el formulario de nueva compra.';
        msg.hidden = false;
      }
      closeCompraNuevaPanel();
      return;
    }
    impSel.innerHTML = '<option value="">Cargando proveedores…</option>';
    impSel.disabled = true;
    tb.innerHTML =
      '<tr><td colspan="6" class="compras-panel-loading">Cargando catálogo de productos…</td></tr>';
    try {
      const cat = await fetchCatalogo();
      if (!impSel || !tb) throw new Error('No se encontró el formulario de nueva compra.');
      impSel.disabled = false;
      fillImportadorSelect(impSel, cat.importadores, null);
      const f = document.getElementById('compraNuevaFecha');
      if (f) f.value = new Date().toISOString().slice(0, 10);
      tb.innerHTML = '';
      addFila(tb, cat.productos, null);
      recalcTotalForm(formNueva);
    } catch (err) {
      if (impSel) {
        impSel.disabled = false;
        impSel.innerHTML = '<option value="">— Error al cargar —</option>';
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
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  formEdit?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idCompra = parseInt(document.getElementById('compraEditId').value, 10);
    const imp = document.getElementById('compraEditImportador').value;
    const fecha = document.getElementById('compraEditFecha').value;
    const estado = document.getElementById('compraEditEstado').value;
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
          estado,
          detalles,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No se pudo guardar');
      closeCompraEditarPanel();
      loadLista();
    } catch (err) {
      alert(err.message || String(err));
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
    if (act === 'ver') {
      try {
        const res = await fetch(apiUrl(`api/compras.php?id=${id}`), { cache: 'no-store' });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Error');
        const c = data.compra;
        document.getElementById('detalleCompraTitulo').textContent = `Compra #${c.idCompra}`;
        document.getElementById('detalleCompraMeta').innerHTML = `
          <strong>${escapeHtml(c.nombreImportador)}</strong> · ${fmtEstado(c.estado)} · Fecha: ${c.fecha || '—'}`;
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
      } catch (err) {
        alert(err.message || String(err));
      }
    }
    if (act === 'editar') {
      try {
        const res = await fetch(apiUrl(`api/compras.php?id=${id}`), { cache: 'no-store' });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Error');
        if (data.compra.estado === 'recibida') {
          alert('No se puede editar una compra recibida.');
          return;
        }
        const cat = await fetchCatalogo();
        document.getElementById('compraEditId').value = String(data.compra.idCompra);
        const impSel = document.getElementById('compraEditImportador');
        fillImportadorSelect(impSel, cat.importadores, data.compra.idImportador);
        document.getElementById('compraEditFecha').value = data.compra.fecha || '';
        document.getElementById('compraEditEstado').value = data.compra.estado;
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
        openCompraEditarPanel();
        document.getElementById(COMPRAS_PANEL_EDITAR)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (err) {
        alert(err.message || String(err));
      }
    }
    if (act === 'recibir') {
      document.getElementById('recibirCompraId').value = String(id);
      document.getElementById('recibirCompraMsg').textContent = `¿Confirma recepción de la compra #${id}? Se actualizará el stock y el inventario.`;
      openModal('modalCompraRecibir');
    }
  });

  document.getElementById('comprasBtnConfirmarRecibir')?.addEventListener('click', async () => {
    const id = parseInt(document.getElementById('recibirCompraId').value, 10);
    try {
      const res = await fetch(apiUrl(`api/compras.php?action=recibir&id=${id}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No se pudo recibir');
      closeModal('modalCompraRecibir');
      loadLista();
    } catch (err) {
      alert(err.message || String(err));
    }
  });
}
