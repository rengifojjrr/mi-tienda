// Catálogo de productos (diseño "Gestión de Catálogo y Productos" de Stitch): filtros, tabla/cuadrícula,
// publicación rápida, acciones masivas, duplicar, importar/exportar CSV y feed para el catálogo de WhatsApp (Meta).
import { $, $$, esc, ico, debounce, hace, normalizar, slug, aCsv, leerCsv, descargar, num, ofertaVigente, precioVigente, descuentoPct } from '../util.js';
import { db, urlImagen, ruta } from '../api.js';
import { iniciarPanel, dineroPanel, tienda } from './base.js';
import { modal, confirmar, toast, toastError, vacio, paginacion, spinner } from './ui.js';

await iniciarPanel({ seccion: 'productos', migas: [{ texto: 'Catálogo', href: 'productos.html' }, { texto: 'Gestión de Productos' }], area: 'catalogo' });
const contenido = $('#contenido');
const COLUMNAS = 'id,slug,sku,codigo_barras,nombre,marca,modelo,subcategoria,categoria_id,precio,precio_oferta,oferta_activa,oferta_inicio,oferta_fin,stock,stock_minimo,rastrear_stock,al_agotarse,estado,destacado,novedad,en_catalogo_wa,imagenes,variantes,descripcion_corta,etiquetas,actualizado_en,actualizado_por,ejemplo,creado_en,envio_gratis,relampago';

let productos = [];
let categorias = [];
const sel = new Set();
const f = {
  q: '', estado: new URLSearchParams(location.search).get('estado') || 'todos', cat: '', stock: '', extra: '',
  vista: (() => { try { return localStorage.getItem('mt_vista_prod') || 'tabla'; } catch { return 'tabla'; } })(),
  pagina: 1, porPagina: 10,
};

async function cargar() {
  [productos, categorias] = await Promise.all([
    db.leer('mt_productos', `select=${COLUMNAS}&order=actualizado_en.desc`),
    db.leer('mt_categorias', 'select=id,nombre,slug&order=orden,nombre'),
  ]);
}
const catNombre = (id) => categorias.find((c) => c.id === id)?.nombre || 'Sin categoría';
const agotado = (p) => p.rastrear_stock && p.stock <= 0;
const bajo = (p) => p.rastrear_stock && p.stock > 0 && p.stock <= p.stock_minimo;

function filtrados() {
  const q = normalizar(f.q.trim());
  return productos.filter((p) => {
    if (f.estado === 'archivado' ? p.estado !== 'archivado' : p.estado === 'archivado') return false;
    if (f.estado === 'publicado' && p.estado !== 'publicado') return false;
    if (f.estado === 'borrador' && p.estado !== 'borrador') return false;
    if (f.estado === 'oculto' && p.estado !== 'oculto') return false;
    if (f.estado === 'agotados' && !agotado(p)) return false;
    if (f.cat && (f.cat === 'sin' ? p.categoria_id : p.categoria_id !== f.cat)) return false;
    if (f.stock === 'ok' && (agotado(p) || bajo(p))) return false;
    if (f.stock === 'bajo' && !bajo(p)) return false;
    if (f.stock === 'cero' && !agotado(p)) return false;
    if (f.extra === 'oferta' && !ofertaVigente(p)) return false;
    if (f.extra === 'destacado' && !p.destacado) return false;
    if (f.extra === 'sinfoto' && (p.imagenes || []).length) return false;
    if (f.extra === 'ejemplo' && !p.ejemplo) return false;
    if (q && !normalizar([p.nombre, p.sku, p.codigo_barras, p.marca, p.modelo].join(' ')).includes(q)) return false;
    return true;
  });
}

// ---------------- Piezas visuales ----------------
function detalleVariantes(p) {
  const v = p.variantes || [];
  if (!v.length) return p.subcategoria || p.modelo || '';
  if (v.every((x) => /^talla/i.test(x.nombre))) {
    const n = v.map((x) => x.nombre.replace(/^talla\s*/i, ''));
    return `Tallas: ${n[0]}${n.length > 1 ? `-${n[n.length - 1]}` : ''}`;
  }
  return v.length === 1 ? v[0].nombre : `${v.length} variantes`;
}

function saludInventario(p) {
  if (!p.rastrear_stock) return '<span class="font-label-sm text-label-sm text-outline">Sin control de stock</span>';
  const cap = Math.min(100, Math.round((p.stock / Math.max(p.stock_minimo * 4, 1)) * 100));
  const [color, barra, texto] = agotado(p) ? ['text-error', 'bg-error', '0 unidades']
    : bajo(p) ? ['text-[#B45309]', 'bg-[#F59E0B]', `${p.stock} ${p.stock === 1 ? 'unidad' : 'unidades'}`]
    : ['text-secondary', 'bg-secondary', `${p.stock} en bodega`];
  const etiqueta = agotado(p) ? (p.al_agotarse === 'preventa' ? 'Preventa' : 'Agotado') : bajo(p) ? '¡Bajo!' : `Cap. ${cap}%`;
  return `<div class="space-y-1"><div class="flex items-center justify-between gap-2 font-label-sm text-label-sm font-semibold">
      <span class="${color} flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full ${barra}"></span> ${texto}</span><span class="${agotado(p) || bajo(p) ? color : 'text-outline'}">${etiqueta}</span></div>
    <div class="w-full h-1.5 bg-surface-container rounded-full overflow-hidden"><div class="${barra} h-full rounded-full" style="width:${agotado(p) ? 100 : Math.max(6, cap)}%"></div></div></div>`;
}

function precios(p) {
  const pct = descuentoPct(p);
  return `<div class="flex flex-col"><div class="flex items-center gap-1.5"><span class="font-headline-sm text-[16px] font-bold text-on-surface tnum">${dineroPanel(precioVigente(p))}</span>
      ${pct ? `<span class="px-1.5 py-0.5 rounded font-label-sm text-label-sm bg-secondary-fixed text-on-secondary-fixed font-bold">-${pct}%</span>` : ''}</div>
    <span class="font-label-sm text-label-sm text-outline ${pct ? 'line-through' : ''} tnum">${pct ? dineroPanel(p.precio) : p.oferta_activa ? 'Oferta fuera de fecha' : 'PVP Regular'}</span></div>`;
}

const punto = (p) => (p.estado !== 'publicado' ? 'bg-outline' : agotado(p) ? 'bg-error' : bajo(p) ? 'bg-[#F59E0B]' : 'bg-secondary');
const imagen = (p, clases = 'w-12 h-12') => `<div class="${clases} rounded-lg bg-surface-container overflow-hidden shrink-0 relative shadow-sm">
    ${(p.imagenes || [])[0] ? `<img class="w-full h-full object-cover group-hover:scale-105 transition-transform" src="${esc(urlImagen(p.imagenes[0].mini || p.imagenes[0].url))}" alt="" loading="lazy">` : `<div class="w-full h-full flex items-center justify-center text-outline">${ico('image', 'text-[20px]')}</div>`}
    <span class="absolute bottom-0 right-0 w-3 h-3 ${punto(p)} rounded-tl-md"></span></div>`;

const textoEstado = { publicado: ['Publicado', 'text-secondary'], borrador: ['Borrador', 'text-outline'], oculto: ['Pausado', 'text-[#B45309]'], archivado: ['Archivado', 'text-error'] };

function fila(p) {
  const [tEstado, cEstado] = textoEstado[p.estado] || [p.estado, 'text-outline'];
  return `<tr class="hover:bg-surface-container-low/70 transition-colors group ${sel.has(p.id) ? 'bg-primary/5' : ''}" data-fila="${p.id}">
    <td class="py-3 px-4 text-center"><input type="checkbox" data-sel="${p.id}" ${sel.has(p.id) ? 'checked' : ''} class="w-4 h-4 rounded cursor-pointer accent-primary" aria-label="Seleccionar ${esc(p.nombre)}"></td>
    <td class="py-3 px-4"><a href="producto.html?id=${p.id}" class="flex items-center gap-space-sm min-w-[240px]">${imagen(p)}
      <div class="flex flex-col min-w-0"><span class="font-headline-sm text-[15px] font-bold truncate text-on-surface group-hover:text-primary transition-colors">${esc(p.nombre)}</span>
        <div class="flex items-center gap-1.5 text-outline font-label-sm text-label-sm">${p.marca ? `<span class="text-on-surface-variant font-semibold">${esc(p.marca)}</span>` : ''}${p.marca && detalleVariantes(p) ? '<span>•</span>' : ''}<span class="truncate">${esc(detalleVariantes(p))}</span>
          ${p.ejemplo ? '<span class="chip-gris normal-case tracking-normal px-1.5">Ejemplo</span>' : ''}</div></div></a></td>
    <td class="py-3 px-3 whitespace-nowrap"><div class="flex flex-col"><span class="font-mono text-label-md text-on-surface font-semibold">${esc(p.sku)}</span><span class="text-outline font-label-sm text-label-sm">${esc(p.codigo_barras || '—')}</span></div></td>
    <td class="py-3 px-3 whitespace-nowrap"><span class="px-2.5 py-1 rounded-full font-label-sm text-label-sm font-bold bg-surface-container-high text-on-surface-variant">${esc(catNombre(p.categoria_id))}</span></td>
    <td class="py-3 px-3 whitespace-nowrap">${precios(p)}</td>
    <td class="py-3 px-4 min-w-[170px]">${saludInventario(p)}</td>
    <td class="py-3 px-3 text-center whitespace-nowrap"><div class="flex flex-col items-center gap-1">
      <input type="checkbox" class="interruptor" data-publicar="${p.id}" ${p.estado === 'publicado' ? 'checked' : ''} ${p.estado === 'archivado' ? 'disabled' : ''} aria-label="Publicar ${esc(p.nombre)}">
      <span class="font-label-sm text-label-sm ${cEstado} font-bold">${tEstado}</span></div></td>
    <td class="py-3 px-3 whitespace-nowrap"><button type="button" data-wa="${p.id}" title="Incluir en el catálogo exportable para WhatsApp (Meta)"
      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-label-sm text-label-sm font-semibold ${p.en_catalogo_wa && p.estado === 'publicado' ? 'bg-secondary-container/40 text-on-secondary-container' : 'bg-surface-container text-outline'}">
      ${ico(p.en_catalogo_wa ? (p.estado === 'publicado' ? 'send' : 'schedule_send') : 'visibility_off', 'text-[14px]')} ${p.en_catalogo_wa ? (p.estado === 'publicado' ? 'Activo' : 'En espera') : 'Inactivo'}</button></td>
    <td class="py-3 px-3 whitespace-nowrap"><div class="flex flex-col text-on-surface-variant font-label-sm text-label-sm"><span>${esc(hace(p.actualizado_en))}</span><span class="text-outline">por ${esc(p.actualizado_por || 'Sistema')}</span></div></td>
    <td class="py-3 px-4 text-right whitespace-nowrap"><div class="flex items-center justify-end gap-1">
      <a href="producto.html?id=${p.id}" class="p-1.5 rounded-lg text-outline hover:text-primary hover:bg-surface-container transition-colors" title="Editar">${ico('edit', 'text-[18px]')}</a>
      <button type="button" data-duplicar="${p.id}" class="p-1.5 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container transition-colors" title="Duplicar">${ico('content_copy', 'text-[18px]')}</button>
      <a href="${ruta(`producto.html?p=${encodeURIComponent(p.slug)}${p.estado === 'publicado' ? '' : '&vista_previa=1'}`)}" target="_blank" rel="noopener" class="p-1.5 rounded-lg text-outline hover:text-secondary hover:bg-surface-container transition-colors" title="Ver en tienda">${ico('open_in_new', 'text-[18px]')}</a>
      <button type="button" data-borrar="${p.id}" class="p-1.5 rounded-lg text-outline hover:text-error hover:bg-error-container/30 transition-colors" title="Eliminar o archivar">${ico('delete', 'text-[18px]')}</button>
    </div></td></tr>`;
}

function tarjeta(p) {
  const [tEstado, cEstado] = textoEstado[p.estado] || [p.estado, 'text-outline'];
  return `<div class="bg-surface-container-lowest rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col group ${sel.has(p.id) ? 'ring-2 ring-primary' : ''}">
    <a href="producto.html?id=${p.id}" class="relative aspect-square bg-surface-container block">
      ${(p.imagenes || [])[0] ? `<img src="${esc(urlImagen(p.imagenes[0].mini || p.imagenes[0].url))}" alt="" class="w-full h-full object-cover" loading="lazy">` : `<div class="w-full h-full flex items-center justify-center text-outline">${ico('image', 'text-[36px]')}</div>`}
      <span class="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-white/90 font-label-sm text-label-sm font-bold ${cEstado}">${tEstado}</span></a>
    <div class="p-3 flex flex-col gap-1.5 flex-1">
      <div class="flex items-start justify-between gap-2"><a href="producto.html?id=${p.id}" class="font-label-lg text-label-lg text-on-surface line-clamp-2 group-hover:text-primary">${esc(p.nombre)}</a>
        <input type="checkbox" data-sel="${p.id}" ${sel.has(p.id) ? 'checked' : ''} class="w-4 h-4 mt-0.5 rounded cursor-pointer accent-primary shrink-0" aria-label="Seleccionar"></div>
      <span class="font-mono text-label-sm text-outline">${esc(p.sku)}</span>
      ${precios(p)}<div class="mt-auto pt-1">${saludInventario(p)}</div>
    </div></div>`;
}

function kpis() {
  const vivos = productos.filter((p) => p.estado !== 'archivado');
  const wa = vivos.filter((p) => p.estado === 'publicado' && p.en_catalogo_wa).length;
  const caja = (titulo, valor, extra, colorValor, icono, colorIcono, filtro) => `<button type="button" data-kpi="${filtro}" class="text-left bg-surface-container-lowest p-space-sm rounded-xl shadow-sm hover:shadow-md transition-shadow flex items-center justify-between gap-2">
    <div class="space-y-0.5"><span class="font-label-sm text-label-sm uppercase tracking-wider text-outline">${titulo}</span>
      <p class="font-headline-md text-headline-md ${colorValor} tnum">${valor} <span class="font-body-sm text-body-sm font-normal">${extra}</span></p></div>
    <div class="w-10 h-10 rounded-xl ${colorIcono} flex items-center justify-center shrink-0">${ico(icono, 'text-[22px]', icono === 'chat')}</div></button>`;
  return `<div class="grid grid-cols-2 md:grid-cols-4 gap-space-sm">
    ${caja('Total Inventario', vivos.length, 'items', 'text-on-surface', 'inventory_2', 'bg-surface-container-low text-primary', 'todos')}
    ${caja('Activos WhatsApp', wa, `${vivos.length ? Math.round((wa / vivos.length) * 100) : 0}%`, 'text-secondary', 'chat', 'bg-secondary-container/30 text-on-secondary-container', 'publicado')}
    ${caja('Alerta Bajo Stock', vivos.filter(bajo).length, 'revisar', 'text-[#B45309]', 'warning', 'bg-[#FFFBEB] text-[#B45309]', 'bajo')}
    ${caja('Agotados', vivos.filter(agotado).length, 'crítico', 'text-error', 'remove_shopping_cart', 'bg-error-container/40 text-on-error-container', 'agotados')}
  </div>`;
}

function consola(lista) {
  const vivos = productos.filter((p) => p.estado !== 'archivado');
  const cuenta = { todos: vivos.length, publicado: vivos.filter((p) => p.estado === 'publicado').length, borrador: vivos.filter((p) => p.estado === 'borrador').length, oculto: vivos.filter((p) => p.estado === 'oculto').length, agotados: vivos.filter(agotado).length, archivado: productos.length - vivos.length };
  const pill = (id, texto, color) => `<button type="button" data-estado="${id}" class="px-3.5 py-1.5 rounded-lg font-label-md text-label-md transition-all ${f.estado === id ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}">${texto} <span class="ml-1 ${f.estado === id ? 'opacity-80' : `${color} font-semibold`}">(${cuenta[id]})</span></button>`;
  const select = (id, opciones, valor) => `<select data-filtro="${id}" class="campo h-9 lg:h-9 w-auto pl-3 font-label-md text-label-md bg-surface-container-low border-transparent">${opciones.map(([v, t]) => `<option value="${v}" ${v === valor ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const hayFiltros = f.q || f.cat || f.stock || f.extra || f.estado !== 'todos';
  return `<div class="bg-surface-container-lowest rounded-xl shadow-sm p-space-md space-y-space-sm">
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-space-sm">
      <div class="relative flex-1 max-w-2xl">${ico('search', 'absolute left-3.5 top-1/2 -translate-y-1/2 text-outline text-[20px]')}
        <input id="buscar" type="search" value="${esc(f.q)}" class="w-full pl-11 pr-16 py-2.5 bg-surface-container-low rounded-xl font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container transition-all [&::-webkit-search-cancel-button]:hidden" placeholder="Buscar por nombre, SKU, código de barras o marca..." aria-label="Buscar productos">
        <span class="hidden sm:inline-block absolute right-3 top-1/2 -translate-y-1/2 font-label-sm text-label-sm bg-surface-container text-on-surface-variant px-1.5 py-0.5 rounded shadow-sm">/</span></div>
      <div class="flex items-center justify-between sm:justify-end gap-space-sm">
        <span class="font-label-md text-label-md text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-lg">Mostrando <strong class="text-on-surface tnum">${Math.min(f.porPagina, Math.max(0, lista.length - (f.pagina - 1) * f.porPagina))}</strong> de <strong class="text-on-surface tnum">${lista.length}</strong> productos</span>
        <div class="flex items-center bg-surface-container-low p-1 rounded-xl">
          ${[['tabla', 'table_rows', 'Tabla'], ['cuadricula', 'grid_view', 'Cuadrícula']].map(([id, icono, t]) => `<button type="button" data-vista="${id}" class="flex items-center gap-1 px-3 py-1 rounded-lg font-label-md text-label-md ${f.vista === id ? 'bg-surface-container-lowest text-primary shadow-sm font-bold' : 'text-on-surface-variant hover:text-on-surface'}">${ico(icono, 'text-[18px]')}<span class="hidden sm:inline">${t}</span></button>`).join('')}
        </div></div></div>
    <div class="flex flex-wrap items-center justify-between gap-space-sm pt-2">
      <div class="flex flex-wrap items-center gap-1.5">${pill('todos', 'Todos', '')}${pill('publicado', 'Publicados', 'text-secondary')}${pill('borrador', 'Borradores', 'text-outline')}${pill('oculto', 'Pausados', 'text-[#B45309]')}${pill('agotados', 'Agotados', 'text-error')}${cuenta.archivado ? pill('archivado', 'Archivados', 'text-outline') : ''}</div>
      <div class="flex flex-wrap items-center gap-space-xs">
        ${select('cat', [['', 'Todas las categorías'], ...categorias.map((c) => [c.id, `${c.nombre} (${vivos.filter((p) => p.categoria_id === c.id).length})`]), ['sin', 'Sin categoría']], f.cat)}
        ${select('stock', [['', 'Disponibilidad: Todos'], ['ok', 'En existencia (> mínimo)'], ['bajo', 'Poco stock (≤ mínimo)'], ['cero', 'Sin existencias (0 un)']], f.stock)}
        ${select('extra', [['', 'Más filtros'], ['oferta', 'Con oferta vigente'], ['destacado', 'Destacados en inicio'], ['sinfoto', 'Sin fotos'], ['ejemplo', 'Datos de ejemplo']], f.extra)}
        ${hayFiltros ? `<button type="button" data-limpiar class="btn-icono" title="Quitar filtros">${ico('restart_alt', 'text-[20px]')}</button>` : ''}
      </div></div>
    ${sel.size ? `<div class="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-primary/10 border border-primary/20">
      <span class="flex items-center gap-1.5 font-label-lg text-label-lg text-primary px-1">${ico('check_circle', 'text-[20px]', true)} ${sel.size} ${sel.size === 1 ? 'producto seleccionado' : 'productos seleccionados'}</span>
      <div class="flex flex-wrap gap-1.5 sm:ml-auto">
        <button type="button" data-masivo="publicado" class="btn-secundario btn-sm">${ico('visibility', 'text-[16px]')}Publicar</button>
        <button type="button" data-masivo="oculto" class="btn-secundario btn-sm">${ico('pause_circle', 'text-[16px]')}Desactivar de Catálogo</button>
        <button type="button" data-masivo="categoria" class="btn-secundario btn-sm">${ico('category', 'text-[16px]')}Cambiar Categoría</button>
        <button type="button" data-masivo="exportar" class="btn-secundario btn-sm">${ico('download', 'text-[16px]')}Exportar Seleccionados</button>
        <button type="button" data-masivo="eliminar" class="btn-peligro-suave btn-sm">${ico('delete', 'text-[16px]')}Eliminar</button>
        <button type="button" data-masivo="ninguno" class="btn-fantasma btn-sm">Quitar selección</button>
      </div></div>` : ''}
  </div>`;
}

function pintar() {
  const lista = filtrados();
  const paginas = Math.max(1, Math.ceil(lista.length / f.porPagina));
  f.pagina = Math.min(f.pagina, paginas);
  const visibles = lista.slice((f.pagina - 1) * f.porPagina, f.pagina * f.porPagina);
  const todosSel = visibles.length && visibles.every((p) => sel.has(p.id));
  const cuerpo = !visibles.length
    ? vacio({ icono: 'inventory_2', titulo: productos.length ? 'No hay productos con estos filtros' : 'Aún no tienes productos', texto: productos.length ? 'Cambia la búsqueda o quita filtros.' : 'Crea tu primer producto o importa un CSV.', accion: '<a href="producto.html" class="btn-primario">+ Nuevo producto</a>' })
    : f.vista === 'tabla'
      ? `<div class="overflow-x-auto"><table class="w-full text-left border-collapse">
          <thead><tr class="bg-surface-container-low text-outline font-label-sm text-label-sm uppercase tracking-wider select-none">
            <th class="py-3 px-4 w-12 text-center"><input type="checkbox" data-sel-todos ${todosSel ? 'checked' : ''} class="w-4 h-4 rounded cursor-pointer accent-primary" aria-label="Seleccionar todos"></th>
            <th class="py-3.5 px-4 font-bold text-on-surface">Producto &amp; Identificación</th><th class="py-3.5 px-3">SKU / Barcode</th><th class="py-3.5 px-3">Categoría</th>
            <th class="py-3.5 px-3">Precios (PVP / Promo)</th><th class="py-3.5 px-4">Salud de Inventario</th><th class="py-3.5 px-3 text-center">Publicación</th>
            <th class="py-3.5 px-3">WhatsApp Live</th><th class="py-3.5 px-3">Actualización</th><th class="py-3.5 px-4 text-right">Acciones</th></tr></thead>
          <tbody class="text-on-surface font-body-md text-body-md divide-y divide-[#F1F5F9]">${visibles.map(fila).join('')}</tbody></table></div>`
      : `<div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 p-3">${visibles.map(tarjeta).join('')}</div>`;
  contenido.innerHTML = `
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
      <div class="space-y-1">
        <div class="flex items-center gap-space-xs flex-wrap"><span class="font-label-sm text-label-sm uppercase tracking-wider text-primary font-bold bg-primary-fixed/20 px-2 py-0.5 rounded-full">Catálogo Unificado</span>
          <span class="inline-flex items-center gap-1 font-label-sm text-label-sm text-secondary font-semibold bg-secondary-fixed/40 px-2 py-0.5 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-secondary"></span> Sincronizado con la tienda</span></div>
        <h1 class="font-headline-lg-mobile text-headline-lg-mobile lg:font-headline-lg lg:text-headline-lg text-on-surface tracking-tight">Catálogo de Productos</h1>
        <p class="font-body-md text-body-md text-on-surface-variant max-w-2xl">Administra, edita y publica artículos visibles en tu tienda y WhatsApp. Los cambios se ven al instante en la tienda.</p></div>
      <div class="flex flex-wrap items-center gap-space-xs sm:gap-space-sm">
        <div class="flex items-center bg-surface-container-lowest rounded-xl shadow-sm p-1 relative">
          <button type="button" data-menu="csv" class="flex items-center gap-space-xs px-3 py-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg font-label-md text-label-md transition-all">${ico('swap_vert', 'text-[18px]')}<span>Importar / Exportar CSV</span></button>
          <div data-submenu="csv" class="hidden absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-nivel3 border border-[#E2E8F0] p-1.5 z-30">
            ${[['exportar', 'download', 'Exportar catálogo (CSV)', 'Todos los productos con precios y stock'], ['meta', 'storefront', 'Exportar para catálogo de WhatsApp', 'Formato de Meta Commerce Manager'], ['importar', 'upload', 'Importar CSV', 'Crea o actualiza por SKU'], ['plantilla', 'description', 'Descargar plantilla', 'Columnas que acepta la importación']]
              .map(([a, icono, t, s]) => `<button type="button" data-csv="${a}" class="w-full flex items-start gap-2.5 px-3 py-2 rounded-xl hover:bg-[#F8FAFC] text-left">${ico(icono, 'text-[20px] text-primary mt-0.5')}<span><span class="block font-label-lg text-label-lg text-[#0F172A]">${t}</span><span class="block font-body-sm text-body-sm text-[#64748B]">${s}</span></span></button>`).join('')}
          </div>
        </div>
        <a href="producto.html" class="flex items-center gap-space-xs px-space-md py-2.5 bg-primary hover:bg-primary-container text-on-primary font-label-lg text-label-lg rounded-xl shadow-sm transition-all active:scale-95">${ico('add_circle', 'text-[20px]')}<span class="tracking-wide font-bold">Nuevo Producto</span></a>
      </div>
    </div>
    ${kpis()}
    ${consola(lista)}
    <div class="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
      ${cuerpo}
      ${lista.length ? `<div class="flex flex-col sm:flex-row items-center justify-between border-t border-[#F1F5F9]">
        <label class="flex items-center gap-2 px-4 pt-3 sm:pt-0 font-label-md text-label-md text-on-surface-variant">Filas por página:
          <select data-por-pagina class="campo h-8 lg:h-8 w-auto py-0 pl-2 font-label-md text-label-md">${[10, 25, 50, 100].map((n) => `<option ${n === f.porPagina ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <div class="flex-1">${paginacion({ total: lista.length, pagina: f.pagina, porPagina: f.porPagina })}</div></div>` : ''}
    </div>
    <div class="hidden lg:flex items-center justify-between gap-4 px-4 py-2.5 rounded-xl bg-surface-container-low font-label-sm text-label-sm text-on-surface-variant">
      <div class="flex items-center gap-4"><span><kbd class="px-1.5 py-0.5 rounded bg-white shadow-sm">N</kbd> Nuevo producto</span><span><kbd class="px-1.5 py-0.5 rounded bg-white shadow-sm">${/Mac/.test(navigator.platform) ? '⌘' : 'Ctrl'} + A</kbd> Seleccionar todo</span><span><kbd class="px-1.5 py-0.5 rounded bg-white shadow-sm">Supr</kbd> Eliminar seleccionados</span></div>
      <span class="flex items-center gap-1">${ico('bolt', 'text-[16px] text-primary', true)} Los cambios se guardan y se reflejan al instante en tu tienda web</span></div>`;
}

// ---------------- Acciones ----------------
async function recargar() { await cargar(); pintar(); }

async function cambiarEstado(ids, estado) {
  await db.actualizar('mt_productos', `id=in.(${ids.join(',')})`, { estado });
  productos.forEach((p) => { if (ids.includes(p.id)) p.estado = estado; });
}

async function borrarProductos(ids) {
  const nombres = productos.filter((p) => ids.includes(p.id)).map((p) => p.nombre);
  const r = await modal({
    titulo: ids.length === 1 ? `¿Qué hacemos con "${nombres[0]}"?` : `¿Qué hacemos con ${ids.length} productos?`, icono: 'delete', peligro: true, ancho: 'md',
    subtitulo: '<strong>Archivar</strong> lo oculta de la tienda y del panel, pero conserva su historial (kárdex). <strong>Eliminar</strong> lo borra para siempre; los pedidos ya hechos conservan su detalle.',
    botones: `<button type="button" data-cerrar class="btn-secundario">Cancelar</button>
      <button type="button" data-valor="archivar" class="btn-secundario">${ico('archive', 'text-[18px]')} Archivar</button>
      <button type="button" data-valor="eliminar" class="btn-peligro">${ico('delete_forever', 'text-[18px]')} Eliminar definitivamente</button>`,
  });
  if (r === 'archivar') { await cambiarEstado(ids, 'archivado'); toast(ids.length === 1 ? 'Producto archivado' : `${ids.length} productos archivados`); }
  if (r === 'eliminar') {
    await db.borrar('mt_productos', `id=in.(${ids.join(',')})`);
    productos = productos.filter((p) => !ids.includes(p.id));
    toast(ids.length === 1 ? 'Producto eliminado' : `${ids.length} productos eliminados`);
  }
  if (r) { ids.forEach((id) => sel.delete(id)); pintar(); }
}

async function duplicar(id) {
  const [p] = await db.leer('mt_productos', `select=*&id=eq.${id}`);
  const [priv] = await db.leer('mt_productos_privado', `select=*&producto_id=eq.${id}`);
  const sufijo = Math.random().toString(36).slice(2, 6);
  const { id: _, creado_en, actualizado_en, actualizado_por, ventas, ...resto } = p;
  const [nuevo] = await db.crear('mt_productos', [{ ...resto, nombre: `${p.nombre} (copia)`.slice(0, 120), slug: `${p.slug}-copia-${sufijo}`.slice(0, 80), sku: `${p.sku}-C${sufijo.toUpperCase()}`.slice(0, 40), estado: 'borrador', ejemplo: false, ventas: 0 }]);
  if (priv) await db.crear('mt_productos_privado', [{ ...priv, producto_id: nuevo.id }]);
  toast('Copia creada como borrador');
  location.href = `producto.html?id=${nuevo.id}`;
}

async function cambiarCategoria(ids) {
  const r = await modal({
    titulo: 'Cambiar categoría', icono: 'category', textoEnviar: 'Aplicar',
    subtitulo: `Se moverán ${ids.length} ${ids.length === 1 ? 'producto' : 'productos'}.`,
    contenido: `<label class="etiqueta" for="nuevaCat">Nueva categoría</label><select id="nuevaCat" name="cat" class="campo"><option value="">Sin categoría</option>${categorias.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}</select>`,
    alEnviar: (form) => form.cat.value || null,
  });
  if (r === null || r === undefined) return;
  const categoria_id = r === true ? null : r;
  await db.actualizar('mt_productos', `id=in.(${ids.join(',')})`, { categoria_id });
  productos.forEach((p) => { if (ids.includes(p.id)) p.categoria_id = categoria_id; });
  toast('Categoría actualizada');
  pintar();
}

// ---------------- CSV ----------------
const COLS_CSV = [
  { clave: 'sku', titulo: 'sku' }, { clave: 'nombre', titulo: 'nombre' }, { clave: 'marca', titulo: 'marca' },
  { titulo: 'categoria', valor: (p) => (p.categoria_id ? catNombre(p.categoria_id) : '') }, { clave: 'precio', titulo: 'precio' },
  { clave: 'precio_oferta', titulo: 'precio_oferta' }, { titulo: 'oferta_activa', valor: (p) => (p.oferta_activa ? 'si' : 'no') },
  { clave: 'stock', titulo: 'stock' }, { clave: 'stock_minimo', titulo: 'stock_minimo' }, { clave: 'estado', titulo: 'estado' },
  { titulo: 'destacado', valor: (p) => (p.destacado ? 'si' : 'no') }, { clave: 'descripcion_corta', titulo: 'descripcion_corta' },
  { titulo: 'etiquetas', valor: (p) => (p.etiquetas || []).join('|') }, { clave: 'codigo_barras', titulo: 'codigo_barras' },
  { titulo: 'imagen', valor: (p) => urlImagen(p.imagenes?.[0]?.url) }, { titulo: 'enlace', valor: (p) => ruta(`producto.html?p=${p.slug}`) },
];
function exportarCsv(lista, nombre = 'productos') {
  descargar(`${nombre}-${new Date().toISOString().slice(0, 10)}.csv`, aCsv(lista, COLS_CSV), 'text/csv;charset=utf-8');
  toast(`${lista.length} productos exportados`);
}
function exportarMeta() {
  const lista = productos.filter((p) => p.estado === 'publicado' && p.en_catalogo_wa);
  const moneda = tienda().moneda || 'USD';
  const filas = lista.map((p) => ({
    id: p.sku, title: p.nombre.slice(0, 150), description: (p.descripcion_corta || p.nombre).slice(0, 5000),
    availability: agotado(p) && p.al_agotarse === 'bloquear' ? 'out of stock' : agotado(p) ? 'preorder' : 'in stock', condition: 'new',
    price: `${num(p.precio).toFixed(2)} ${moneda}`, sale_price: ofertaVigente(p) ? `${num(p.precio_oferta).toFixed(2)} ${moneda}` : '',
    link: ruta(`producto.html?p=${p.slug}`), image_link: urlImagen(p.imagenes?.[0]?.url), brand: p.marca || tienda().nombre || 'MI TIENDA',
    google_product_category: '', quantity_to_sell_on_facebook: p.rastrear_stock ? p.stock : '',
  }));
  descargar(`catalogo-whatsapp-${new Date().toISOString().slice(0, 10)}.csv`, aCsv(filas, Object.keys(filas[0] || { id: 1 })).replace(/^﻿/, ''), 'text/csv;charset=utf-8');
  toast(`${lista.length} productos listos para subir en Meta Commerce Manager (Catálogo → Fuentes de datos)`, { tipo: 'info', duracion: 6000 });
}
function plantillaCsv() {
  const ejemplo = [{ sku: 'CAM-001', nombre: 'Camiseta básica algodón', marca: 'MiMarca', categoria: categorias[0]?.nombre || '', precio: '19.90', precio_oferta: '', oferta_activa: 'no', stock: '25', stock_minimo: '5', estado: 'borrador', destacado: 'no', descripcion_corta: '100% algodón, varios colores.', etiquetas: 'algodón|básicos', codigo_barras: '' }];
  descargar('plantilla-productos.csv', aCsv(ejemplo, Object.keys(ejemplo[0])), 'text/csv;charset=utf-8');
}
async function importarCsv() {
  const entrada = document.createElement('input');
  entrada.type = 'file'; entrada.accept = '.csv,text/csv';
  entrada.addEventListener('change', async () => {
    const archivo = entrada.files[0];
    if (!archivo) return;
    const filas = leerCsv(await archivo.text());
    const porSku = new Map(productos.map((p) => [p.sku.toUpperCase(), p]));
    const catPorNombre = new Map(categorias.map((c) => [normalizar(c.nombre), c.id]));
    const si = (v) => /^(si|sí|true|1|x|yes)$/i.test(String(v || '').trim());
    const plan = { nuevos: [], actualizados: [], errores: [] };
    filas.forEach((r, i) => {
      const sku = String(r.sku || '').trim().toUpperCase();
      if (!sku) { plan.errores.push(`Fila ${i + 2}: falta el SKU`); return; }
      const existente = porSku.get(sku);
      const cambios = {};
      if (r.nombre) cambios.nombre = r.nombre.slice(0, 120);
      if (r.marca !== undefined) cambios.marca = r.marca || null;
      if (r.categoria) cambios.categoria_id = catPorNombre.get(normalizar(r.categoria)) ?? null;
      if (r.precio !== undefined && r.precio !== '') { const v = Number(String(r.precio).replace(',', '.')); if (Number.isNaN(v)) { plan.errores.push(`Fila ${i + 2}: precio no válido`); return; } cambios.precio = v; }
      if (r.precio_oferta !== undefined) cambios.precio_oferta = r.precio_oferta === '' ? null : Number(String(r.precio_oferta).replace(',', '.'));
      if (r.oferta_activa !== undefined) cambios.oferta_activa = si(r.oferta_activa);
      if (r.stock !== undefined && r.stock !== '' && !(existente?.variantes || []).length) cambios.stock = Math.max(0, parseInt(r.stock, 10) || 0);
      if (r.stock_minimo !== undefined && r.stock_minimo !== '') cambios.stock_minimo = Math.max(0, parseInt(r.stock_minimo, 10) || 0);
      if (r.estado && ['publicado', 'borrador', 'oculto', 'archivado'].includes(r.estado.trim().toLowerCase())) cambios.estado = r.estado.trim().toLowerCase();
      if (r.destacado !== undefined) cambios.destacado = si(r.destacado);
      if (r.descripcion_corta !== undefined) cambios.descripcion_corta = r.descripcion_corta.slice(0, 160) || null;
      if (r.etiquetas !== undefined) cambios.etiquetas = r.etiquetas ? r.etiquetas.split('|').map((t) => t.trim()).filter(Boolean) : [];
      if (r.codigo_barras !== undefined) cambios.codigo_barras = r.codigo_barras || null;
      if (existente) plan.actualizados.push({ id: existente.id, cambios });
      else if (!cambios.nombre || cambios.precio == null) plan.errores.push(`Fila ${i + 2} (${sku}): para crear un producto se necesitan nombre y precio`);
      else plan.nuevos.push({ ...cambios, sku, slug: `${slug(cambios.nombre)}-${Math.random().toString(36).slice(2, 6)}`, estado: cambios.estado || 'borrador' });
    });
    const ok = await modal({
      titulo: 'Importar productos', icono: 'upload', textoEnviar: 'Importar ahora',
      contenido: `<div class="grid grid-cols-3 gap-2 text-center">
          <div class="p-3 rounded-xl bg-secondary-container/30"><p class="font-headline-md text-headline-md text-secondary">${plan.nuevos.length}</p><p class="font-label-md text-label-md">nuevos</p></div>
          <div class="p-3 rounded-xl bg-tertiary-fixed/50"><p class="font-headline-md text-headline-md text-tertiary">${plan.actualizados.length}</p><p class="font-label-md text-label-md">a actualizar</p></div>
          <div class="p-3 rounded-xl bg-error-container/40"><p class="font-headline-md text-headline-md text-error">${plan.errores.length}</p><p class="font-label-md text-label-md">con error</p></div></div>
        ${plan.errores.length ? `<ul class="mt-3 max-h-40 overflow-y-auto font-body-sm text-body-sm text-error list-disc pl-5">${plan.errores.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
        <p class="ayuda mt-3">Los productos nuevos se crean como borrador (sin fotos) para que los revises antes de publicarlos.</p>`,
      alEnviar: async (form, capa) => {
        if (!plan.nuevos.length && !plan.actualizados.length) throw new Error('No hay filas válidas para importar.');
        const estado = capa.querySelector('[data-error]');
        if (plan.nuevos.length) await db.crear('mt_productos', plan.nuevos);
        for (const [i, a] of plan.actualizados.entries()) {
          estado.classList.remove('hidden'); estado.className = estado.className.replace('text-[#991B1B]', 'text-primary');
          estado.innerHTML = `${spinner()} Actualizando ${i + 1} de ${plan.actualizados.length}…`;
          if (Object.keys(a.cambios).length) await db.actualizar('mt_productos', `id=eq.${a.id}`, a.cambios);
        }
        return true;
      },
    });
    if (ok) { toast('Importación terminada'); await recargar(); }
  });
  entrada.click();
}

// ---------------- Eventos ----------------
contenido.addEventListener('input', debounce((e) => {
  if (e.target.id === 'buscar') { f.q = e.target.value; f.pagina = 1; const pos = e.target.selectionStart; pintar(); const b = $('#buscar'); b.focus(); b.setSelectionRange(pos, pos); }
}, 200));
contenido.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset.filtro) { f[t.dataset.filtro] = t.value; f.pagina = 1; pintar(); return; }
  if (t.matches('[data-por-pagina]')) { f.porPagina = Number(t.value); f.pagina = 1; pintar(); return; }
  if (t.dataset.sel) { if (t.checked) sel.add(t.dataset.sel); else sel.delete(t.dataset.sel); pintar(); return; }
  if (t.matches('[data-sel-todos]')) {
    const lista = filtrados().slice((f.pagina - 1) * f.porPagina, f.pagina * f.porPagina);
    lista.forEach((p) => (t.checked ? sel.add(p.id) : sel.delete(p.id)));
    pintar(); return;
  }
  if (t.dataset.publicar) {
    const p = productos.find((x) => x.id === t.dataset.publicar);
    try { await cambiarEstado([p.id], t.checked ? 'publicado' : 'oculto'); toast(t.checked ? `"${p.nombre}" publicado en la tienda` : `"${p.nombre}" pausado (oculto en la tienda)`); pintar(); }
    catch (err) { t.checked = !t.checked; toastError(err); }
  }
});
contenido.addEventListener('click', async (e) => {
  const t = e.target;
  const menu = t.closest('[data-menu]');
  if (menu) { $(`[data-submenu="${menu.dataset.menu}"]`).classList.toggle('hidden'); return; }
  if (!t.closest('[data-submenu]')) $$('[data-submenu]').forEach((m) => m.classList.add('hidden'));
  try {
    const csv = t.closest('[data-csv]');
    if (csv) {
      if (csv.dataset.csv === 'exportar') exportarCsv(filtrados());
      if (csv.dataset.csv === 'meta') exportarMeta();
      if (csv.dataset.csv === 'plantilla') plantillaCsv();
      if (csv.dataset.csv === 'importar') await importarCsv();
      return;
    }
    const est = t.closest('[data-estado]');
    if (est) { f.estado = est.dataset.estado; f.pagina = 1; pintar(); return; }
    const kpi = t.closest('[data-kpi]');
    if (kpi) {
      const k = kpi.dataset.kpi;
      Object.assign(f, { estado: k === 'bajo' ? 'todos' : k, stock: k === 'bajo' ? 'bajo' : '', pagina: 1 });
      pintar(); return;
    }
    const vista = t.closest('[data-vista]');
    if (vista) { f.vista = vista.dataset.vista; try { localStorage.setItem('mt_vista_prod', f.vista); } catch { /* nada */ } pintar(); return; }
    if (t.closest('[data-limpiar]')) { Object.assign(f, { q: '', estado: 'todos', cat: '', stock: '', extra: '', pagina: 1 }); pintar(); return; }
    const pag = t.closest('[data-pagina]');
    if (pag) { f.pagina = Number(pag.dataset.pagina); pintar(); contenido.scrollIntoView({ behavior: 'smooth' }); return; }
    const wa = t.closest('[data-wa]');
    if (wa) {
      const p = productos.find((x) => x.id === wa.dataset.wa);
      await db.actualizar('mt_productos', `id=eq.${p.id}`, { en_catalogo_wa: !p.en_catalogo_wa });
      p.en_catalogo_wa = !p.en_catalogo_wa;
      toast(p.en_catalogo_wa ? 'Incluido en el catálogo exportable de WhatsApp' : 'Excluido del catálogo de WhatsApp');
      pintar(); return;
    }
    const dup = t.closest('[data-duplicar]');
    if (dup) { await duplicar(dup.dataset.duplicar); return; }
    const borrar = t.closest('[data-borrar]');
    if (borrar) { await borrarProductos([borrar.dataset.borrar]); return; }
    const masivo = t.closest('[data-masivo]');
    if (masivo) {
      const ids = [...sel];
      const a = masivo.dataset.masivo;
      if (a === 'ninguno') { sel.clear(); pintar(); }
      if (a === 'publicado' || a === 'oculto') {
        await cambiarEstado(ids, a);
        toast(a === 'publicado' ? `${ids.length} productos publicados` : `${ids.length} productos desactivados del catálogo`);
        sel.clear(); pintar();
      }
      if (a === 'categoria') await cambiarCategoria(ids);
      if (a === 'exportar') exportarCsv(productos.filter((p) => sel.has(p.id)), 'productos-seleccionados');
      if (a === 'eliminar') await borrarProductos(ids);
    }
  } catch (err) { toastError(err); }
});
document.addEventListener('keydown', (e) => {
  const escribiendo = /input|textarea|select/i.test(document.activeElement?.tagName) || document.querySelector('.z-\\[110\\]');
  if (escribiendo) return;
  if (e.key === 'n' || e.key === 'N') { location.href = 'producto.html'; }
  if (e.key === '/') { e.preventDefault(); $('#buscar')?.focus(); }
  if (e.key === 'a' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); filtrados().forEach((p) => sel.add(p.id)); pintar(); }
  if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size) { e.preventDefault(); borrarProductos([...sel]).catch(toastError); }
});

await cargar();
pintar();
