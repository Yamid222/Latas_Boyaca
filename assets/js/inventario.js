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

function normStr(s) {
  return String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
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

async function fetchUmbralStockBajo() {
  try {
    const res = await fetch(apiUrl('api/configuracion.php'), { cache: 'no-store' });
    const data = await readJson(res);
    if (!data.ok) return 10;
    const u = Number(data.umbralStockBajo);
    return Number.isFinite(u) && u >= 0 ? u : 10;
  } catch {
    return 10;
  }
}

let productosCache = [];
let umbralCache = 10;

function renderTabla(productos, umbralStockBajo) {
  const tbody = document.getElementById('invTablaBody');
  const empty = document.getElementById('invEmpty');
  if (!tbody || !empty) return;

  tbody.innerHTML = '';
  if (!productosCache.length) {
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  const umbral = Number(umbralStockBajo);
  const u = Number.isFinite(umbral) && umbral >= 0 ? umbral : 10;

  if (!productos.length) return;

  productos.forEach((p) => {
    const codigo = String(p.codigoOEM ?? '').trim();
    const marca = String(p.marca ?? '').trim();
    const modelo = String(p.modelo ?? p.nombre ?? '').trim();
    const nombreCompuesto = [codigo, marca, modelo].filter(Boolean).join('~');
    const stock = Number(p.stock) || 0;
    const bajo = stock <= u;
    const estadoTxt = bajo ? 'Bajo' : 'Alto';
    const estadoClass = bajo ? 'warn' : 'ok';
    const condicion = p.condicionProducto === 'segunda mano' ? 'Segunda mano' : (p.condicionProducto ? 'Nuevo' : '—');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(codigo || '—')}</td>
      <td>${escapeHtml(nombreCompuesto || '—')}</td>
      <td>${escapeHtml(marca || '—')}</td>
      <td>${escapeHtml(modelo || '—')}</td>
      <td>${escapeHtml(p.categoria || '—')}</td>
      <td>${escapeHtml(p.lineaVehiculo || '—')}</td>
      <td>${escapeHtml(condicion)}</td>
      <td>${money.format(Number(p.precioInicial) || 0)}</td>
      <td>${stock}</td>
      <td><span class="badge ${estadoClass}">${estadoTxt}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function popularDatalistsInv(productos) {
  const cats = [...new Set(productos.map((p) => p.categoria).filter(Boolean))].sort();
  const listaCat = document.getElementById('invCatList');
  if (listaCat) {
    listaCat.innerHTML = cats.map((c) => `<option value="${escapeHtml(c)}">`).join('');
  }
}

function aplicarFiltrosInv() {
  const q = normStr(document.getElementById('invBuscar')?.value ?? '');
  const cat = normStr(document.getElementById('invFiltroCat')?.value ?? '');
  const cond = normStr(document.getElementById('invFiltroCond')?.value ?? '');

  let lista = productosCache;
  if (q) {
    lista = lista.filter((p) => {
      return normStr(p.codigoOEM || '').includes(q) ||
             normStr(p.modelo || p.nombre || '').includes(q) ||
             normStr(p.marca || '').includes(q);
    });
  }
  if (cat) {
    lista = lista.filter((p) => normStr(p.categoria || '').includes(cat));
  }
  if (cond) {
    lista = lista.filter((p) => {
      const pc = p.condicionProducto === 'segunda mano' ? 'segunda mano' : 'nuevo';
      return pc.includes(cond);
    });
  }

  const filtroEmpty = document.getElementById('invFiltroEmpty');
  if (filtroEmpty) {
    filtroEmpty.hidden = lista.length > 0 || !productosCache.length;
  }

  renderTabla(lista, umbralCache);
}

function renderSelectorProductos(productos) {
  const select = document.getElementById('invProducto');
  if (!select) return;

  const selected = select.value;
  select.innerHTML = '<option value="">Seleccione...</option>';
  productos.forEach((p) => {
    const option = document.createElement('option');
    option.value = String(p.idProducto);
    option.textContent = `${p.codigoOEM || '#' + p.idProducto} - ${p.modelo || p.nombre} (${p.categoria || 'Sin categoría'})`;
    select.appendChild(option);
  });
  if (selected && productos.some((p) => String(p.idProducto) === selected)) {
    select.value = selected;
  }
}

async function cargarSelectorDesdeProductos() {
  try {
    const res = await fetch(apiUrl('api/productos.php'), { cache: 'no-store' });
    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.error || 'No se pudieron cargar productos.');
    }
    renderSelectorProductos(Array.isArray(data.productos) ? data.productos : []);
  } catch (err) {
    showMessage(err.message || String(err), true);
  }
}

function showMessage(text, isError = false) {
  const msg = document.getElementById('invModuleMsg');
  if (!msg) return;
  msg.textContent = text;
  msg.hidden = false;
  msg.classList.toggle('compras-msg--error', isError);
}

async function cargarInventario() {
  const tbody = document.getElementById('invTablaBody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="10">Cargando…</td></tr>';
  }

  const msg = document.getElementById('invModuleMsg');
  if (msg) msg.hidden = true;

  try {
    const [data, umbral] = await Promise.all([fetch(apiUrl('api/inventario.php'), { cache: 'no-store' }).then(readJson), fetchUmbralStockBajo()]);
    if (!data.ok) {
      throw new Error(data.error || 'No se pudo cargar inventario.');
    }

    const productos = Array.isArray(data.productos) ? data.productos : [];
    productosCache = productos;
    umbralCache = umbral;
    popularDatalistsInv(productos);
    aplicarFiltrosInv();
  } catch (err) {
    if (tbody) tbody.innerHTML = '';
    productosCache = [];
    showMessage(err.message || String(err), true);
  }
}

export function initInventario() {
  const form = document.getElementById('invFormMovimiento');
  const selectProducto = document.getElementById('invProducto');

  window.addEventListener('lb-view', (e) => {
    if (e.detail?.id === 'inventario') {
      cargarInventario();
      if (selectProducto) cargarSelectorDesdeProductos();
    }
  });

  window.addEventListener('lb-settings-updated', () => {
    const viewInventario = document.getElementById('view-inventario');
    if (viewInventario?.classList.contains('is-active')) {
      cargarInventario();
    }
  });

  window.addEventListener('lb-stock-changed', () => {
    const v = document.getElementById('view-inventario');
    if (v?.classList.contains('is-active')) cargarInventario();
  });

  const viewInventario = document.getElementById('view-inventario');
  if (viewInventario?.classList.contains('is-active')) {
    cargarInventario();
  }

  ['invBuscar', 'invFiltroCat', 'invFiltroCond'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', aplicarFiltrosInv);
  });

  if (selectProducto) {
    window.addEventListener('lb-invalidate-compras-catalog', () => {
      cargarSelectorDesdeProductos();
    });

    selectProducto.addEventListener('focus', () => {
      if (selectProducto.options.length <= 1) {
        cargarSelectorDesdeProductos();
      }
    });
  }

  cargarInventario();
  if (selectProducto) {
    cargarSelectorDesdeProductos();
  }

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idProducto = parseInt(document.getElementById('invProducto')?.value || '0', 10);
    const cantidad = parseInt(document.getElementById('invCantidad')?.value || '0', 10);

    if (idProducto <= 0) {
      showMessage('Seleccione un producto existente.', true);
      return;
    }
    if (cantidad <= 0) {
      showMessage('La cantidad debe ser mayor a cero.', true);
      return;
    }

    try {
      const res = await fetch(apiUrl('api/inventario.php'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idProducto, cantidad }),
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || 'No se pudo registrar la entrada.');
      }

      showMessage(data.mensaje || 'Entrada registrada correctamente.');
      document.getElementById('invCantidad').value = '1';
      await cargarInventario();
      window.dispatchEvent(new CustomEvent('lb-invalidate-compras-catalog'));
    } catch (err) {
      showMessage(err.message || String(err), true);
    }
  });
}
