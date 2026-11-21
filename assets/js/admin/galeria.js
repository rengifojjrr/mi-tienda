// Galería multimedia: todas las imágenes subidas al depósito mt-fotos (tabla mt_medios).
// Subida múltiple (botón o arrastrando a la página), búsqueda, filtro por carpeta, copiar URL,
// ver dónde se usa cada imagen y borrar una o varias (archivo grande + miniatura).
import { $, esc, ico, hace, fechaHora, normalizar, copiar, debounce } from '../util.js';
import { db, fotos, urlImagen } from '../api.js';
import { iniciarPanel, tienda } from './base.js';
import { modal, confirmar, toast, toastError, vacio, subirImagen, spinner } from './ui.js';

await iniciarPanel({ seccion: 'galeria', migas: [{ texto: 'Marketing' }, { texto: 'Galería Multimedia' }], area: 'catalogo' });
const contenido = $('#contenido');

const POR_TANDA = 60; // tarjetas que se pintan por vez ("Mostrar más")
const CARPETAS = {
  productos: ['Productos', 'inventory_2'], categorias: ['Categorías', 'category'], banners: ['Banners', 'view_carousel'],
  tienda: ['Tienda', 'storefront'], galeria: ['Galería', 'photo_library'],
};

let medios = [];          // más recientes primero
let cargado = false;
let filtro = { q: '', carpeta: '' };
let limite = POR_TANDA;
let seleccionando = false;
let borrando = false;
const seleccion = new Set();
const cola = [];          // archivos esperando subir (se suben de a uno)
const progreso = { total: 0, hechas: 0, fallidas: 0, actual: '' };
let subiendo = false;

// ---------------- Utilidades ----------------
const formato = (() => {
  try { return new Intl.NumberFormat(tienda().locale || 'es-US', { maximumFractionDigits: 1 }); } catch { return new Intl.NumberFormat('es-US', { maximumFractionDigits: 1 }); }
})();
function peso(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${formato.format(n / 1024)} KB`;
  if (n < 1073741824) return `${formato.format(n / 1048576)} MB`;
  return `${formato.format(n / 1073741824)} GB`;
}
const carpetaDe = (m) => String(m.ruta || '').split('/')[0] || 'otros';
const infoCarpeta = (c) => CARPETAS[c] || [c.charAt(0).toUpperCase() + c.slice(1), 'folder'];
const nombreDe = (m) => m.nombre || String(m.ruta || '').split('/').pop() || 'imagen';
// Mismo filtro que la función de borde mt-fotos (las rutas que no cumplen se ignoran allí).
const rutaValida = (r) => typeof r === 'string' && /^[A-Za-z0-9][A-Za-z0-9/_.-]{0,200}$/.test(r) && !r.includes('..');
const hayModal = () => !!$('.z-\\[110\\]');

/** Lee todas las filas aunque pasen del máximo que devuelve el servidor por consulta. */
async function leerTodo(tabla, consulta) {
  const { filas, total } = await db.leerConTotal(tabla, consulta);
  while (filas.length < total) {
    const mas = await db.leer(tabla, `${consulta}&offset=${filas.length}`);
    if (!mas.length) break;
    filas.push(...mas);
  }
  return filas;
}

function visibles() {
  const q = normalizar(filtro.q.trim());
  return medios.filter((m) => (!filtro.carpeta || carpetaDe(m) === filtro.carpeta)
    && (!q || normalizar(`${m.nombre || ''} ${m.ruta || ''}`).includes(q)));
}

// ---------------- Dónde se usa cada imagen ----------------
/** Devuelve Map(id de medio → [{icono, texto, href}]) revisando productos, categorías, banners y el logo. */
async function buscarUsos(lista) {
  const [prods, cats, bans, cfg] = await Promise.all([
    leerTodo('mt_productos', 'select=id,nombre,imagenes&order=id'),
    db.leer('mt_categorias', 'select=id,nombre,imagen_url'),
    db.leer('mt_banners', 'select=id,titulo,imagen_url'),
    db.leer('mt_config', 'select=logo_url&id=eq.1'),
  ]);
  const logo = cfg[0]?.logo_url;
  const usos = new Map();
  for (const m of lista) {
    const urls = new Set([m.url, m.mini_url].filter(Boolean));
    const u = [];
    for (const p of prods) {
      if ((Array.isArray(p.imagenes) ? p.imagenes : []).some((i) => urls.has(i?.url) || urls.has(i?.mini))) {
        u.push({ icono: 'inventory_2', texto: `Producto: ${p.nombre}`, href: `producto.html?id=${encodeURIComponent(p.id)}` });
      }
    }
    for (const c of cats) if (urls.has(c.imagen_url)) u.push({ icono: 'category', texto: `Categoría: ${c.nombre}`, href: `categorias.html#${encodeURIComponent(c.id)}` });
    for (const b of bans) if (urls.has(b.imagen_url)) u.push({ icono: 'view_carousel', texto: `Banner: ${b.titulo}`, href: `promos.html#${encodeURIComponent(b.id)}` });
    if (logo && urls.has(logo)) u.push({ icono: 'storefront', texto: 'Logo de la tienda', href: 'configuracion.html' });
    usos.set(m.id, u);
  }
  return usos;
}

const listaUsos = (u, max = 6) => `<span class="block mt-1.5 space-y-1">${u.slice(0, max).map((x) => `<span class="flex items-center gap-1.5 text-[#0F172A] min-w-0">${ico(x.icono, 'text-[16px] text-primary')}<span class="truncate">${esc(x.texto)}</span></span>`).join('')}
  ${u.length > max ? `<span class="block text-[#64748B]">y ${u.length - max} más…</span>` : ''}</span>`;

// ---------------- Piezas visuales ----------------
function pintarMarco() {
  contenido.innerHTML = `
    <div class="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md">
      <div class="space-y-1">
        <span class="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-bold">Marketing</span>
        <h1 class="font-headline-lg-mobile text-headline-lg-mobile lg:font-headline-lg lg:text-headline-lg text-on-surface tracking-tight">Galería Multimedia</h1>
        <p class="font-body-md text-body-md text-on-surface-variant max-w-2xl">Todas las imágenes que subiste a tu tienda: fotos de productos, categorías, banners y logo. Se optimizan solas al subirlas.</p>
      </div>
      <div class="flex flex-wrap items-center gap-space-sm">
        <button type="button" data-accion="seleccionar" aria-pressed="false" class="flex items-center gap-space-xs px-3.5 py-2.5 rounded-xl bg-surface-container-lowest hover:bg-surface-container-low text-on-surface font-label-md text-label-md shadow-sm transition-all">${ico('checklist', 'text-[18px] text-on-surface-variant')}<span data-texto-seleccionar>Seleccionar</span></button>
        <label class="flex items-center gap-space-xs px-space-md py-2.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-label-lg text-label-lg shadow-sm cursor-pointer transition-all active:scale-95 focus-within:ring-[3px] focus-within:ring-primary/30">
          ${ico('cloud_upload', 'text-[20px]')}<span>Subir imágenes</span><input type="file" accept="image/*" multiple class="sr-only" data-archivos></label>
      </div>
    </div>
    <div data-stats class="grid grid-cols-2 lg:grid-cols-3 gap-space-sm"></div>
    <label class="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 p-5 rounded-2xl border-2 border-dashed border-outline-variant bg-surface-container-lowest hover:border-primary hover:bg-primary/5 cursor-pointer transition-colors text-center sm:text-left focus-within:border-primary">
      <span class="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">${ico('add_photo_alternate', 'text-[26px]')}</span>
      <span class="min-w-0"><span class="block font-label-lg text-label-lg text-on-surface">Arrastra imágenes a cualquier parte de esta página o <span class="text-primary underline">explora tus archivos</span></span>
        <span class="block font-body-sm text-body-sm text-on-surface-variant">JPG, PNG o WEBP de hasta 15 MB. Se redimensionan y se crea una miniatura automáticamente.</span></span>
      <input type="file" accept="image/*" multiple class="sr-only" data-archivos></label>
    <div data-progreso class="hidden"></div>
    <p class="flex items-start gap-2 font-body-sm text-body-sm text-on-surface-variant">${ico('info', 'text-[18px] text-outline')}
      <span>Las fotos de ejemplo de los productos vienen incluidas en el sitio (carpeta <code class="font-mono text-on-surface">assets/img/demo</code>) y no forman parte de la galería.</span></p>
    <div class="bg-surface-container-lowest rounded-xl shadow-sm p-space-md flex flex-col gap-space-sm">
      <div class="relative">${ico('search', 'absolute left-3.5 top-1/2 -translate-y-1/2 text-outline text-[20px] pointer-events-none')}
        <input type="search" data-buscar class="w-full pl-11 pr-4 py-2.5 bg-surface-container-low rounded-xl font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container transition-all" placeholder="Buscar por nombre de archivo…" aria-label="Buscar imágenes" autocomplete="off"></div>
      <div data-chips class="flex flex-wrap gap-1.5" aria-label="Filtrar por carpeta"></div>
    </div>
    <div data-barra-sel class="hidden sticky top-[4.5rem] z-30"></div>
    <div data-rejilla></div>`;
  $('[data-buscar]', contenido).addEventListener('input', debounce((e) => {
    filtro.q = e.target.value;
    limite = POR_TANDA;
    pintarRejilla();
  }, 150));
}

function pintarStats() {
  const bytes = medios.reduce((s, m) => s + (Number(m.bytes) || 0), 0);
  const ultima = medios[0]?.creado_en;
  const cifra = (titulo, valor, extra, icono, color, clases = '') => `<div class="${clases} bg-surface-container-lowest p-space-sm sm:p-space-md rounded-xl shadow-sm flex items-center justify-between gap-2">
      <div class="min-w-0"><span class="font-label-sm text-label-sm uppercase tracking-wider text-outline">${titulo}</span>
        <p class="font-headline-md text-headline-md text-on-surface tnum truncate">${esc(valor)} <span class="font-body-sm text-body-sm text-outline font-normal">${extra}</span></p></div>
      <div class="w-10 h-10 rounded-xl ${color} flex items-center justify-center shrink-0">${ico(icono, 'text-[22px]')}</div></div>`;
  $('[data-stats]', contenido).innerHTML = [
    cifra('Imágenes', String(medios.length), medios.length === 1 ? 'archivo' : 'archivos', 'perm_media', 'bg-surface-container-low text-primary'),
    cifra('Espacio usado', peso(bytes), '', 'cloud_done', 'bg-secondary-container/30 text-on-secondary-container'),
    cifra('Última subida', ultima ? hace(ultima) : '—', '', 'schedule', 'bg-tertiary-fixed text-on-tertiary-fixed-variant', 'col-span-2 lg:col-span-1'),
  ].join('');
}

function pintarChips() {
  const cuentas = new Map();
  for (const m of medios) { const c = carpetaDe(m); cuentas.set(c, (cuentas.get(c) || 0) + 1); }
  if (filtro.carpeta && !cuentas.has(filtro.carpeta)) filtro.carpeta = '';
  const orden = [...Object.keys(CARPETAS).filter((c) => cuentas.has(c)), ...[...cuentas.keys()].filter((c) => !CARPETAS[c]).sort()];
  const chip = (id, texto, n, icono) => {
    const activo = filtro.carpeta === id;
    return `<button type="button" data-carpeta="${esc(id)}" aria-pressed="${activo}" class="px-3 py-1.5 rounded-lg font-label-md text-label-md flex items-center gap-1.5 whitespace-nowrap transition-colors ${activo ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}">
      ${ico(icono, 'text-[16px]')}${esc(texto)}<span class="tnum ${activo ? 'opacity-80' : 'text-outline'}">(${n})</span></button>`;
  };
  $('[data-chips]', contenido).innerHTML = chip('', 'Todas', medios.length, 'apps')
    + orden.map((c) => { const [texto, icono] = infoCarpeta(c); return chip(c, texto, cuentas.get(c), icono); }).join('');
}

function tarjeta(m) {
  const sel = seleccion.has(m.id);
  const nombre = esc(nombreDe(m));
  const detalle = [m.ancho && m.alto ? `${m.ancho}×${m.alto}` : '', m.bytes ? peso(m.bytes) : ''].filter(Boolean).join(' · ');
  return `<div data-tarjeta="${esc(m.id)}" class="relative bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col ring-2 transition-shadow ${sel ? 'ring-primary' : 'ring-transparent hover:shadow-md'}">
    <button type="button" data-accion="${seleccionando ? 'marcar' : 'ver'}" data-id="${esc(m.id)}" ${seleccionando ? `aria-pressed="${sel}"` : ''}
      class="group relative block aspect-square bg-surface-container overflow-hidden" aria-label="${seleccionando ? 'Seleccionar' : 'Ver detalles de'} ${nombre}">
      <img src="${esc(urlImagen(m.mini_url || m.url))}" alt="" loading="lazy" decoding="async" class="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300 ${sel ? 'opacity-90' : ''}">
      <span class="absolute left-2 bottom-2 px-2 py-0.5 rounded-full bg-inverse-surface/70 text-inverse-on-surface font-label-sm text-label-sm backdrop-blur-sm">${esc(infoCarpeta(carpetaDe(m))[0])}</span>
      ${seleccionando ? `<span class="absolute top-2 left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center shadow ${sel ? 'bg-primary border-primary text-white' : 'bg-white/85 border-white text-transparent'}">${ico('check', 'text-[16px]')}</span>` : ''}
    </button>
    <div class="px-2.5 pt-2 min-w-0">
      <p class="font-label-md text-label-md text-on-surface truncate" title="${nombre}">${nombre}</p>
      <p class="font-body-sm text-[11px] leading-4 text-outline tnum truncate">${esc(detalle) || '&nbsp;'}</p>
      <p class="font-body-sm text-[11px] leading-4 text-outline truncate">${esc(hace(m.creado_en))}</p>
    </div>
    <div class="flex items-center justify-end gap-0.5 px-1 pb-1">
      <button type="button" data-accion="copiar" data-id="${esc(m.id)}" class="btn-icono w-8 h-8 hover:text-primary" title="Copiar URL" aria-label="Copiar URL de ${nombre}">${ico('content_copy', 'text-[18px]')}</button>
      <a href="${esc(urlImagen(m.url))}" target="_blank" rel="noopener" class="btn-icono w-8 h-8 hover:text-secondary" title="Abrir en otra pestaña" aria-label="Abrir ${nombre} en otra pestaña">${ico('open_in_new', 'text-[18px]')}</a>
      <button type="button" data-accion="borrar" data-id="${esc(m.id)}" class="btn-icono w-8 h-8 hover:text-error hover:bg-error-container/40" title="Eliminar" aria-label="Eliminar ${nombre}">${ico('delete', 'text-[18px]')}</button>
    </div></div>`;
}

function pintarRejilla() {
  const cont = $('[data-rejilla]', contenido);
  if (!medios.length) {
    cont.innerHTML = `<div class="bg-surface-container-lowest rounded-xl shadow-sm">${vacio({
      icono: 'perm_media', titulo: 'Tu galería está vacía',
      texto: 'Sube fotos para usarlas en tus productos, categorías y banners. También puedes subirlas desde cada formulario.',
      accion: `<label class="btn-primario cursor-pointer">${ico('cloud_upload', 'text-[18px]')}Subir imágenes<input type="file" accept="image/*" multiple class="sr-only" data-archivos></label>`,
    })}</div>`;
    return;
  }
  const lista = visibles();
  if (!lista.length) {
    cont.innerHTML = `<div class="bg-surface-container-lowest rounded-xl shadow-sm">${vacio({
      icono: 'search_off', titulo: 'Sin resultados',
      texto: filtro.q.trim() ? `Ninguna imagen coincide con “${esc(filtro.q.trim())}”${filtro.carpeta ? ' en esta carpeta' : ''}.` : 'No hay imágenes en esta carpeta.',
      accion: '<button type="button" data-accion="limpiar-filtros" class="btn-secundario">Limpiar filtros</button>',
    })}</div>`;
    return;
  }
  cont.innerHTML = `<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">${lista.slice(0, limite).map(tarjeta).join('')}</div>
    ${lista.length > limite ? `<div class="flex justify-center mt-4"><button type="button" data-accion="mas" class="btn-secundario">${ico('expand_more', 'text-[18px]')}Mostrar más (${lista.length - limite})</button></div>` : ''}
    <p class="mt-3 text-center font-body-sm text-body-sm text-outline tnum">${Math.min(limite, lista.length)} de ${lista.length} ${lista.length === 1 ? 'imagen' : 'imágenes'}${lista.length !== medios.length ? ` (filtradas de ${medios.length})` : ''}</p>`;
}

function actualizarTarjeta(id) {
  const m = medios.find((x) => x.id === id);
  const el = $(`[data-tarjeta="${id}"]`, contenido);
  if (m && el) el.outerHTML = tarjeta(m);
}

function pintarSeleccion() {
  const boton = $('[data-accion="seleccionar"][aria-pressed]', contenido);
  if (boton) {
    boton.setAttribute('aria-pressed', String(seleccionando));
    $('[data-texto-seleccionar]', boton).textContent = seleccionando ? 'Cancelar selección' : 'Seleccionar';
  }
  const barra = $('[data-barra-sel]', contenido);
  barra.classList.toggle('hidden', !seleccionando);
  if (!seleccionando) { barra.innerHTML = ''; return; }
  const n = seleccion.size;
  const total = visibles().length;
  const claseBoton = 'px-3 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface font-label-md text-label-md hover:bg-surface-container transition-colors disabled:opacity-50';
  barra.innerHTML = `<div class="flex flex-wrap items-center justify-between gap-2 bg-primary-container text-on-primary-container px-space-md py-2.5 rounded-xl shadow-md">
    <div class="flex items-center gap-2">${borrando ? spinner() : ico('check_circle', 'text-[20px]')}
      <span class="font-label-lg text-label-lg font-bold tnum">${borrando ? 'Eliminando…' : `${n} ${n === 1 ? 'seleccionada' : 'seleccionadas'}`}</span></div>
    <div class="flex flex-wrap items-center gap-1.5">
      <button type="button" data-accion="todas" class="${claseBoton}" ${borrando || !total ? 'disabled' : ''}>Seleccionar todo (${total})</button>
      ${n ? `<button type="button" data-accion="ninguna" class="${claseBoton}" ${borrando ? 'disabled' : ''}>Quitar selección</button>` : ''}
      <button type="button" data-accion="borrar-seleccion" ${n && !borrando ? '' : 'disabled'} class="px-3 py-1.5 rounded-lg bg-error text-on-error font-label-md text-label-md hover:opacity-90 flex items-center gap-1 disabled:opacity-50">${ico('delete', 'text-[16px]')}Eliminar</button>
      <button type="button" data-accion="seleccionar" class="px-3 py-1.5 rounded-lg text-on-primary-container font-label-md text-label-md hover:bg-white/10" ${borrando ? 'disabled' : ''}>Listo</button>
    </div></div>`;
}

function pintarProgreso() {
  const el = $('[data-progreso]', contenido);
  if (!el) return;
  if (!subiendo && !cola.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  const hechas = progreso.hechas + progreso.fallidas;
  const pct = progreso.total ? Math.round((hechas / progreso.total) * 100) : 0;
  el.classList.remove('hidden');
  el.innerHTML = `<div class="bg-surface-container-lowest rounded-xl shadow-sm p-3.5 flex flex-col gap-2" role="status" aria-live="polite">
    <div class="flex items-center gap-2 font-label-md text-label-md text-primary min-w-0">${spinner()}
      <span class="shrink-0 tnum">Subiendo ${Math.min(hechas + 1, progreso.total)} de ${progreso.total}…</span>
      <span class="text-outline font-normal truncate">${esc(progreso.actual)}</span></div>
    <div class="w-full h-1.5 bg-surface-container rounded-full overflow-hidden"><div class="h-full bg-primary rounded-full transition-all" style="width:${pct}%"></div></div>
  </div>`;
}

function pintarDatos() {
  pintarStats();
  pintarChips();
  pintarRejilla();
  pintarSeleccion();
}

// ---------------- Datos ----------------
async function cargar() {
  try {
    medios = await leerTodo('mt_medios', 'select=*&order=creado_en.desc,id.desc');
    if (!cargado) pintarMarco();
    cargado = true;
    for (const id of [...seleccion]) if (!medios.some((m) => m.id === id)) seleccion.delete(id);
    pintarDatos();
    pintarProgreso();
  } catch (e) {
    toastError(e);
    if (!cargado) {
      contenido.innerHTML = `<div class="bg-surface-container-lowest rounded-xl shadow-sm">${vacio({
        icono: 'cloud_off', titulo: 'No se pudo cargar la galería', texto: esc(e.message),
        accion: '<button type="button" data-accion="recargar" class="btn-primario">Reintentar</button>',
      })}</div>`;
    }
  }
}

// ---------------- Subida ----------------
function encolar(archivos) {
  if (!cargado) return;
  const lista = [...(archivos || [])];
  const imagenes = lista.filter((a) => (a.type || '').startsWith('image/'));
  const otros = lista.length - imagenes.length;
  if (otros) toast(otros === 1 ? 'Un archivo no es una imagen y se omitió' : `${otros} archivos no son imágenes y se omitieron`, { tipo: 'info' });
  if (!imagenes.length) return;
  // Para que se vean las nuevas, se quitan los filtros que las esconderían.
  if (filtro.q || (filtro.carpeta && filtro.carpeta !== 'galeria')) {
    filtro = { q: '', carpeta: '' };
    const buscador = $('[data-buscar]', contenido);
    if (buscador) buscador.value = '';
  }
  cola.push(...imagenes);
  progreso.total += imagenes.length;
  pintarProgreso();
  procesarCola();
}

async function procesarCola() {
  if (subiendo) return;
  subiendo = true;
  let recargar = false;
  while (cola.length) {
    const archivo = cola.shift();
    progreso.actual = archivo.name;
    pintarProgreso();
    try {
      const r = await subirImagen(archivo, 'galeria');
      const fila = (await db.leer('mt_medios', `select=*&ruta=eq.${encodeURIComponent(r.ruta)}`))[0];
      if (fila) medios.unshift(fila); else recargar = true;
      progreso.hechas++;
      pintarStats();
      pintarChips();
      pintarRejilla();
      if (seleccionando) pintarSeleccion();
    } catch (e) {
      progreso.fallidas++;
      toastError(e);
    }
  }
  const { hechas, fallidas } = progreso;
  subiendo = false;
  Object.assign(progreso, { total: 0, hechas: 0, fallidas: 0, actual: '' });
  pintarProgreso();
  if (recargar) await cargar();
  if (hechas) toast(`${hechas === 1 ? 'Imagen subida' : `${hechas} imágenes subidas`} a la galería${fallidas ? ` (${fallidas} con error)` : ''}`);
}

// ---------------- Borrado ----------------
async function eliminar(lista, usosPrevios = null) {
  if (!lista.length || borrando) return;
  let usos = usosPrevios;
  if (!usos) {
    try { usos = await buscarUsos(lista); } catch (e) { toastError(e); return; }
  }
  const uno = lista.length === 1;
  const usadas = lista.filter((m) => usos.get(m.id)?.length);
  let mensaje;
  if (uno) {
    const u = usos.get(lista[0].id) || [];
    mensaje = u.length
      ? `<span class="block">Esta imagen se usa en:</span>${listaUsos(u)}<span class="block mt-2">Si la eliminas, esos lugares se quedarán sin imagen.</span>`
      : '<span class="block">No se usa en productos, categorías, banners ni en el logo.</span>';
  } else {
    const detalle = usadas.flatMap((m) => usos.get(m.id).map((x) => ({ icono: x.icono, texto: `${nombreDe(m)} → ${x.texto}` })));
    mensaje = usadas.length
      ? `<span class="block"><strong class="text-[#0F172A]">${usadas.length} de ${lista.length}</strong> ${usadas.length === 1 ? 'está en uso' : 'están en uso'}:</span>${listaUsos(detalle)}<span class="block mt-2">Si las eliminas, esos lugares se quedarán sin imagen.</span>`
      : '<span class="block">Ninguna se usa en productos, categorías, banners ni en el logo.</span>';
  }
  mensaje += '<span class="block mt-2">Se borran el archivo y su miniatura. Esta acción no se puede deshacer.</span>';
  const ok = await confirmar({
    titulo: uno ? '¿Eliminar esta imagen?' : `¿Eliminar ${lista.length} imágenes?`, mensaje, peligro: true, icono: 'delete',
    boton: uno ? 'Eliminar imagen' : `Eliminar ${lista.length}`,
  });
  if (!ok) return;

  borrando = true;
  if (seleccionando) pintarSeleccion();
  let hechas = 0;
  try {
    // La función mt-fotos acepta hasta 60 rutas por llamada: 30 imágenes (archivo + miniatura).
    for (let i = 0; i < lista.length; i += 30) {
      const lote = lista.slice(i, i + 30);
      const rutas = [...new Set(lote.flatMap((m) => [m.ruta, fotos.rutaDesdeUrl(m.mini_url)]).filter(rutaValida))];
      if (rutas.length) await fotos.borrar(rutas);
      // La función ya borra las filas por ruta; se borran también por id por si alguna ruta no coincidía.
      await db.borrar('mt_medios', `id=in.(${lote.map((m) => m.id).join(',')})`);
      const ids = new Set(lote.map((m) => m.id));
      medios = medios.filter((m) => !ids.has(m.id));
      ids.forEach((id) => seleccion.delete(id));
      hechas += lote.length;
    }
    toast(uno ? 'Imagen eliminada' : `${hechas} imágenes eliminadas`);
  } catch (e) {
    toastError(e);
    if (hechas) toast(`Se eliminaron ${hechas} de ${lista.length} imágenes`, { tipo: 'info' });
  } finally {
    borrando = false;
  }
  pintarDatos();
}

// ---------------- Detalle ----------------
function abrirDetalle(m) {
  let usos = null;
  const url = urlImagen(m.url);
  const dato = (titulo, valor) => `<div class="min-w-0"><dt class="font-label-sm text-label-sm uppercase tracking-wider text-[#94A3B8]">${titulo}</dt><dd class="text-[#0F172A] tnum break-words">${esc(valor)}</dd></div>`;
  modal({
    titulo: nombreDe(m), subtitulo: `Carpeta ${esc(infoCarpeta(carpetaDe(m))[0])}`, icono: 'image', ancho: 'lg',
    botones: `<button type="button" data-borrar-detalle class="btn-peligro-suave">${ico('delete', 'text-[18px]')}Eliminar</button>
      <a href="${esc(url)}" target="_blank" rel="noopener" class="btn-secundario">${ico('open_in_new', 'text-[18px]')}Abrir</a>
      <button type="button" data-cerrar class="btn-primario">Listo</button>`,
    contenido: `<div class="grid sm:grid-cols-2 gap-4">
      <a href="${esc(url)}" target="_blank" rel="noopener" class="block rounded-xl overflow-hidden bg-[#F1F5F9] self-start" title="Abrir en otra pestaña">
        <img src="${esc(url)}" alt="${esc(nombreDe(m))}" class="w-full h-auto max-h-[55vh] object-contain mx-auto"></a>
      <div class="flex flex-col gap-4 min-w-0">
        <dl class="grid grid-cols-2 gap-x-3 gap-y-2.5 font-body-sm text-body-sm">
          ${dato('Dimensiones', m.ancho && m.alto ? `${m.ancho} × ${m.alto} px` : '—')}
          ${dato('Peso', m.bytes ? peso(m.bytes) : '—')}
          ${dato('Formato', (m.tipo || '').replace('image/', '').toUpperCase() || '—')}
          ${dato('Subida', m.creado_en ? fechaHora(m.creado_en) : '—')}
          ${m.autor ? dato('Por', m.autor) : ''}
        </dl>
        <div><label class="etiqueta" for="galUrl">URL pública</label>
          <div class="flex gap-2"><input id="galUrl" class="campo font-mono text-body-sm" readonly value="${esc(url)}">
            <button type="button" data-copiar-detalle class="btn-secundario shrink-0">${ico('content_copy', 'text-[18px]')}Copiar</button></div></div>
        <div><p class="etiqueta">Dónde se usa</p>
          <div data-usos class="flex items-center gap-2 font-body-sm text-body-sm text-[#64748B]">${spinner()}Buscando…</div></div>
      </div></div>`,
    alAbrir: async (capa, cerrar) => {
      $('[data-copiar-detalle]', capa).addEventListener('click', async () => { if (await copiar(url)) toast('URL copiada'); });
      $('[data-borrar-detalle]', capa).addEventListener('click', () => { cerrar(null); eliminar([m], usos); });
      $('#galUrl', capa).addEventListener('focus', (e) => e.target.select());
      try {
        usos = await buscarUsos([m]);
        const u = usos.get(m.id) || [];
        const cont = $('[data-usos]', capa);
        if (!cont) return;
        cont.outerHTML = u.length
          ? `<div class="flex flex-col gap-1">${u.map((x) => `<a href="${esc(x.href)}" class="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-[#F8FAFC] hover:bg-[#F1F5F9] font-label-md text-label-md text-[#0F172A] min-w-0">${ico(x.icono, 'text-[18px] text-primary')}<span class="truncate">${esc(x.texto)}</span></a>`).join('')}</div>`
          : '<p class="font-body-sm text-body-sm text-[#64748B]">No se usa en productos, categorías, banners ni en el logo. Puedes eliminarla sin problema.</p>';
      } catch (e) {
        const cont = $('[data-usos]', capa);
        if (cont) cont.textContent = e.message;
      }
    },
  });
}

// ---------------- Eventos ----------------
contenido.addEventListener('click', async (e) => {
  const chip = e.target.closest('[data-carpeta]');
  if (chip) {
    filtro.carpeta = chip.dataset.carpeta;
    limite = POR_TANDA;
    pintarChips();
    pintarRejilla();
    if (seleccionando) pintarSeleccion();
    return;
  }
  const b = e.target.closest('[data-accion]');
  if (!b || b.disabled) return;
  const m = medios.find((x) => x.id === b.dataset.id);
  switch (b.dataset.accion) {
    case 'ver': if (m) abrirDetalle(m); break;
    case 'marcar':
      if (!m) break;
      if (seleccion.has(m.id)) seleccion.delete(m.id); else seleccion.add(m.id);
      actualizarTarjeta(m.id);
      pintarSeleccion();
      $(`[data-tarjeta="${m.id}"] [data-accion="marcar"]`, contenido)?.focus();
      break;
    case 'copiar': if (m && await copiar(urlImagen(m.url))) toast('URL copiada'); break;
    case 'borrar': if (m) eliminar([m]); break;
    case 'seleccionar':
      seleccionando = !seleccionando;
      seleccion.clear();
      pintarRejilla();
      pintarSeleccion();
      break;
    case 'todas': visibles().forEach((x) => seleccion.add(x.id)); pintarRejilla(); pintarSeleccion(); break;
    case 'ninguna': seleccion.clear(); pintarRejilla(); pintarSeleccion(); break;
    case 'borrar-seleccion': eliminar(medios.filter((x) => seleccion.has(x.id))); break;
    case 'mas': limite += POR_TANDA; pintarRejilla(); break;
    case 'limpiar-filtros': {
      filtro = { q: '', carpeta: '' };
      const buscador = $('[data-buscar]', contenido);
      if (buscador) buscador.value = '';
      limite = POR_TANDA;
      pintarChips();
      pintarRejilla();
      if (seleccionando) pintarSeleccion();
      break;
    }
    case 'recargar': cargar(); break;
    default: break;
  }
});

contenido.addEventListener('change', (e) => {
  const input = e.target.closest('input[data-archivos]');
  if (!input) return;
  encolar(input.files);
  input.value = '';
});

// Arrastrar y soltar en cualquier parte de la página (salvo con un modal abierto).
const velo = document.createElement('div');
velo.className = 'hidden fixed top-16 left-0 lg:left-72 right-0 bottom-0 z-[95] p-4 bg-primary/10 backdrop-blur-[1px] pointer-events-none';
velo.innerHTML = `<div class="w-full h-full rounded-3xl border-4 border-dashed border-primary flex items-center justify-center">
  <div class="bg-white rounded-2xl shadow-nivel3 px-6 py-5 flex flex-col items-center gap-2 text-center">${ico('cloud_upload', 'text-[40px] text-primary')}
    <p class="font-headline-sm text-headline-sm text-[#0F172A]">Suelta para subir</p>
    <p class="font-body-sm text-body-sm text-[#64748B]">Las imágenes se optimizan y se guardan en la galería.</p></div></div>`;
document.body.appendChild(velo);
let arrastres = 0;
const conArchivos = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
const ocultarVelo = () => { arrastres = 0; velo.classList.add('hidden'); };
document.addEventListener('dragenter', (e) => {
  if (!conArchivos(e)) return;
  e.preventDefault();
  arrastres++;
  if (!hayModal() && cargado) velo.classList.remove('hidden');
});
document.addEventListener('dragover', (e) => {
  if (!conArchivos(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = hayModal() || !cargado ? 'none' : 'copy';
});
document.addEventListener('dragleave', (e) => {
  if (!conArchivos(e)) return;
  arrastres = Math.max(0, arrastres - 1);
  if (!arrastres) velo.classList.add('hidden');
});
document.addEventListener('drop', (e) => {
  if (!conArchivos(e)) return;
  e.preventDefault();
  ocultarVelo();
  if (!hayModal()) encolar(e.dataTransfer.files);
});
window.addEventListener('blur', ocultarVelo);

await cargar();
