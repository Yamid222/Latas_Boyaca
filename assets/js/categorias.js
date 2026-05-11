function apiUrl(path) {
  const p = window.location.pathname;
  const dir = p.lastIndexOf('/') > 0 ? p.slice(0, p.lastIndexOf('/') + 1) : '/';
  return `${window.location.origin}${dir}${path}`;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
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

function showMsg(text, isError = false) {
  const m = document.getElementById('catModuleMsg');
  if (!m) return;
  m.textContent = text;
  m.hidden = false;
  m.classList.toggle('compras-msg--error', isError);
}

function clearCatFormNuevaMsg() {
  const el = document.getElementById('catFormNuevaMsg');
  if (!el) return;
  el.textContent = '';
  el.hidden = true;
}

function showCatFormNuevaMsg(text) {
  const el = document.getElementById('catFormNuevaMsg');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
}

function clearCatEliminarAlert() {
  const el = document.getElementById('catEliminarAlert');
  if (!el) return;
  el.textContent = '';
  el.hidden = true;
}

function showCatEliminarAlert(text) {
  const el = document.getElementById('catEliminarAlert');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
}

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Respuesta inválida del servidor: ${text.slice(0, 140)}`);
  }
}

let categoriasListaCache = [];

function normBusq(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function filtrarCategorias(q) {
  const nq = normBusq(q);
  if (!nq) return categoriasListaCache;
  return categoriasListaCache.filter((c) => {
    const codStr = c.codigo != null && String(c.codigo) !== '' ? String(c.codigo) : String(c.idCategoria);
    const cod = normBusq(codStr);
    const nom = normBusq(c.nombre || '');
    return cod.includes(nq) || nom.includes(nq);
  });
}

function pintarCategorias(rows) {
  const tbody = document.getElementById('catTablaBody');
  const empty = document.getElementById('catEmpty');
  const buscarEmpty = document.getElementById('catBuscarEmpty');
  if (!tbody || !empty) return;
  tbody.innerHTML = '';
  if (buscarEmpty) buscarEmpty.hidden = true;
  if (!categoriasListaCache.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  if (!rows.length) {
    if (buscarEmpty) buscarEmpty.hidden = false;
    return;
  }
  rows.forEach((c) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td>${esc(c.codigo || c.idCategoria)}</td>
        <td>${esc(c.nombre)}</td>
        <td class="compras-acciones">
          <button type="button" class="btn btn-sm btn-primary-inline" data-cat-act="editar" data-cat-id="${c.idCategoria}" data-cat-nombre="${esc(c.nombre)}">Editar</button>
          <button type="button" class="btn btn-sm btn-ghost" data-cat-act="eliminar" data-cat-id="${c.idCategoria}" data-cat-nombre="${esc(c.nombre)}">Eliminar</button>
        </td>`;
    tbody.appendChild(tr);
  });
}

async function loadCategorias() {
  const tbody = document.getElementById('catTablaBody');
  const empty = document.getElementById('catEmpty');
  const msg = document.getElementById('catModuleMsg');
  const buscarEmpty = document.getElementById('catBuscarEmpty');
  if (!tbody || !empty) return;
  msg.hidden = true;
  if (buscarEmpty) buscarEmpty.hidden = true;
  categoriasListaCache = [];
  tbody.innerHTML = '<tr><td colspan="3">Cargando…</td></tr>';
  try {
    const res = await fetch(apiUrl('api/categorias.php'), { cache: 'no-store' });
    const data = await readJson(res);
    if (!data.ok) throw new Error(data.error || 'No se pudo cargar');
    categoriasListaCache = Array.isArray(data.categorias) ? data.categorias : [];
    const q = document.getElementById('catBuscar')?.value ?? '';
    pintarCategorias(filtrarCategorias(q));
  } catch (e) {
    tbody.innerHTML = '';
    categoriasListaCache = [];
    if (buscarEmpty) buscarEmpty.hidden = true;
    empty.hidden = true;
    showMsg(e.message || String(e), true);
  }
}

export function initCategorias() {
  const btnNueva = document.getElementById('catBtnNueva');
  const tabla = document.getElementById('catTabla');
  const formNueva = document.getElementById('formCatNueva');
  const formEditar = document.getElementById('formCatEditar');

  window.addEventListener('lb-view', (e) => {
    if (e.detail?.id === 'categoria') loadCategorias();
  });

  document.getElementById('catBuscar')?.addEventListener('input', () => {
    const q = document.getElementById('catBuscar')?.value ?? '';
    pintarCategorias(filtrarCategorias(q));
  });

  btnNueva?.addEventListener('click', () => {
    formNueva?.reset();
    clearCatFormNuevaMsg();
    openModal('modalCatNueva');
  });

  document.querySelectorAll('#modalCatNueva [data-close-modal], #modalCatEditar [data-close-modal], #modalCatEliminar [data-close-modal]').forEach((el) => {
    el.addEventListener('click', () => {
      const modal = el.closest('.lb-modal');
      if (modal) {
        if (modal.id === 'modalCatNueva') clearCatFormNuevaMsg();
        if (modal.id === 'modalCatEliminar') clearCatEliminarAlert();
        closeModal(modal.id);
      }
    });
  });

  formNueva?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const codigo = document.getElementById('catNuevoId').value.trim();
    const nombre = document.getElementById('catNuevoNombre').value.trim();
    try {
      const res = await fetch(apiUrl('api/categorias.php'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo, nombre }),
      });
      const data = await readJson(res);
      if (!data.ok) throw new Error(data.error || 'No se pudo crear');
      clearCatFormNuevaMsg();
      closeModal('modalCatNueva');
      await loadCategorias();
      window.dispatchEvent(new CustomEvent('lb-invalidate-compras-catalog'));
    } catch (err) {
      showCatFormNuevaMsg(err.message || String(err));
    }
  });

  formEditar?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = parseInt(document.getElementById('catEditId').value, 10);
    const nombre = document.getElementById('catEditNombre').value.trim();
    try {
      const res = await fetch(apiUrl(`api/categorias.php?action=update&id=${id}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre }),
      });
      const data = await readJson(res);
      if (!data.ok) throw new Error(data.error || 'No se pudo actualizar');
      closeModal('modalCatEditar');
      await loadCategorias();
      window.dispatchEvent(new CustomEvent('lb-invalidate-compras-catalog'));
    } catch (err) {
      showMsg(err.message || String(err), true);
    }
  });

  document.getElementById('catBtnConfirmEliminar')?.addEventListener('click', async () => {
    const id = parseInt(document.getElementById('catEliminarId').value, 10);
    try {
      const res = await fetch(apiUrl(`api/categorias.php?action=delete&id=${id}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await readJson(res);
      if (!data.ok) throw new Error(data.error || 'No se pudo eliminar');
      clearCatEliminarAlert();
      closeModal('modalCatEliminar');
      await loadCategorias();
      window.dispatchEvent(new CustomEvent('lb-invalidate-compras-catalog'));
    } catch (err) {
      showCatEliminarAlert(err.message || String(err));
    }
  });

  tabla?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-cat-act]');
    if (!btn) return;
    const id = parseInt(btn.dataset.catId, 10);
    const nombre = btn.dataset.catNombre || '';
    if (btn.dataset.catAct === 'editar') {
      document.getElementById('catEditId').value = String(id);
      document.getElementById('catEditNombre').value = nombre;
      openModal('modalCatEditar');
      return;
    }
    document.getElementById('catEliminarId').value = String(id);
    document.getElementById('catEliminarMsg').textContent = `¿Eliminar la categoría "${nombre}"?`;
    clearCatEliminarAlert();
    openModal('modalCatEliminar');
  });
}
