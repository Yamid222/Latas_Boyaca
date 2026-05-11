/**
 * Preferencias guardadas en api/configuracion.php (JSON en /data).
 */

function apiUrl(path) {
  const p = window.location.pathname;
  const dir = p.lastIndexOf('/') > 0 ? p.slice(0, p.lastIndexOf('/') + 1) : '/';
  return `${window.location.origin}${dir}${path}`;
}

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Respuesta inválida del servidor: ${text.slice(0, 140)}`);
  }
}

async function cargarUmbralStock() {
  const input = document.getElementById('cfgUmbralStockBajo');
  const msg = document.getElementById('cfgInventarioMsg');
  if (!input) return;
  if (msg) {
    msg.hidden = true;
    msg.textContent = '';
  }
  try {
    const res = await fetch(apiUrl('api/configuracion.php'), { cache: 'no-store' });
    const data = await readJson(res);
    if (!data.ok) throw new Error(data.error || 'No se pudo cargar la configuración');
    const u = Number(data.umbralStockBajo);
    input.value = Number.isFinite(u) ? String(u) : '10';
  } catch (e) {
    input.value = '10';
    if (msg) {
      msg.textContent = e.message || String(e);
      msg.hidden = false;
    }
  }
}

export function initConfiguracion() {
  window.addEventListener('lb-view', (e) => {
    if (e.detail?.id === 'configuracion') cargarUmbralStock();
  });

  document.getElementById('cfgBtnGuardarUmbral')?.addEventListener('click', async () => {
    const input = document.getElementById('cfgUmbralStockBajo');
    const msg = document.getElementById('cfgInventarioMsg');
    if (!input) return;
    const u = parseInt(input.value, 10);
    if (Number.isNaN(u) || u < 0 || u > 999999) {
      if (msg) {
        msg.textContent = 'Ingrese un número entre 0 y 999999.';
        msg.hidden = false;
      }
      return;
    }
    if (msg) {
      msg.hidden = true;
      msg.textContent = '';
    }
    try {
      const res = await fetch(apiUrl('api/configuracion.php'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ umbralStockBajo: u }),
      });
      const data = await readJson(res);
      if (!data.ok) throw new Error(data.error || 'No se pudo guardar');
      if (msg) {
        msg.textContent = 'Umbral guardado. El inventario usará este valor al recargar la vista.';
        msg.hidden = false;
      }
      window.dispatchEvent(new CustomEvent('lb-settings-updated', { detail: { umbralStockBajo: u } }));
    } catch (e) {
      if (msg) {
        msg.textContent = e.message || String(e);
        msg.hidden = false;
      }
    }
  });
}
