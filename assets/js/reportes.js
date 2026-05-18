/**
 * Módulo Reportes — tabs, lazy-loading, gráficos, PDF, impresión
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

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

async function readJson(res) {
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`Respuesta inválida del servidor: ${text.slice(0, 120)}`); }
}

function formatFecha(s) {
  if (!s) return '—';
  const d = new Date(`${String(s).slice(0, 10)}T12:00:00`);
  return isNaN(d.getTime()) ? escapeHtml(String(s)) : escapeHtml(d.toLocaleDateString('es-CO', { dateStyle: 'short' }));
}

function formatFechaHora(s) {
  if (!s) return '—';
  const d = new Date(String(s).replace(' ', 'T'));
  return isNaN(d.getTime()) ? escapeHtml(String(s)) : escapeHtml(d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }));
}

function codigoVisible(r) {
  const c = r.codigoOEM != null && String(r.codigoOEM).trim() !== '' ? String(r.codigoOEM).trim() : String(r.idProducto ?? '');
  return escapeHtml(c || '—');
}

function normStr(s) {
  return String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function showMsg(text, isError = false) {
  const el = document.getElementById('repMsg');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  el.classList.toggle('compras-msg--error', isError);
}

function hideMsg() {
  const el = document.getElementById('repMsg');
  if (el) el.hidden = true;
}

// ─── Estado de tabs ──────────────────────────────────────
let tabActivo = 'resumen';
const tabCargado = {};
let cacheInv  = [];
let umbralInv = 10;
let cacheTop  = [];
let cacheAnul = [];
let dataVentas = { historial: [], detalles: [] };
let dataCompras = { historial: [], detalles: [] };

function activarTab(id) {
  tabActivo = id;
  document.querySelectorAll('.rep-tab').forEach((t) => t.classList.toggle('is-active', t.dataset.repTab === id));
  document.querySelectorAll('.rep-panel').forEach((p) => p.classList.toggle('is-active', p.id === `rep-panel-${id}`));
  if (!tabCargado[id]) cargarTab(id);
}

async function cargarTab(id) {
  hideMsg();
  try {
    switch (id) {
      case 'resumen':
        await cargarResumen();
        await cargarTopProductos();
        await cargarAnuladas();
        break;
      case 'inventario': await cargarInventario();   break;
      case 'compras':    await cargarComprasRep();   break;
      case 'ventas':     await cargarVentasRep();    break;
      case 'productos':  await cargarProductosRep(); break;
    }
    tabCargado[id] = true;
  } catch (e) {
    showMsg(e.message || String(e), true);
  }
}

// ─── Resumen mensual ──────────────────────────────────────
async function cargarResumen() {
  const mesInput = document.getElementById('repMes');
  const mesVal = mesInput?.value?.trim() ?? '';
  const q = mesVal && /^\d{4}-\d{2}$/.test(mesVal) ? `&mes=${encodeURIComponent(mesVal)}` : '';
  const res = await fetch(apiUrl(`api/reportes.php?tipo=resumen${q}`), { cache: 'no-store' });
  const data = await readJson(res);
  if (!data.ok) throw new Error(data.error || 'Error al cargar resumen');

  const periodo = document.getElementById('repPeriodoLabel');
  if (periodo) periodo.textContent = data.periodo?.etiqueta ?? '—';
  if (mesInput && data.periodo?.mesClave) mesInput.value = data.periodo.mesClave;

  const vm = data.ventasMes || {};
  const cm = data.comprasMes || {};
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('repVentasTotal', money.format(Number(vm.total) || 0));
  set('repVentasCant', String(vm.cantidad ?? 0));
  set('repComprasTotal', money.format(Number(cm.total) || 0));
  set('repComprasCant', String(cm.cantidad ?? 0));

  const tbTp = document.getElementById('repTblTipoPagoBody');
  if (tbTp) {
    const tipos = data.ventasPorTipoPago || [];
    tbTp.innerHTML = tipos.length
      ? tipos.map((r) => `<tr><td>${escapeHtml(r.nombre_tipo_pago||'—')}</td><td>${r.num_ventas}</td><td>${money.format(Number(r.total)||0)}</td></tr>`).join('')
      : '<tr><td colspan="3">Sin ventas en este período.</td></tr>';
  }

}

// ─── Helpers de período ───────────────────────────────────

function getRango(periodoId, desdeId, hastaId) {
  const periodo = document.getElementById(periodoId)?.value ?? 'mes';
  const hoy  = new Date();
  const pad  = n => String(n).padStart(2, '0');
  const fmt  = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hoyStr = fmt(hoy);

  if (periodo === 'semana') {
    const dia  = hoy.getDay();
    const diff = dia === 0 ? 6 : dia - 1;
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - diff);
    return [fmt(lunes), hoyStr];
  }
  if (periodo === 'rango') {
    const primerDia = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-01`;
    return [
      document.getElementById(desdeId)?.value  || primerDia,
      document.getElementById(hastaId)?.value || hoyStr,
    ];
  }
  return [`${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-01`, hoyStr];
}

// ─── Top productos (filtro independiente) ─────────────────

async function cargarTopProductos() {
  const tb = document.getElementById('repTblTopBody');
  if (tb) tb.innerHTML = '<tr><td colspan="5">Cargando…</td></tr>';
  const [desde, hasta] = getRango('repTopPeriodo', 'repTopDesde', 'repTopHasta');
  const params = new URLSearchParams({ tipo: 'top_productos', desde, hasta });
  const res  = await fetch(apiUrl(`api/reportes.php?${params}`), { cache: 'no-store' });
  const data = await readJson(res);
  if (!data.ok) throw new Error(data.error || 'Error al cargar top productos');
  cacheTop = data.productos || [];
  if (tb) {
    tb.innerHTML = cacheTop.length
      ? cacheTop.map((r, i) => `<tr>
          <td>${i + 1}</td>
          <td>${codigoVisible(r)}</td>
          <td>${escapeHtml(r.nombre || '—')}</td>
          <td>${r.unidades}</td>
          <td>${money.format(Number(r.subtotal) || 0)}</td>
        </tr>`).join('')
      : '<tr><td colspan="5">Sin líneas de venta en este período.</td></tr>';
  }
}

// ─── Compras anuladas (filtro independiente) ──────────────

async function cargarAnuladas() {
  const tb = document.getElementById('repTblComprasAnuladasBody');
  if (tb) tb.innerHTML = '<tr><td colspan="6">Cargando…</td></tr>';
  const [desde, hasta] = getRango('repAnulPeriodo', 'repAnulDesde', 'repAnulHasta');
  const params = new URLSearchParams({ tipo: 'compras_anuladas', desde, hasta });
  const res  = await fetch(apiUrl(`api/reportes.php?${params}`), { cache: 'no-store' });
  const data = await readJson(res);
  if (!data.ok) throw new Error(data.error || 'Error al cargar compras anuladas');
  cacheAnul = data.anuladas || [];
  if (tb) {
    tb.innerHTML = cacheAnul.length
      ? cacheAnul.map((r) => `<tr>
          <td>${formatFechaHora(r.anulado_en)}</td>
          <td>${escapeHtml(String(r.idCompra || '—'))}</td>
          <td>${formatFecha(r.fecha_compra)}</td>
          <td>${escapeHtml(r.nombre_importador || '—')}</td>
          <td>${escapeHtml(r.estado || '—')}</td>
          <td>${money.format(Number(r.total) || 0)}</td>
        </tr>`).join('')
      : '<tr><td colspan="6">No hay compras canceladas en este período.</td></tr>';
  }
}

// ─── PDF por sección ──────────────────────────────────────

function exportarTopPDF() {
  if (!window.jspdf?.jsPDF) { alert('Librería PDF no disponible.'); return; }
  const [desde, hasta] = getRango('repTopPeriodo', 'repTopDesde', 'repTopHasta');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(14); doc.setTextColor(37, 99, 235);
  doc.text('Latas Boyacá — Productos más vendidos', 14, 14);
  doc.setFontSize(9); doc.setTextColor(100, 116, 139);
  doc.text(`Período: ${desde}  →  ${hasta}`, 14, 21);
  doc.autoTable({
    startY: 26,
    head: [['#', 'Código', 'Producto', 'Unidades', 'Subtotal']],
    body: cacheTop.map((r, i) => [
      i + 1, r.codigoOEM || '—', r.nombre || '—',
      r.unidades, money.format(Number(r.subtotal) || 0),
    ]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });
  doc.save(`top_productos_${desde}_${hasta}.pdf`);
}

function exportarAnulPDF() {
  if (!window.jspdf?.jsPDF) { alert('Librería PDF no disponible.'); return; }
  const [desde, hasta] = getRango('repAnulPeriodo', 'repAnulDesde', 'repAnulHasta');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(14); doc.setTextColor(37, 99, 235);
  doc.text('Latas Boyacá — Compras canceladas (anuladas)', 14, 14);
  doc.setFontSize(9); doc.setTextColor(100, 116, 139);
  doc.text(`Período: ${desde}  →  ${hasta}`, 14, 21);
  doc.autoTable({
    startY: 26,
    head: [['Fecha anulación', '# Compra', 'Fecha compra', 'Proveedor', 'Estado', 'Total']],
    body: cacheAnul.map((r) => [
      formatFechaHora(r.anulado_en),
      String(r.idCompra || '—'),
      formatFecha(r.fecha_compra),
      r.nombre_importador || '—',
      r.estado || '—',
      money.format(Number(r.total) || 0),
    ]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });
  doc.save(`compras_anuladas_${desde}_${hasta}.pdf`);
}

// ─── Inventario ───────────────────────────────────────────
async function cargarInventario() {
  const tbody = document.getElementById('repInvBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7">Cargando…</td></tr>';

  const res = await fetch(apiUrl('api/reportes.php?tipo=inventario'), { cache: 'no-store' });
  const data = await readJson(res);
  if (!data.ok) throw new Error(data.error || 'Error al cargar inventario');

  cacheInv = Array.isArray(data.productos) ? data.productos : [];
  umbralInv = Number(data.umbral) || 10;
  aplicarFiltrosInv();

  const tbMov = document.getElementById('repInvMovBody');
  if (tbMov) {
    const movs = Array.isArray(data.movimientos) ? data.movimientos : [];
    tbMov.innerHTML = movs.length
      ? movs.map((m) => `<tr>
          <td>${formatFechaHora(m.fechaActualizacion)}</td>
          <td>${escapeHtml([m.codigoOEM, m.nombreProducto].filter(Boolean).join(' — ') || '—')}</td>
          <td>${m.entrada > 0 ? `<span class="badge ok">+${m.entrada}</span>` : '—'}</td>
          <td>${m.salida  > 0 ? `<span class="badge warn">-${m.salida}</span>`  : '—'}</td>
        </tr>`).join('')
      : '<tr><td colspan="4">Sin movimientos registrados.</td></tr>';
  }
}

function aplicarFiltrosInv() {
  const tbody = document.getElementById('repInvBody');
  if (!tbody) return;
  const q      = normStr(document.getElementById('repInvBuscar')?.value ?? '');
  const filtro = document.getElementById('repInvFiltro')?.value ?? 'todos';

  let lista = cacheInv;
  if (q) {
    lista = lista.filter((p) =>
      normStr(p.codigoOEM).includes(q) || normStr(p.modelo || p.nombre).includes(q) || normStr(p.marca).includes(q)
    );
  }
  if (filtro === 'bajo') lista = lista.filter((p) => Number(p.stock) <= umbralInv);

  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="7">No hay productos que coincidan.</td></tr>';
    return;
  }
  tbody.innerHTML = lista.map((p) => {
    const stock = Number(p.stock) || 0;
    const bajo  = stock <= umbralInv;
    return `<tr>
      <td>${escapeHtml(p.codigoOEM || '—')}</td>
      <td>${escapeHtml(p.modelo || p.nombre || '—')}</td>
      <td>${escapeHtml(p.marca || '—')}</td>
      <td>${escapeHtml(p.categoria || '—')}</td>
      <td>${money.format(Number(p.precioInicial) || 0)}</td>
      <td>${stock}</td>
      <td><span class="badge ${bajo ? 'warn' : 'ok'}">${bajo ? 'Bajo' : 'Alto'}</span></td>
    </tr>`;
  }).join('');
}

// ─── Compras reporte ──────────────────────────────────────
async function cargarComprasRep() {
  const tbody = document.getElementById('repCompBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5">Cargando…</td></tr>';

  const [desde, hasta] = getRango('repCompPeriodo', 'repCompDesde', 'repCompHasta');
  const params = new URLSearchParams({ tipo: 'compras', desde, hasta });

  const res = await fetch(apiUrl(`api/reportes.php?${params}`), { cache: 'no-store' });
  const data = await readJson(res);
  if (!data.ok) throw new Error(data.error || 'Error al cargar compras');

  dataCompras = { historial: data.historial || [], detalles: data.detalles || [] };

  const statsEl = document.getElementById('repCompStats');
  if (statsEl) {
    const clr = { blue: 'var(--accent)', amber: 'var(--warning)', gray: 'var(--text-muted)' };
    const card = (label, val, delta, c) => `<article class="stat-card"><header><span class="stat-label">${escapeHtml(label)}</span></header><p class="stat-value" style="color:${clr[c]}">${escapeHtml(String(val))}</p><p class="stat-delta">${escapeHtml(String(delta))}</p></article>`;
    statsEl.innerHTML =
      card('Total gastado', money.format(data.totalGastado), `${data.totalOrdenes} órdenes`, 'amber') +
      card('Período', `${formatFecha(data.desde)} → ${formatFecha(data.hasta)}`, 'rango consultado', 'gray');
  }

  const hist = data.historial || [];
  if (tbody) {
    tbody.innerHTML = hist.length
      ? hist.map((r) => `<tr>
          <td>#${escapeHtml(String(r.idCompra))}</td>
          <td>${formatFecha(r.fecha)}</td>
          <td>${escapeHtml(r.nombreImportador || '—')}</td>
          <td>${r.numArticulos}</td>
          <td>${money.format(Number(r.total) || 0)}</td>
        </tr>`).join('')
      : '<tr><td colspan="5">No hay compras en este período.</td></tr>';
  }

  const tbProv = document.getElementById('repCompProvBody');
  if (tbProv) {
    const provs = data.porProveedor || [];
    tbProv.innerHTML = provs.length
      ? provs.map((r) => `<tr><td>${escapeHtml(r.nombreImportador || '—')}</td><td>${r.numCompras}</td><td>${money.format(Number(r.total) || 0)}</td></tr>`).join('')
      : '<tr><td colspan="3">Sin datos.</td></tr>';
  }
}

// ─── Ventas reporte ───────────────────────────────────────
async function cargarVentasRep() {
  const tbody = document.getElementById('repVentBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="4">Cargando…</td></tr>';

  const [desde, hasta] = getRango('repVentPeriodo', 'repVentDesde', 'repVentHasta');
  const params = new URLSearchParams({ tipo: 'ventas', desde, hasta });

  const res = await fetch(apiUrl(`api/reportes.php?${params}`), { cache: 'no-store' });
  const data = await readJson(res);
  if (!data.ok) throw new Error(data.error || 'Error al cargar ventas');

  dataVentas = { historial: data.historial || [], detalles: data.detalles || [] };

  const statsEl = document.getElementById('repVentStats');
  if (statsEl) {
    const clr = { blue: 'var(--accent)', green: 'var(--success)', gray: 'var(--text-muted)' };
    const card = (label, val, delta, c) => `<article class="stat-card"><header><span class="stat-label">${escapeHtml(label)}</span></header><p class="stat-value" style="color:${clr[c]}">${escapeHtml(String(val))}</p><p class="stat-delta">${escapeHtml(String(delta))}</p></article>`;
    statsEl.innerHTML =
      card('Total vendido', money.format(data.totalVendido), `${data.totalVentas} ventas`, 'blue') +
      card('Ticket promedio', money.format(data.ticketProm), 'promedio por venta', 'green') +
      card('Período', `${formatFecha(data.desde)} → ${formatFecha(data.hasta)}`, 'rango consultado', 'gray');
  }

  const hist = data.historial || [];
  if (tbody) {
    tbody.innerHTML = hist.length
      ? hist.map((r) => `<tr>
          <td>#${escapeHtml(String(r.id_venta))}</td>
          <td>${formatFecha(r.fecha)}</td>
          <td>${escapeHtml(r.tipoPago || '—')}</td>
          <td>${money.format(Number(r.total) || 0)}</td>
        </tr>`).join('')
      : '<tr><td colspan="4">No hay ventas en este período.</td></tr>';
  }

  const tbTp = document.getElementById('repVentTpBody');
  if (tbTp) {
    const tipos = data.porTipoPago || [];
    tbTp.innerHTML = tipos.length
      ? tipos.map((r) => `<tr><td>${escapeHtml(r.tipoPago || '—')}</td><td>${r.numVentas}</td><td>${money.format(Number(r.total) || 0)}</td></tr>`).join('')
      : '<tr><td colspan="3">Sin datos.</td></tr>';
  }
}

// ─── Productos reporte ────────────────────────────────────
async function cargarProductosRep() {
  const [desde, hasta] = getRango('repProdPeriodo', 'repProdDesde', 'repProdHasta');
  const params = new URLSearchParams({ tipo: 'productos', desde, hasta });
  const res = await fetch(apiUrl(`api/reportes.php?${params}`), { cache: 'no-store' });
  const data = await readJson(res);
  if (!data.ok) throw new Error(data.error || 'Error al cargar productos');

  const tbTop = document.getElementById('repProdTopBody');
  if (tbTop) {
    const top = data.topVendidos || [];
    tbTop.innerHTML = top.length
      ? top.map((r, i) => `<tr>
          <td>${i + 1}</td>
          <td>${codigoVisible(r)}</td>
          <td>${escapeHtml(r.nombre || '—')}</td>
          <td>${escapeHtml(r.marca || '—')}</td>
          <td>${escapeHtml(r.categoria || '—')}</td>
          <td>${r.unidades}</td>
          <td>${money.format(Number(r.subtotal) || 0)}</td>
        </tr>`).join('')
      : '<tr><td colspan="7">No hay ventas registradas.</td></tr>';
  }

  const tbSin = document.getElementById('repProdSinVentBody');
  if (tbSin) {
    const sin = data.sinVentas || [];
    tbSin.innerHTML = sin.length
      ? sin.map((r) => `<tr>
          <td>${codigoVisible(r)}</td>
          <td>${escapeHtml(r.nombre || '—')}</td>
          <td>${escapeHtml(r.marca || '—')}</td>
          <td>${escapeHtml(r.categoria || '—')}</td>
          <td>${r.stock}</td>
        </tr>`).join('')
      : '<tr><td colspan="5">Todos los productos tienen ventas registradas.</td></tr>';
  }

  const tbCat = document.getElementById('repProdCatBody');
  if (tbCat) {
    const cats = data.porCategoria || [];
    tbCat.innerHTML = cats.length
      ? cats.map((r) => `<tr><td>${escapeHtml(r.categoria || '—')}</td><td>${r.numProductos}</td><td>${r.stockTotal}</td></tr>`).join('')
      : '<tr><td colspan="3">Sin datos.</td></tr>';
  }
}

// ─── PDF detallado Ventas ─────────────────────────────────

function fmtFechaPDF(s) {
  if (!s) return '—';
  const d = new Date(String(s).replace(' ', 'T'));
  return isNaN(d.getTime()) ? String(s) : d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

function exportarVentasPDF() {
  if (!window.jspdf?.jsPDF) { alert('Librería PDF no disponible.'); return; }
  const [desde, hasta] = getRango('repVentPeriodo', 'repVentDesde', 'repVentHasta');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFontSize(14); doc.setTextColor(37, 99, 235);
  doc.text('Latas Boyacá — Reporte de Ventas', 14, 14);
  doc.setFontSize(9); doc.setTextColor(100, 116, 139);
  doc.text(`Período: ${desde}  →  ${hasta}`, 14, 21);
  doc.setDrawColor(226, 232, 240); doc.line(14, 23, 283, 23);

  const { historial, detalles } = dataVentas;
  if (!historial.length) {
    doc.setFontSize(10); doc.setTextColor(100, 116, 139);
    doc.text('No hay ventas en este período.', 14, 32);
    doc.save(`ventas_${desde}_${hasta}.pdf`); return;
  }

  const body = [];
  const groupRows = new Set();

  historial.forEach((v) => {
    groupRows.add(body.length);
    body.push([
      `Venta #${v.id_venta}  |  ${fmtFechaPDF(v.fecha)}  |  ${v.tipoPago || '—'}`,
      '', '', '', money.format(Number(v.total) || 0),
    ]);
    const det = detalles.filter((d) => String(d.id_venta) === String(v.id_venta));
    if (det.length) {
      det.forEach((d) => body.push([
        `   ${d.nombre || '—'}`,
        d.codigoOEM || '—',
        d.cantidad,
        money.format(Number(d.precio) || 0),
        money.format(Number(d.subtotal) || 0),
      ]));
    } else {
      body.push(['   Sin detalle disponible', '', '', '', '']);
    }
  });

  doc.autoTable({
    startY: 28,
    head: [['Descripción / Producto', 'Código', 'Unidades', 'Precio unit.', 'Subtotal / Total']],
    body,
    margin: { left: 14, right: 14 },
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data) => {
      if (data.section === 'body' && groupRows.has(data.row.index)) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [219, 234, 254];
        data.cell.styles.textColor = [30, 58, 138];
      }
    },
  });

  doc.save(`ventas_${desde}_${hasta}.pdf`);
}

// ─── PDF detallado Compras ────────────────────────────────

function exportarComprasPDF() {
  if (!window.jspdf?.jsPDF) { alert('Librería PDF no disponible.'); return; }
  const [desde, hasta] = getRango('repCompPeriodo', 'repCompDesde', 'repCompHasta');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFontSize(14); doc.setTextColor(37, 99, 235);
  doc.text('Latas Boyacá — Reporte de Compras', 14, 14);
  doc.setFontSize(9); doc.setTextColor(100, 116, 139);
  doc.text(`Período: ${desde}  →  ${hasta}`, 14, 21);
  doc.setDrawColor(226, 232, 240); doc.line(14, 23, 283, 23);

  const { historial, detalles } = dataCompras;
  if (!historial.length) {
    doc.setFontSize(10); doc.setTextColor(100, 116, 139);
    doc.text('No hay compras en este período.', 14, 32);
    doc.save(`compras_${desde}_${hasta}.pdf`); return;
  }

  const body = [];
  const groupRows = new Set();

  historial.forEach((c) => {
    groupRows.add(body.length);
    body.push([
      `Compra #${c.idCompra}  |  ${fmtFechaPDF(c.fecha)}  |  ${c.nombreImportador || '—'}`,
      '', '', '', money.format(Number(c.total) || 0),
    ]);
    const det = detalles.filter((d) => String(d.idCompra) === String(c.idCompra));
    if (det.length) {
      det.forEach((d) => body.push([
        `   ${d.nombre || '—'}`,
        d.codigoOEM || '—',
        d.cantidad,
        money.format(Number(d.precioCompra) || 0),
        money.format(Number(d.valorTotal) || 0),
      ]));
    } else {
      body.push(['   Sin detalle disponible', '', '', '', '']);
    }
  });

  doc.autoTable({
    startY: 28,
    head: [['Descripción / Producto', 'Código', 'Unidades', 'Precio unit.', 'Subtotal / Total']],
    body,
    margin: { left: 14, right: 14 },
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data) => {
      if (data.section === 'body' && groupRows.has(data.row.index)) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [209, 250, 229];
        data.cell.styles.textColor = [6, 78, 59];
      }
    },
  });

  doc.save(`compras_${desde}_${hasta}.pdf`);
}

// ─── PDF genérico por panel ───────────────────────────────

function exportarPanelPDF(panelId, titulo, subtitulo) {
  if (!window.jspdf?.jsPDF) { alert('Librería PDF no disponible.'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(14); doc.setTextColor(37, 99, 235);
  doc.text('Latas Boyacá — ' + titulo, 14, 14);
  doc.setFontSize(9); doc.setTextColor(100, 116, 139);
  if (subtitulo) doc.text(subtitulo, 14, 21);
  doc.setDrawColor(226, 232, 240);
  doc.line(14, subtitulo ? 23 : 18, 283, subtitulo ? 23 : 18);

  let y = subtitulo ? 28 : 22;
  const panel = document.getElementById(panelId);
  if (!panel) { doc.save('reporte.pdf'); return; }

  panel.querySelectorAll('.data-table').forEach((table) => {
    const heading = table.closest('.panel')?.querySelector('h2')?.textContent?.trim() || '';
    if (y > 170) { doc.addPage(); y = 15; }
    if (heading) {
      doc.setFontSize(10); doc.setTextColor(30, 41, 59);
      doc.text(heading, 14, y); y += 5;
    }
    const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    const rows    = [...table.querySelectorAll('tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())
    );
    doc.autoTable({
      head: [headers], body: rows, startY: y,
      margin: { left: 14, right: 14 },
      styles: { fontSize: 7.5, cellPadding: 1.5 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 10;
  });

  doc.save(`reporte_${panelId.replace('rep-panel-', '')}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─── Exportar PDF ─────────────────────────────────────────
function exportarPDF() {
  if (!window.jspdf) {
    alert('Librería PDF no disponible. Compruebe la conexión y recargue la página.');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc  = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const ahora = new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
  const tabNames = { dashboard:'Dashboard', resumen:'Resumen mensual', inventario:'Inventario', compras:'Compras', ventas:'Ventas', productos:'Productos' };

  // Encabezado
  doc.setFontSize(18); doc.setTextColor(37, 99, 235);
  doc.text('Latas Boyacá', 14, 14);
  doc.setFontSize(11); doc.setTextColor(30, 41, 59);
  doc.text(`Reporte: ${tabNames[tabActivo] || tabActivo}`, 14, 21);
  doc.setFontSize(8); doc.setTextColor(100, 116, 139);
  doc.text(`Generado el ${ahora}`, 14, 26);
  doc.setDrawColor(226, 232, 240);
  doc.line(14, 28, 283, 28);

  let y = 33;

  const panel = document.querySelector(`#rep-panel-${tabActivo}`);
  if (!panel) { doc.save(`reporte-${tabActivo}.pdf`); return; }

  panel.querySelectorAll('.panel').forEach((panelDiv) => {
    const heading = panelDiv.querySelector('h2')?.textContent?.trim().replace(/\s+/g, ' ') || '';
    const table   = panelDiv.querySelector('.data-table');
    if (!table) return;

    if (y > 170) { doc.addPage(); y = 15; }

    if (heading) {
      doc.setFontSize(10); doc.setTextColor(30, 41, 59);
      doc.text(heading, 14, y);
      y += 5;
    }

    const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    const rows    = [...table.querySelectorAll('tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())
    );

    doc.autoTable({
      head: [headers], body: rows, startY: y,
      margin: { left: 14, right: 14 },
      styles: { fontSize: 7.5, cellPadding: 1.5 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    y = (doc.lastAutoTable?.finalY ?? y) + 10;
  });

  doc.save(`reporte-${tabActivo}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─── initReportes ─────────────────────────────────────────
export function initReportes() {
  // Navegación tabs
  document.querySelectorAll('.rep-tab').forEach((btn) => {
    btn.addEventListener('click', () => activarTab(btn.dataset.repTab));
  });

  // Filtros inventario (client-side)
  document.getElementById('repInvBuscar')?.addEventListener('input', aplicarFiltrosInv);
  document.getElementById('repInvFiltro')?.addEventListener('change', aplicarFiltrosInv);

  // Resumen mensual
  document.getElementById('repBtnActualizar')?.addEventListener('click', () => {
    tabCargado['resumen'] = false;
    cargarTab('resumen');
  });
  document.getElementById('repMes')?.addEventListener('change', () => {
    tabCargado['resumen'] = false;
    cargarTab('resumen');
  });

  // Compras — período, consultar, PDF
  document.getElementById('repCompPeriodo')?.addEventListener('change', () => {
    const rango = document.getElementById('repCompRango');
    if (rango) rango.style.display = document.getElementById('repCompPeriodo').value === 'rango' ? 'flex' : 'none';
  });
  document.getElementById('repBtnCompras')?.addEventListener('click', () => {
    cargarComprasRep().catch((e) => showMsg(e.message || String(e), true));
  });
  document.getElementById('repBtnCompPDF')?.addEventListener('click', exportarComprasPDF);

  // Ventas — período, consultar, PDF
  document.getElementById('repVentPeriodo')?.addEventListener('change', () => {
    const rango = document.getElementById('repVentRango');
    if (rango) rango.style.display = document.getElementById('repVentPeriodo').value === 'rango' ? 'flex' : 'none';
  });
  document.getElementById('repBtnVentas')?.addEventListener('click', () => {
    cargarVentasRep().catch((e) => showMsg(e.message || String(e), true));
  });
  document.getElementById('repBtnVentPDF')?.addEventListener('click', exportarVentasPDF);

  // Productos — período, filtrar, PDF
  document.getElementById('repProdPeriodo')?.addEventListener('change', () => {
    const rango = document.getElementById('repProdRango');
    if (rango) rango.style.display = document.getElementById('repProdPeriodo').value === 'rango' ? 'flex' : 'none';
  });
  document.getElementById('repBtnProd')?.addEventListener('click', () => {
    cargarProductosRep().catch((e) => showMsg(e.message || String(e), true));
  });
  document.getElementById('repBtnProdPDF')?.addEventListener('click', () => {
    const [desde, hasta] = getRango('repProdPeriodo', 'repProdDesde', 'repProdHasta');
    exportarPanelPDF('rep-panel-productos', 'Reporte de Productos', `Top vendidos: ${desde}  →  ${hasta}`);
  });

  // Valores por defecto para inputs de rango
  const hoy = new Date();
  const primerDia = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
  const hoyStr    = hoy.toISOString().slice(0, 10);
  ['repCompDesde', 'repVentDesde', 'repProdDesde'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = primerDia;
  });
  ['repCompHasta', 'repVentHasta', 'repProdHasta'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = hoyStr;
  });

  // Mes actual para resumen
  const mesInput = document.getElementById('repMes');
  if (mesInput && !mesInput.value) {
    mesInput.value = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  }

  // Impresión
  document.getElementById('repBtnImprimir')?.addEventListener('click', () => window.print());

  // Productos más vendidos — período y filtro
  document.getElementById('repTopPeriodo')?.addEventListener('change', () => {
    const rango = document.getElementById('repTopRango');
    if (rango) rango.style.display = document.getElementById('repTopPeriodo').value === 'rango' ? 'flex' : 'none';
  });
  document.getElementById('repBtnTop')?.addEventListener('click', () => {
    cargarTopProductos().catch((e) => showMsg(e.message || String(e), true));
  });
  document.getElementById('repBtnTopPDF')?.addEventListener('click', exportarTopPDF);

  // Compras anuladas — período y filtro
  document.getElementById('repAnulPeriodo')?.addEventListener('change', () => {
    const rango = document.getElementById('repAnulRango');
    if (rango) rango.style.display = document.getElementById('repAnulPeriodo').value === 'rango' ? 'flex' : 'none';
  });
  document.getElementById('repBtnAnul')?.addEventListener('click', () => {
    cargarAnuladas().catch((e) => showMsg(e.message || String(e), true));
  });
  document.getElementById('repBtnAnulPDF')?.addEventListener('click', exportarAnulPDF);

  // Carga al entrar a la vista reportes
  window.addEventListener('lb-view', (e) => {
    if (e.detail?.id === 'reportes' && !tabCargado[tabActivo]) {
      cargarTab(tabActivo);
    }
  });

  // Invalidar tabs de stock cuando cambia el inventario desde otros módulos
  window.addEventListener('lb-stock-changed', () => {
    ['inventario', 'productos'].forEach((id) => {
      tabCargado[id] = false;
      if (tabActivo === id) cargarTab(id);
    });
  });
}
