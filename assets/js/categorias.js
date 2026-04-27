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

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Respuesta inválida del servidor: ${text.slice(0, 140)}`);
  }
}

async function loadCategorias() {
  const tbody = document.getElementById('catTablaBody');
  const empty = document.getElementById('catEmpty');
  const msg = document.getElementById('catModuleMsg');
  if (!tbody || !empty) return;
  msg.hidden = true;
  tbody.innerHTML = '<tr><td colspan="3">Cargando…</td></tr>';
  try {
    const res = await fetch(apiUrl('api/categorias.php'), { cache: 'no-store' });
    const data = await readJson(res);
    if (!data.ok) throw new Error(data.error || 'No se pudo cargar');
    const rows = Array.isArray(data.categorias) ? data.categorias : [];
    tbody.innerHTML = '';
    if (!rows.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    rows.forEach((c) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.idCategoria}</td>
        <td>${esc(c.nombre)}</td>
        <td class="compras-acciones">
          <button type="button" class="btn btn-sm btn-primary-inline" data-cat-act="editar" data-cat-id="${c.idCategoria}" data-cat-nombre="${esc(c.nombre)}">Editar</button>
          <button type="button" class="btn btn-sm btn-ghost" data-cat-act="eliminar" data-cat-id="${c.idCategoria}" data-cat-nombre="${esc(c.nombre)}">Eliminar</button>
        </td>`;
      tbody.appendChild(tr);
    });
  } catch (e) {
    tbody.innerHTML = '';
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

  btnNueva?.addEventListener('click', () => {
    formNueva?.reset();
    openModal('modalCatNueva');
  });

  document.querySelectorAll('#modalCatNueva [data-close-modal], #modalCatEditar [data-close-modal], #modalCatEliminar [data-close-modal]').forEach((el) => {
    el.addEventListener('click', () => {
      const modal = el.closest('.lb-modal');
      if (modal) closeModal(modal.id);
    });
  });

  formNueva?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('catNuevoNombre').value.trim();
    try {
      const res = await fetch(apiUrl('api/categorias.php'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre }),
      });
      const data = await readJson(res);
      if (!data.ok) throw new Error(data.error || 'No se pudo crear');
      closeModal('modalCatNueva');
      await loadCategorias();
      window.dispatchEvent(new CustomEvent('lb-invalidate-compras-catalog'));
    } catch (err) {
      showMsg(err.message || String(err), true);
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
      closeModal('modalCatEliminar');
      await loadCategorias();
      window.dispatchEvent(new CustomEvent('lb-invalidate-compras-catalog'));
    } catch (err) {
      showMsg(err.message || String(err), true);
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
    openModal('modalCatEliminar');
  });
}
