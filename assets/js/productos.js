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

let categoriasCache = [];

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

async function loadLista() {
  const tbody = document.getElementById('prodTablaBody');
  const empty = document.getElementById('prodEmpty');
  const msg = document.getElementById('prodModuleMsg');
  if (!tbody) return;
  msg.hidden = true;
  tbody.innerHTML = '<tr><td colspan="6">Cargando…</td></tr>';
  try {
    const res = await fetch(apiUrl('api/productos.php'), { cache: 'no-store' });
    const data = await readJson(res);
    if (!data.ok) throw new Error(data.error || 'Error al listar');
    tbody.innerHTML = '';
    if (!data.productos.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    data.productos.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.idProducto}</td>
        <td>${escapeHtml(r.nombre)}</td>
        <td>${escapeHtml(r.marca || '—')}</td>
        <td>${escapeHtml(r.nombreCategoria || r.categoria || '—')}</td>
        <td>${money.format(Number(r.precioInicial) || 0)}</td>
        <td class="compras-acciones">
          <button type="button" class="btn btn-sm btn-primary-inline" data-pr-act="editar" data-pr-id="${r.idProducto}">Editar</button>
          <button type="button" class="btn btn-sm btn-ghost" data-pr-act="eliminar" data-pr-id="${r.idProducto}">Eliminar</button>
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

export function initProductos() {
  const btnNuevo = document.getElementById('prodBtnNuevo');
  const formNuevo = document.getElementById('formProdNuevo');
  const formEdit = document.getElementById('formProdEdit');
  const tabla = document.getElementById('prodTabla');

  window.addEventListener('lb-view', (e) => {
    if (e.detail?.id === 'productos') loadLista();
  });

  btnNuevo?.addEventListener('click', () => {
    loadCategorias()
      .then(() => {
        formNuevo?.reset();
        fillCategoriaSelect('prodNuevoCat');
        document.getElementById('prodNuevoPrecio').value = '';
        openModal('modalProdNuevo');
      })
      .catch((err) => alert(err.message || String(err)));
  });

  document.querySelectorAll('#modalProdNuevo [data-close-modal], #modalProdEdit [data-close-modal], #modalProdEliminar [data-close-modal]').forEach((el) => {
    el.addEventListener('click', () => {
      const modal = el.closest('.lb-modal');
      if (modal) closeModal(modal.id);
    });
  });

  formNuevo?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      nombre: document.getElementById('prodNuevoNombre').value.trim(),
      marca: document.getElementById('prodNuevoMarca').value.trim(),
      idCategoria: parseInt(document.getElementById('prodNuevoCat').value, 10) || 0,
      precioInicial: parseFloat(document.getElementById('prodNuevoPrecio').value) || 0,
    };
    try {
      const res = await fetch(apiUrl('api/productos.php'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readJson(res);
      if (!data.ok) throw new Error(data.error || 'No se pudo guardar');
      closeModal('modalProdNuevo');
      invalidateComprasCatalog();
      loadLista();
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  formEdit?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = parseInt(document.getElementById('prodEditId').value, 10);
    const payload = {
      nombre: document.getElementById('prodEditNombre').value.trim(),
      marca: document.getElementById('prodEditMarca').value.trim(),
      idCategoria: parseInt(document.getElementById('prodEditCat').value, 10) || 0,
      precioInicial: parseFloat(document.getElementById('prodEditPrecio').value) || 0,
    };
    try {
      const res = await fetch(apiUrl(`api/productos.php?action=update&id=${id}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readJson(res);
      if (!data.ok) throw new Error(data.error || 'No se pudo guardar');
      closeModal('modalProdEdit');
      invalidateComprasCatalog();
      loadLista();
    } catch (err) {
      alert(err.message || String(err));
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
    if (act === 'editar') {
      try {
        const [resProd, _] = await Promise.all([
          fetch(apiUrl(`api/productos.php?id=${id}`), { cache: 'no-store' }),
          loadCategorias(),
        ]);
        const data = await readJson(resProd);
        if (!data.ok) throw new Error(data.error || 'Error');
        const r = data.producto;
        document.getElementById('prodEditId').value = String(r.idProducto);
        document.getElementById('prodEditNombre').value = r.nombre || '';
        document.getElementById('prodEditMarca').value = r.marca || '';
        fillCategoriaSelect('prodEditCat', r.idCategoria != null ? String(r.idCategoria) : '');
        document.getElementById('prodEditPrecio').value = r.precioInicial != null ? String(r.precioInicial) : '';
        openModal('modalProdEdit');
      } catch (err) {
        alert(err.message || String(err));
      }
    }
    if (act === 'eliminar') {
      document.getElementById('prodEliminarId').value = String(id);
      document.getElementById('prodEliminarMsg').textContent =
        `¿Eliminar el producto #${id}? No debe aparecer en compras ni en inventario.`;
      openModal('modalProdEliminar');
    }
  });
}
