/**
 * Tipos de pago — Configuración (tabla tipo_pago)
 */

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

function invalidateVentasCatalog() {
  window.dispatchEvent(new CustomEvent('lb-invalidate-ventas-catalog'));
}

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Respuesta inválida del servidor: ${text.slice(0, 140)}`);
  }
}

async function loadTipos() {
  const tbody = document.getElementById('tpTablaBody');
  const empty = document.getElementById('tpEmpty');
  const msg = document.getElementById('tpModuleMsg');
  if (!tbody || !empty) return;
  msg.hidden = true;
  tbody.innerHTML = '<tr><td colspan="3">Cargando…</td></tr>';
  try {
    const res = await fetch(apiUrl('api/tipo_pago.php'), { cache: 'no-store' });
    const data = await readJson(res);
    if (!data.ok) throw new Error(data.error || 'No se pudo cargar');
    const rows = Array.isArray(data.tipos) ? data.tipos : [];
    tbody.innerHTML = '';
    if (!rows.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    rows.forEach((t) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${t.id_tipo_pago}</td>
        <td>${esc(t.nombre)}</td>
        <td class="compras-acciones">
          <button type="button" class="btn btn-sm btn-primary-inline" data-tp-act="editar" data-tp-id="${t.id_tipo_pago}" data-tp-nombre="${esc(t.nombre)}">Editar</button>
          <button type="button" class="btn btn-sm btn-ghost" data-tp-act="eliminar" data-tp-id="${t.id_tipo_pago}" data-tp-nombre="${esc(t.nombre)}">Eliminar</button>
        </td>`;
      tbody.appendChild(tr);
    });
  } catch (e) {
    tbody.innerHTML = '';
    msg.textContent = e.message || String(e);
    msg.hidden = false;
  }
}

export function initTipoPago() {
  const btnNuevo = document.getElementById('tpBtnNuevo');
  const tabla = document.getElementById('tpTabla');
  const formNuevo = document.getElementById('formTpNuevo');
  const formEdit = document.getElementById('formTpEdit');

  window.addEventListener('lb-view', (e) => {
    if (e.detail?.id === 'configuracion') loadTipos();
  });

  btnNuevo?.addEventListener('click', () => {
    formNuevo?.reset();
    openModal('modalTpNuevo');
  });

  document
    .querySelectorAll('#modalTpNuevo [data-close-modal], #modalTpEdit [data-close-modal], #modalTpEliminar [data-close-modal]')
    .forEach((el) => {
      el.addEventListener('click', () => {
        const modal = el.closest('.lb-modal');
        if (modal) closeModal(modal.id);
      });
    });

  formNuevo?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('tpNuevoNombre').value.trim();
    try {
      const res = await fetch(apiUrl('api/tipo_pago.php'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre }),
      });
      const data = await readJson(res);
      if (!data.ok) throw new Error(data.error || 'No se pudo guardar');
      closeModal('modalTpNuevo');
      invalidateVentasCatalog();
      loadTipos();
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  formEdit?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = parseInt(document.getElementById('tpEditId').value, 10);
    const nombre = document.getElementById('tpEditNombre').value.trim();
    try {
      const res = await fetch(`${apiUrl('api/tipo_pago.php')}?action=update&id=${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre }),
      });
      const data = await readJson(res);
      if (!data.ok) throw new Error(data.error || 'No se pudo actualizar');
      closeModal('modalTpEdit');
      invalidateVentasCatalog();
      loadTipos();
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  tabla?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-tp-act]');
    if (!btn) return;
    const id = parseInt(btn.dataset.tpId, 10);
    const nombre = btn.dataset.tpNombre || '';
    if (btn.dataset.tpAct === 'eliminar') {
      document.getElementById('tpEliminarId').value = String(id);
      document.getElementById('tpEliminarMsg').textContent = `¿Eliminar el tipo de pago «${nombre}»?`;
      openModal('modalTpEliminar');
      return;
    }
    if (btn.dataset.tpAct === 'editar') {
      document.getElementById('tpEditId').value = String(id);
      document.getElementById('tpEditNombre').value = nombre;
      openModal('modalTpEdit');
    }
  });

  document.getElementById('tpBtnConfirmEliminar')?.addEventListener('click', async () => {
    const id = parseInt(document.getElementById('tpEliminarId').value, 10);
    if (!id) return;
    try {
      const res = await fetch(`${apiUrl('api/tipo_pago.php')}?action=delete&id=${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await readJson(res);
      if (!data.ok) throw new Error(data.error || 'No se pudo eliminar');
      closeModal('modalTpEliminar');
      invalidateVentasCatalog();
      loadTipos();
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  const viewCfg = document.getElementById('view-configuracion');
  if (viewCfg?.classList.contains('is-active')) {
    loadTipos();
  }
}
