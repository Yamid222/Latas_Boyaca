/**
 * CRUD Importadores (proveedores)
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

function invalidateComprasCatalog() {
  window.dispatchEvent(new CustomEvent('lb-invalidate-compras-catalog'));
}

async function loadLista() {
  const tbody = document.getElementById('provTablaBody');
  const empty = document.getElementById('provEmpty');
  const msg = document.getElementById('provModuleMsg');
  if (!tbody) return;
  msg.hidden = true;
  tbody.innerHTML = '<tr><td colspan="5">Cargando…</td></tr>';
  try {
    const res = await fetch(apiUrl('api/importadores.php'), { cache: 'no-store' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al listar');
    tbody.innerHTML = '';
    if (!data.importadores.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    data.importadores.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.idImportador}</td>
        <td>${escapeHtml(r.nombre)}</td>
        <td>${escapeHtml(r.telefono || '—')}</td>
        <td>${escapeHtml(r.correo || '—')}</td>
        <td class="compras-acciones">
          <button type="button" class="btn btn-sm btn-primary-inline" data-p-act="editar" data-p-id="${r.idImportador}">Editar</button>
          <button type="button" class="btn btn-sm btn-ghost" data-p-act="eliminar" data-p-id="${r.idImportador}">Eliminar</button>
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

export function initProveedores() {
  const btnNuevo = document.getElementById('provBtnNuevo');
  const formNuevo = document.getElementById('formProvNuevo');
  const formEdit = document.getElementById('formProvEdit');
  const tabla = document.getElementById('provTabla');

  window.addEventListener('lb-view', (e) => {
    if (e.detail?.id === 'proveedores') loadLista();
  });

  btnNuevo?.addEventListener('click', () => {
    formNuevo?.reset();
    openModal('modalProvNuevo');
  });

  document.querySelectorAll('#modalProvNuevo [data-close-modal], #modalProvEdit [data-close-modal], #modalProvEliminar [data-close-modal]').forEach((el) => {
    el.addEventListener('click', () => {
      const modal = el.closest('.lb-modal');
      if (modal) closeModal(modal.id);
    });
  });

  formNuevo?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      nombre: document.getElementById('provNuevoNombre').value.trim(),
      telefono: document.getElementById('provNuevoTel').value.trim(),
      correo: document.getElementById('provNuevoCorreo').value.trim(),
    };
    try {
      const res = await fetch(apiUrl('api/importadores.php'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No se pudo guardar');
      closeModal('modalProvNuevo');
      invalidateComprasCatalog();
      loadLista();
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  formEdit?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = parseInt(document.getElementById('provEditId').value, 10);
    const payload = {
      nombre: document.getElementById('provEditNombre').value.trim(),
      telefono: document.getElementById('provEditTel').value.trim(),
      correo: document.getElementById('provEditCorreo').value.trim(),
    };
    try {
      const res = await fetch(apiUrl(`api/importadores.php?action=update&id=${id}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No se pudo guardar');
      closeModal('modalProvEdit');
      invalidateComprasCatalog();
      loadLista();
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  document.getElementById('provBtnConfirmEliminar')?.addEventListener('click', async () => {
    const id = parseInt(document.getElementById('provEliminarId').value, 10);
    try {
      const res = await fetch(apiUrl(`api/importadores.php?action=delete&id=${id}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No se pudo eliminar');
      closeModal('modalProvEliminar');
      invalidateComprasCatalog();
      loadLista();
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  tabla?.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-p-act]');
    if (!btn) return;
    const id = parseInt(btn.dataset.pId, 10);
    const act = btn.dataset.pAct;
    if (act === 'editar') {
      try {
        const res = await fetch(apiUrl(`api/importadores.php?id=${id}`), { cache: 'no-store' });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Error');
        const r = data.importador;
        document.getElementById('provEditId').value = String(r.idImportador);
        document.getElementById('provEditNombre').value = r.nombre || '';
        document.getElementById('provEditTel').value = r.telefono || '';
        document.getElementById('provEditCorreo').value = r.correo || '';
        openModal('modalProvEdit');
      } catch (err) {
        alert(err.message || String(err));
      }
    }
    if (act === 'eliminar') {
      document.getElementById('provEliminarId').value = String(id);
      document.getElementById('provEliminarMsg').textContent =
        `¿Eliminar al importador #${id}? No debe tener compras registradas.`;
      openModal('modalProvEliminar');
    }
  });
}
