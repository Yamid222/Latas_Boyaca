/**
 * Reportes — datos del mes desde api/reportes.php
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

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Respuesta inválida del servidor: ${text.slice(0, 140)}`);
  }
}

function codigoVisible(r) {
  const c = r.codigoOEM != null && String(r.codigoOEM).trim() !== '' ? String(r.codigoOEM).trim() : String(r.idProducto ?? '');
  return escapeHtml(c);
}

/** Fecha/hora MySQL → texto legible (zona local del navegador). */
function formatFechaHoraCol(s) {
  if (s == null || String(s).trim() === '') return '—';
  const t = String(s).replace(' ', 'T');
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return escapeHtml(String(s));
  return escapeHtml(
    d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
  );
}

function formatFechaCol(s) {
  if (s == null || String(s).trim() === '') return '—';
  const d = new Date(`${String(s).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return escapeHtml(String(s));
  return escapeHtml(d.toLocaleDateString('es-CO', { dateStyle: 'short' }));
}

async function cargarReportes() {
  const msg = document.getElementById('repMsg');
  const mesInput = document.getElementById('repMes');
  const periodo = document.getElementById('repPeriodoLabel');
  const vTot = document.getElementById('repVentasTotal');
  const vCant = document.getElementById('repVentasCant');
  const cTot = document.getElementById('repComprasTotal');
  const cCant = document.getElementById('repComprasCant');
  const tbAnul = document.getElementById('repTblComprasAnuladasBody');
  const tbTp = document.getElementById('repTblTipoPagoBody');
  const tbTop = document.getElementById('repTblTopBody');

  if (msg) {
    msg.hidden = true;
    msg.textContent = '';
  }

  const mesVal = mesInput?.value?.trim();
  const q = mesVal && /^\d{4}-\d{2}$/.test(mesVal) ? `?mes=${encodeURIComponent(mesVal)}` : '';

  try {
    const res = await fetch(apiUrl(`api/reportes.php${q}`), { cache: 'no-store' });
    const data = await readJson(res);
    if (!data.ok) {
      throw new Error(data.error || (res.ok ? 'No se pudieron cargar los reportes' : `Error ${res.status}`));
    }

    if (periodo) periodo.textContent = data.periodo?.etiqueta ?? '—';
    if (mesInput && data.periodo?.mesClave) mesInput.value = data.periodo.mesClave;

    const vm = data.ventasMes || {};
    const cm = data.comprasMes || {};
    if (vTot) vTot.textContent = money.format(Number(vm.total) || 0);
    if (vCant) vCant.textContent = String(vm.cantidad ?? 0);
    if (cTot) cTot.textContent = money.format(Number(cm.total) || 0);
    if (cCant) cCant.textContent = String(cm.cantidad ?? 0);

    if (tbAnul) {
      tbAnul.innerHTML = '';
      const anul = Array.isArray(data.comprasAnuladas) ? data.comprasAnuladas : [];
      if (!anul.length) {
        tbAnul.innerHTML = '<tr><td colspan="6">No hay compras canceladas en este período.</td></tr>';
      } else {
        anul.forEach((row) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
          <td>${formatFechaHoraCol(row.anulado_en)}</td>
          <td>${escapeHtml(row.idCompra ?? '—')}</td>
          <td>${formatFechaCol(row.fecha_compra)}</td>
          <td>${escapeHtml(row.nombre_importador || '—')}</td>
          <td>${escapeHtml(row.estado || '—')}</td>
          <td>${money.format(Number(row.total) || 0)}</td>`;
          tbAnul.appendChild(tr);
        });
      }
    }

    if (tbTp) {
      tbTp.innerHTML = '';
      const tipos = Array.isArray(data.ventasPorTipoPago) ? data.ventasPorTipoPago : [];
      if (!tipos.length) {
        tbTp.innerHTML = '<tr><td colspan="3">Sin ventas en este período.</td></tr>';
      } else {
        tipos.forEach((row) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
          <td>${escapeHtml(row.nombre_tipo_pago || '—')}</td>
          <td>${Number(row.num_ventas) || 0}</td>
          <td>${money.format(Number(row.total) || 0)}</td>`;
          tbTp.appendChild(tr);
        });
      }
    }

    if (tbTop) {
      tbTop.innerHTML = '';
      const top = Array.isArray(data.topProductos) ? data.topProductos : [];
      if (!top.length) {
        tbTop.innerHTML = '<tr><td colspan="5">Sin líneas de venta en este período.</td></tr>';
      } else {
        top.forEach((row, idx) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
          <td>${idx + 1}</td>
          <td>${codigoVisible(row)}</td>
          <td>${escapeHtml(row.nombre || '—')}</td>
          <td>${Number(row.unidades) || 0}</td>
          <td>${money.format(Number(row.subtotal) || 0)}</td>`;
          tbTop.appendChild(tr);
        });
      }
    }
  } catch (e) {
    if (msg) {
      msg.textContent = e.message || String(e);
      msg.hidden = false;
    }
  }
}

export function initReportes() {
  const mesInput = document.getElementById('repMes');
  if (mesInput && !mesInput.value) {
    const d = new Date();
    mesInput.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  window.addEventListener('lb-view', (e) => {
    if (e.detail?.id === 'reportes') cargarReportes();
  });

  document.getElementById('repBtnActualizar')?.addEventListener('click', () => cargarReportes());
  mesInput?.addEventListener('change', () => cargarReportes());
}
