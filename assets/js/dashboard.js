let chartDashVentas = null;
let chartDashCats   = null;
let lastSerieVentas = [];
let lastCatChart    = [];

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const CAT_COLORS = ['#2563eb','#059669','#d97706','#e11d48','#7c3aed','#0891b2','#65a30d','#9f1239'];

function fmt(val) {
  if (val >= 1_000_000) return '$ ' + (val / 1_000_000).toFixed(1) + 'M';
  if (val >= 1_000)     return '$ ' + Math.round(val / 1_000).toLocaleString('es-CO') + 'K';
  return '$ ' + Math.round(val).toLocaleString('es-CO');
}

function calcDelta(actual, anterior) {
  if (anterior === 0) return actual > 0 ? { txt: '↑ nuevo este mes', up: true } : { txt: 'Sin datos previos', up: null };
  const pct = ((actual - anterior) / anterior * 100).toFixed(1);
  const up  = parseFloat(pct) >= 0;
  return { txt: (up ? '↑ ' : '↓ ') + Math.abs(parseFloat(pct)) + '% vs. mes anterior', up };
}

function getDashColors() {
  const s = getComputedStyle(document.documentElement);
  return {
    muted:  s.getPropertyValue('--text-muted').trim()  || '#64748b',
    accent: s.getPropertyValue('--accent').trim()       || '#2563eb',
    grid:   s.getPropertyValue('--chart-grid').trim()   || 'rgba(148,163,184,0.2)',
  };
}

function destroyDashCharts() {
  if (chartDashVentas) { chartDashVentas.destroy(); chartDashVentas = null; }
  if (chartDashCats)   { chartDashCats.destroy();   chartDashCats   = null; }
}

function renderDashCharts(serieVentas, catChart) {
  if (typeof Chart === 'undefined') return;
  destroyDashCharts();

  const ctx1 = document.getElementById('chartVentas');
  const ctx2 = document.getElementById('chartCategorias');
  if (!ctx1 || !ctx2) return;

  const { muted, accent, grid } = getDashColors();

  // Gradiente para gráfica de línea
  const ctx = ctx1.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 280);
  const hex = /^#[0-9A-Fa-f]{6}$/.test(accent) ? accent : '#2563eb';
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.22)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

  chartDashVentas = new Chart(ctx1, {
    type: 'line',
    data: {
      labels: serieVentas.map(s => MESES[parseInt(s.mes.split('-')[1], 10) - 1]),
      datasets: [{
        label: 'Ventas (COP)',
        data: serieVentas.map(s => s.total),
        borderColor: accent,
        backgroundColor: grad,
        fill: true,
        tension: 0.35,
        pointRadius: 4,
        pointHoverRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: grid }, ticks: { color: muted } },
        y: {
          grid: { color: grid },
          ticks: { color: muted, callback: v => '$ ' + (v / 1_000_000).toFixed(1) + 'M' },
        },
      },
    },
  });

  const catLabels = catChart.map(c => c.categoria);
  const catData   = catChart.map(c => parseInt(c.total, 10));
  chartDashCats = new Chart(ctx2, {
    type: 'doughnut',
    data: {
      labels: catLabels.length ? catLabels : ['Sin datos'],
      datasets: [{
        data: catData.length ? catData : [1],
        backgroundColor: CAT_COLORS.slice(0, Math.max(catData.length, 1)),
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: muted, boxWidth: 12, padding: 16 } },
      },
    },
  });
}

async function cargarDashboard() {
  const el = {};
  ['dashVentasVal','dashVentasDelta','dashVentasHoyVal','dashVentasHoyDelta',
   'dashComprasVal','dashComprasDelta','dashComprasHoyVal','dashComprasHoyDelta','dashActBody']
    .forEach(id => { el[id] = document.getElementById(id); });

  try {
    const res  = await fetch('api/reportes.php?tipo=dashboard');
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error del servidor');

    const { stats, serieVentas, catChart, actividadReciente } = data;

    // Tarjeta 1 — Ventas del mes
    if (el.dashVentasVal) el.dashVentasVal.textContent = fmt(stats.ventasMes.total);
    if (el.dashVentasDelta) {
      const d = calcDelta(stats.ventasMes.total, stats.ventasMesAnt);
      el.dashVentasDelta.textContent  = d.txt;
      el.dashVentasDelta.className    = 'stat-delta' + (d.up === true ? ' up' : d.up === false ? ' down' : '');
    }

    // Tarjeta 2 — Ventas del día
    if (el.dashVentasHoyVal) el.dashVentasHoyVal.textContent = fmt(stats.ventasHoy.total);
    if (el.dashVentasHoyDelta) {
      const d = calcDelta(stats.ventasHoy.total, stats.ventasAyer);
      el.dashVentasHoyDelta.textContent = stats.ventasHoy.cantidad + ' venta(s) hoy · ' + d.txt;
      el.dashVentasHoyDelta.className   = 'stat-delta' + (d.up === true ? ' up' : d.up === false ? ' down' : '');
    }

    // Tarjeta 3 — Compras del mes
    if (el.dashComprasVal) el.dashComprasVal.textContent = fmt(stats.comprasMes.total);
    if (el.dashComprasDelta) {
      const d = calcDelta(stats.comprasMes.total, stats.comprasMesAnt);
      el.dashComprasDelta.textContent = d.txt;
      el.dashComprasDelta.className   = 'stat-delta' + (d.up === true ? ' up' : d.up === false ? ' down' : '');
    }

    // Tarjeta 4 — Compras del día
    if (el.dashComprasHoyVal) el.dashComprasHoyVal.textContent = fmt(stats.comprasHoy.total);
    if (el.dashComprasHoyDelta) {
      const d = calcDelta(stats.comprasHoy.total, stats.comprasAyer);
      el.dashComprasHoyDelta.textContent = stats.comprasHoy.cantidad + ' compra(s) hoy · ' + d.txt;
      el.dashComprasHoyDelta.className   = 'stat-delta' + (d.up === true ? ' up' : d.up === false ? ' down' : '');
    }

    // Actividad reciente
    if (el.dashActBody) {
      if (!actividadReciente.length) {
        el.dashActBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">Sin ventas registradas</td></tr>';
      } else {
        el.dashActBody.innerHTML = actividadReciente.map(v =>
          `<tr>
            <td>Venta #${v.id_venta}</td>
            <td><span class="badge ok">Completada</span></td>
            <td>${fmt(parseFloat(v.total))}</td>
            <td>${v.fecha}</td>
          </tr>`
        ).join('');
      }
    }

    // Gráficas
    lastSerieVentas = serieVentas;
    lastCatChart    = catChart;
    requestAnimationFrame(() => renderDashCharts(serieVentas, catChart));

  } catch (err) {
    console.error('Dashboard:', err);
    if (el.dashActBody) {
      el.dashActBody.innerHTML = `<tr><td colspan="4" style="color:var(--danger)">Error al cargar datos: ${err.message}</td></tr>`;
    }
  }
}

export function initDashboard() {
  // Si el dashboard ya está activo al cargar el módulo (edge case), cargamos de inmediato
  const dash = document.getElementById('view-dashboard');
  if (dash && dash.classList.contains('is-active')) {
    cargarDashboard();
  }

  window.addEventListener('lb-view', (e) => {
    if (e.detail?.id === 'dashboard') cargarDashboard();
  });

  window.addEventListener('lb-theme-changed', () => {
    const d = document.getElementById('view-dashboard');
    if (d && d.classList.contains('is-active') && lastSerieVentas.length) {
      requestAnimationFrame(() => renderDashCharts(lastSerieVentas, lastCatChart));
    }
  });

  window.addEventListener('lb-stock-changed', () => {
    const d = document.getElementById('view-dashboard');
    if (d && d.classList.contains('is-active')) cargarDashboard();
  });
}
