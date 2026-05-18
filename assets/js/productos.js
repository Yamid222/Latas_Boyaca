/**
 * CRUD Productos
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

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function invalidateComprasCatalog() {
  window.dispatchEvent(new CustomEvent('lb-invalidate-compras-catalog'));
}

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Respuesta inválida del servidor: ${text.slice(0, 140)}`);
  }
}

function normBusq(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

let categoriasCache = [];
let productosListaCache = [];

function aplicarFiltrosProd() {
  const q = normBusq(document.getElementById('prodBuscar')?.value ?? '');
  const cat = normBusq(document.getElementById('prodFiltroCat')?.value ?? '');
  const cond = normBusq(document.getElementById('prodFiltroCond')?.value ?? '');

  let lista = productosListaCache;
  if (q) {
    lista = lista.filter((r) => {
      return normBusq(r.codigoOEM || '').includes(q) ||
             normBusq(r.modelo || r.nombre || '').includes(q) ||
             normBusq(r.marca || '').includes(q) ||
             normBusq(r.lineaVehiculo || '').includes(q) ||
             normBusq(String(r.idProducto ?? '')).includes(q);
    });
  }
  if (cat) {
    lista = lista.filter((r) => normBusq(r.categoria || '').includes(cat));
  }
  if (cond) {
    lista = lista.filter((r) => {
      const pc = r.condicionProducto === 'segunda mano' ? 'segunda mano' : 'nuevo';
      return pc.includes(cond);
    });
  }

  pintarProductos(lista);
}

function popularProdCatList() {
  const cats = [...new Set(productosListaCache.map((r) => r.categoria).filter(Boolean))].sort();
  const listaCat = document.getElementById('prodCatList');
  if (listaCat) {
    listaCat.innerHTML = cats.map((c) => `<option value="${escapeHtml(c)}">`).join('');
  }
}

function pintarProductos(rows) {
  const tbody = document.getElementById('prodTablaBody');
  const empty = document.getElementById('prodEmpty');
  const buscarEmpty = document.getElementById('prodBuscarEmpty');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (buscarEmpty) buscarEmpty.hidden = true;
  if (!productosListaCache.length) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;
  if (!rows.length) {
    if (buscarEmpty) buscarEmpty.hidden = false;
    return;
  }
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    const codigo = String(r.codigoOEM ?? '').trim() || String(r.idProducto ?? '');
    const condicion = r.condicionProducto === 'segunda mano' ? 'Segunda mano' : 'Nuevo';
    tr.innerHTML = `
        <td>${escapeHtml(codigo)}</td>
        <td>${escapeHtml(r.modelo || r.nombre || '—')}</td>
        <td>${escapeHtml(r.marca || '—')}</td>
        <td>${escapeHtml(r.categoria || '—')}</td>
        <td>${escapeHtml(r.lineaVehiculo || '—')}</td>
        <td>${money.format(Number(r.precioInicial) || 0)}</td>
        <td>${escapeHtml(condicion)}</td>
        <td class="compras-acciones">
          <button type="button" class="btn btn-sm btn-ghost" data-pr-act="descripcion" data-pr-id="${r.idProducto}">Descripción</button>
          <button type="button" class="btn btn-sm btn-primary-inline" data-pr-act="editar" data-pr-id="${r.idProducto}">Editar</button>
          <button type="button" class="btn btn-sm btn-ghost" data-pr-act="eliminar" data-pr-id="${r.idProducto}">Eliminar</button>
        </td>`;
    tbody.appendChild(tr);
  });
}

async function loadCategorias() {
  const res = await fetch(apiUrl('api/categorias.php'), { cache: 'no-store' });
  const data = await readJson(res);
  if (!data.ok) throw new Error(data.error || 'No se pudieron cargar categorías');
  categoriasCache = Array.isArray(data.categorias) ? data.categorias : [];
}

function fillCategoriaSelect(id, selectedValue = '') {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = '<option value="">Seleccione...</option>';
  categoriasCache.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = String(c.idCategoria);
    opt.textContent = c.nombre;
    sel.appendChild(opt);
  });
  if (selectedValue && categoriasCache.some((c) => String(c.idCategoria) === String(selectedValue))) {
    sel.value = String(selectedValue);
  }
}

function fillCategoriaNombreSelect(id, selectedNombre = '') {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = '<option value="">Sin categoría</option>';
  categoriasCache.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.nombre;
    opt.textContent = c.nombre;
    sel.appendChild(opt);
  });
  if (selectedNombre) sel.value = selectedNombre;
}

async function loadLista() {
  const tbody = document.getElementById('prodTablaBody');
  const msg = document.getElementById('prodModuleMsg');
  const buscarEmpty = document.getElementById('prodBuscarEmpty');
  if (!tbody) return;
  msg.hidden = true;
  if (buscarEmpty) buscarEmpty.hidden = true;
  productosListaCache = [];
  tbody.innerHTML = '<tr><td colspan="8">Cargando…</td></tr>';
  try {
    const res = await fetch(apiUrl('api/productos.php'), { cache: 'no-store' });
    const data = await readJson(res);
    if (!data.ok) throw new Error(data.error || 'Error al listar');
    productosListaCache = Array.isArray(data.productos) ? data.productos : [];
    popularProdCatList();
    aplicarFiltrosProd();
  } catch (e) {
    tbody.innerHTML = '';
    productosListaCache = [];
    if (buscarEmpty) buscarEmpty.hidden = true;
    const empty = document.getElementById('prodEmpty');
    if (empty) empty.hidden = true;
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

function clearProdFormMsg(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = '';
  el.hidden = true;
}

function showProdFormMsg(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
}

export function initProductos() {
  const btnNuevo = document.getElementById('prodBtnNuevo');
  const formNuevo = document.getElementById('formProdNuevo');
  const formEdit = document.getElementById('formProdEdit');
  const tabla = document.getElementById('prodTabla');

  window.addEventListener('lb-view', (e) => {
    if (e.detail?.id === 'productos') loadLista();
  });

  ['prodBuscar', 'prodFiltroCat', 'prodFiltroCond'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', aplicarFiltrosProd);
  });

  btnNuevo?.addEventListener('click', async () => {
    try {
      await loadCategorias();
      formNuevo?.reset();
      fillCategoriaNombreSelect('prodNuevoCat');
      clearProdFormMsg('prodFormNuevoMsg');
      openModal('modalProdNuevo');
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  document.querySelectorAll(
    '#modalProdNuevo [data-close-modal], #modalProdEdit [data-close-modal], #modalProdEliminar [data-close-modal], #modalProdDesc [data-close-modal]'
  ).forEach((el) => {
    el.addEventListener('click', () => {
      const modal = el.closest('.lb-modal');
      if (modal) {
        if (modal.id === 'modalProdNuevo') clearProdFormMsg('prodFormNuevoMsg');
        if (modal.id === 'modalProdEdit') clearProdFormMsg('prodFormEditMsg');
        closeModal(modal.id);
      }
    });
  });

  formNuevo?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearProdFormMsg('prodFormNuevoMsg');
    const payload = {
      codigoOEM: document.getElementById('prodNuevoCodigo').value.trim(),
      marca: document.getElementById('prodNuevoMarca').value.trim(),
      lineaVehiculo: document.getElementById('prodNuevoLinea').value.trim(),
      categoria: document.getElementById('prodNuevoCat').value,
      modelo: document.getElementById('prodNuevoModelo').value.trim(),
      descripcion: document.getElementById('prodNuevoDesc').value.trim(),
      precioInicial: parseFloat(document.getElementById('prodNuevoPrecio').value) || 0,
      condicionProducto: document.getElementById('prodNuevoEstado').value,
    };
    try {
      const res = await fetch(apiUrl('api/productos.php'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readJson(res);
      if (!data.ok) throw new Error(data.error || 'No se pudo guardar');
      clearProdFormMsg('prodFormNuevoMsg');
      closeModal('modalProdNuevo');
      invalidateComprasCatalog();
      window.dispatchEvent(new CustomEvent('lb-invalidate-ventas-catalog'));
      window.dispatchEvent(new CustomEvent('lb-stock-changed'));
      loadLista();
    } catch (err) {
      showProdFormMsg('prodFormNuevoMsg', err.message || String(err));
    }
  });

  formEdit?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearProdFormMsg('prodFormEditMsg');
    const id = parseInt(document.getElementById('prodEditId').value, 10);
    const payload = {
      codigoOEM: document.getElementById('prodEditCodigo').value.trim(),
      marca: document.getElementById('prodEditMarca').value.trim(),
      lineaVehiculo: document.getElementById('prodEditLinea').value.trim(),
      categoria: document.getElementById('prodEditCat').value,
      modelo: document.getElementById('prodEditModelo').value.trim(),
      descripcion: document.getElementById('prodEditDesc').value.trim(),
      precioInicial: parseFloat(document.getElementById('prodEditPrecio').value) || 0,
      condicionProducto: document.getElementById('prodEditEstado').value,
    };
    try {
      const res = await fetch(apiUrl(`api/productos.php?action=update&id=${id}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readJson(res);
      if (!data.ok) throw new Error(data.error || 'No se pudo guardar');
      clearProdFormMsg('prodFormEditMsg');
      closeModal('modalProdEdit');
      invalidateComprasCatalog();
      window.dispatchEvent(new CustomEvent('lb-invalidate-ventas-catalog'));
      window.dispatchEvent(new CustomEvent('lb-stock-changed'));
      loadLista();
    } catch (err) {
      showProdFormMsg('prodFormEditMsg', err.message || String(err));
    }
  });

  document.getElementById('prodBtnConfirmEliminar')?.addEventListener('click', async () => {
    const id = parseInt(document.getElementById('prodEliminarId').value, 10);
    try {
      const res = await fetch(apiUrl(`api/productos.php?action=delete&id=${id}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await readJson(res);
      if (!data.ok) throw new Error(data.error || 'No se pudo eliminar');
      closeModal('modalProdEliminar');
      invalidateComprasCatalog();
      window.dispatchEvent(new CustomEvent('lb-invalidate-ventas-catalog'));
      window.dispatchEvent(new CustomEvent('lb-stock-changed'));
      loadLista();
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  tabla?.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-pr-act]');
    if (!btn) return;
    const id = parseInt(btn.dataset.prId, 10);
    const act = btn.dataset.prAct;

    if (act === 'descripcion') {
      const r = productosListaCache.find((p) => String(p.idProducto) === String(id));
      if (r) {
        const titulo = [r.codigoOEM, r.marca, r.modelo].filter(Boolean).join(' · ');
        document.getElementById('prodDescTitulo').textContent = titulo || `Producto #${id}`;
        document.getElementById('prodDescTexto').textContent = r.descripcion || '(Sin descripción)';
        openModal('modalProdDesc');
      }
      return;
    }

    if (act === 'editar') {
      try {
        const [resProd] = await Promise.all([
          fetch(apiUrl(`api/productos.php?id=${id}`), { cache: 'no-store' }),
          loadCategorias(),
        ]);
        const data = await readJson(resProd);
        if (!data.ok) throw new Error(data.error || 'Error');
        const r = data.producto;
        document.getElementById('prodEditId').value = String(r.idProducto);
        document.getElementById('prodEditCodigo').value = r.codigoOEM || '';
        document.getElementById('prodEditMarca').value = r.marca || '';
        document.getElementById('prodEditLinea').value = r.lineaVehiculo || '';
        fillCategoriaNombreSelect('prodEditCat', r.categoria || '');
        document.getElementById('prodEditModelo').value = r.modelo || r.nombre || '';
        document.getElementById('prodEditDesc').value = r.descripcion || '';
        document.getElementById('prodEditPrecio').value = r.precioInicial != null ? String(r.precioInicial) : '';
        document.getElementById('prodEditEstado').value = r.condicionProducto || '';
        clearProdFormMsg('prodFormEditMsg');
        openModal('modalProdEdit');
      } catch (err) {
        alert(err.message || String(err));
      }
    }
    if (act === 'eliminar') {
      document.getElementById('prodEliminarId').value = String(id);
      document.getElementById('prodEliminarMsg').textContent =
        `¿Eliminar el producto con código ${id}? No debe aparecer en compras ni en inventario.`;
      openModal('modalProdEliminar');
    }
  });
}
