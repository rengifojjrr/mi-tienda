// Banners & Promos: banners del carrusel de la portada (mt_banners) y promociones automáticas
// o con código (mt_promociones). Mismas reglas que la tienda y la base de datos: un banner se ve
// si está activo y dentro de sus fechas; los descuentos no se acumulan (se aplica el mejor).
import { $, $$, esc, ico, fecha, plantilla, normalizar, copiar, num } from '../util.js';
import { db, urlImagen, ruta } from '../api.js';
import { iniciarPanel, puede, dineroPanel, tienda } from './base.js';
import { modal, confirmar, toast, toastError, vacio, elegirImagenes, leerFormulario } from './ui.js';

await iniciarPanel({ seccion: 'promos', migas: [{ texto: 'Marketing' }, { texto: 'Banners & Promos' }], area: 'catalogo' });
const contenido = $('#contenido');

const MENSAJE_WA = 'Hola {tienda}, quiero conocer las ofertas activas'; // el que usa la tienda si queda vacío
const OTRA_URL = '__url';
const CLAVE_PESTANA = 'mt_promos_pestana';
const CLASE_PRIMARIO = 'flex items-center gap-space-xs px-space-md py-2.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-label-lg text-label-lg shadow-sm transition-all active:scale-95';
const CLASE_SECUNDARIO = 'flex items-center gap-space-xs px-3.5 py-2.5 rounded-xl bg-surface-container-lowest hover:bg-surface-container-low text-on-surface font-label-md text-label-md shadow-sm transition-all';

let pestana = (() => { try { return localStorage.getItem(CLAVE_PESTANA) === 'promos' ? 'promos' : 'banners'; } catch { return 'banners'; } })();
let banners = [];
let promociones = [];
let categorias = [];
let productos = [];
let cargado = false;
let ocupado = false;

// ---------------- Utilidades ----------------
const formatoNumero = (() => {
  try { return new Intl.NumberFormat(tienda().locale || 'es-US', { maximumFractionDigits: 2 }); } catch { return new Intl.NumberFormat('es-US', { maximumFractionDigits: 2 }); }
})();
const simbolo = dineroPanel(0).replace(/[\d\s.,]/g, '') || '$';
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const nombreTienda = () => tienda().nombre || 'MI TIENDA';
/** La tienda y la base comparan las fechas con el día actual en UTC (current_date). */
const hoy = () => new Date().toISOString().slice(0, 10);
const fechaDia = (d, conAnio = true) => (d ? fecha(`${d}T12:00:00`, conAnio ? { day: '2-digit', month: 'short', year: 'numeric' } : { day: '2-digit', month: 'short' }) : '');
function rango(inicio, fin) {
  if (!inicio && !fin) return 'Siempre';
  if (inicio && fin) return `${fechaDia(inicio, inicio.slice(0, 4) !== fin.slice(0, 4))} – ${fechaDia(fin)}`;
  return inicio ? `Desde ${fechaDia(inicio)}` : `Hasta ${fechaDia(fin)}`;
}
/** 'programado' (aún no empieza), 'vencido' (ya terminó) o 'vigente'. */
function vigencia(inicio, fin) {
  const h = hoy();
  if (inicio && inicio > h) return 'programado';
  if (fin && fin < h) return 'vencido';
  return 'vigente';
}
const visibleAhora = (b) => b.activo && vigencia(b.inicio, b.fin) === 'vigente';
const maxOrden = (lista) => lista.reduce((m, x) => Math.max(m, Number(x.orden) || 0), 0);
const decodificar = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
const descuento = (p) => (p.tipo === 'porcentaje' ? `${formatoNumero.format(num(p.valor))}%` : dineroPanel(p.valor));

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

/** Enfoca el primer elemento visible y activo (la tabla y las tarjetas repiten controles). */
function enfocar(...selectores) {
  for (const s of selectores) {
    const el = $$(s, contenido).find((x) => x.offsetParent !== null && !x.disabled);
    if (el) { el.focus(); return true; }
  }
  return false;
}

// Con un modal encima de otro (elegir imagen dentro del banner), Escape cierra sólo el de arriba.
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const capas = $$('.z-\\[110\\]');
  if (capas.length < 2) return;
  e.stopPropagation();
  capas[capas.length - 1].querySelector('[data-cerrar]')?.click();
}, true);

// ---------------- Encabezado y pestañas ----------------
function encabezado() {
  const acciones = pestana === 'banners'
    ? `<a href="${esc(ruta('index.html'))}" target="_blank" rel="noopener" class="${CLASE_SECUNDARIO}">${ico('open_in_new', 'text-[18px] text-on-surface-variant')}<span>Ver portada</span></a>
       <button type="button" data-accion="nuevo-banner" class="${CLASE_PRIMARIO}">${ico('add', 'text-[20px]')}<span>Nuevo banner</span></button>`
    : `<button type="button" data-accion="nueva-promo" class="${CLASE_PRIMARIO}">${ico('add', 'text-[20px]')}<span>Nueva promoción</span></button>`;
  return `<div class="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md">
    <div class="space-y-1">
      <span class="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-bold">Marketing</span>
      <h1 class="font-headline-lg-mobile text-headline-lg-mobile lg:font-headline-lg lg:text-headline-lg text-on-surface tracking-tight">Banners &amp; Promos</h1>
      <p class="font-body-md text-body-md text-on-surface-variant max-w-2xl">Destaca ofertas en la portada de tu tienda y crea descuentos automáticos o con código para compartir.</p>
    </div>
    <div class="flex flex-wrap items-center gap-space-sm">${acciones}</div>
  </div>`;
}

function pestanas() {
  const tab = (id, corto, largo, n, icono) => {
    const activa = pestana === id;
    return `<button type="button" role="tab" id="tab-${id}" aria-controls="panel-pestana" aria-selected="${activa}" data-accion="pestana" data-pestana="${id}"
      class="px-3 sm:px-space-md py-1.5 rounded-lg font-label-md text-label-md whitespace-nowrap transition-all flex items-center gap-1.5 ${activa ? 'bg-surface-container-lowest text-primary font-bold shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}">
      ${ico(icono, 'text-[18px]')}<span class="sm:hidden">${corto}</span><span class="hidden sm:inline">${largo}</span>
      <span class="tnum min-w-5 px-1.5 rounded-full text-[11px] leading-[18px] ${activa ? 'bg-primary/10' : 'bg-surface-container'}">${n}</span></button>`;
  };
  return `<div class="flex items-center bg-surface-container-low p-1 rounded-xl shadow-sm self-start w-fit max-w-full overflow-x-auto no-scrollbar" role="tablist" aria-label="Secciones">
    ${tab('banners', 'Banners', 'Banners de inicio', banners.length, 'view_carousel')}
    ${tab('promos', 'Promociones', 'Promociones y códigos', promociones.length, 'sell')}
  </div>`;
}

function pintar() {
  cargado = true;
  contenido.innerHTML = `${encabezado()}${pestanas()}
    <div id="panel-pestana" role="tabpanel" aria-labelledby="tab-${pestana}">${pestana === 'banners' ? panelBanners() : panelPromos()}</div>`;
}

function pintarError(e) {
  contenido.innerHTML = `${encabezado()}<div class="bg-surface-container-lowest rounded-xl shadow-sm">${vacio({
    icono: 'cloud_off', titulo: 'No se pudieron cargar los datos', texto: esc(e.message),
    accion: '<button type="button" data-accion="recargar" class="btn-primario">Reintentar</button>',
  })}</div>`;
}

function cambiarPestana(id) {
  pestana = id === 'promos' ? 'promos' : 'banners';
  try { localStorage.setItem(CLAVE_PESTANA, pestana); } catch { /* sin almacenamiento */ }
  if (cargado) pintar();
}

// ---------------- Banners: piezas visuales ----------------
/** Descripción legible del enlace del botón. */
function destino(enlace) {
  const e = enlace || 'catalogo.html';
  if (e === 'catalogo.html') return 'Catálogo completo';
  if (e === 'catalogo.html?oferta=1') return 'Ofertas';
  let m = e.match(/^catalogo\.html\?cat=([^&#]+)$/);
  if (m) { const s = decodificar(m[1]); return `Categoría: ${categorias.find((c) => c.slug === s)?.nombre || s}`; }
  m = e.match(/^producto\.html\?p=([^&#]+)$/);
  if (m) { const s = decodificar(m[1]); return `Producto: ${productos.find((p) => p.slug === s)?.nombre || s}`; }
  return e;
}

/** Versión compacta del banner de la portada (mismos colores y estructura) para las tarjetas. */
function heroMini(b) {
  return `<div class="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary via-primary-container to-inverse-surface text-on-primary p-4 h-full min-h-[148px]">
    <div class="absolute -right-10 -top-10 w-36 h-36 rounded-full bg-secondary-fixed/20 blur-2xl pointer-events-none"></div>
    <div class="absolute right-4 bottom-0 w-28 h-28 rounded-full bg-primary-fixed/15 blur-xl pointer-events-none"></div>
    <div class="relative z-10 flex gap-3 h-full">
      <div class="flex-1 min-w-0 flex flex-col gap-1.5">
        ${b.etiqueta ? `<span class="inline-flex items-center gap-1 self-start max-w-full px-2 py-0.5 rounded-full bg-surface-container-lowest/20">${ico('verified', 'text-secondary-fixed text-[14px]', true)}<span class="font-label-sm text-label-sm tracking-wide text-surface-bright uppercase truncate">${esc(b.etiqueta)}</span></span>` : ''}
        <p class="font-headline-sm text-headline-sm text-on-primary line-clamp-2 break-words">${esc(b.titulo)}</p>
        ${b.subtitulo ? `<p class="font-body-sm text-body-sm text-on-primary-container/90 line-clamp-2">${esc(b.subtitulo)}</p>` : ''}
        <div class="flex flex-wrap gap-1.5 mt-auto pt-1">
          ${b.boton_texto ? `<span class="h-7 px-2.5 rounded-md bg-surface-container-lowest text-primary font-label-md text-label-md flex items-center gap-1 max-w-full">${ico('storefront', 'text-[15px]')}<span class="truncate">${esc(b.boton_texto)}</span></span>` : ''}
          ${b.boton_whatsapp ? `<span class="h-7 px-2.5 rounded-md bg-wa text-white font-label-md text-label-md flex items-center gap-1">${ico('chat', 'text-[15px]', true)}WhatsApp</span>` : ''}
        </div>
      </div>
      ${b.imagen_url ? `<div class="relative w-24 sm:w-32 shrink-0 rounded-lg overflow-hidden shadow-md min-h-[104px]"><img src="${esc(urlImagen(b.imagen_url))}" alt="" class="absolute inset-0 w-full h-full object-cover" loading="lazy"></div>` : ''}
    </div></div>`;
}

/** Réplica del banner de la tienda tal como se ve en un celular (mismas clases que tienda/inicio.js). */
function heroMovil(b) {
  const botones = `${b.boton_texto ? `<span class="h-12 px-space-md rounded-lg bg-surface-container-lowest text-primary font-label-lg text-label-lg flex items-center justify-center gap-2 shadow-md">${ico('storefront', 'text-[20px]')}<span class="truncate">${esc(b.boton_texto)}</span></span>` : ''}
    ${b.boton_whatsapp ? `<span class="h-12 px-space-md rounded-lg bg-wa text-white font-label-lg text-label-lg flex items-center justify-center gap-2 shadow-[0_8px_20px_-4px_rgba(37,211,102,0.4)]">${ico('chat', 'text-[20px]', true)}<span>Comprar por WhatsApp</span></span>` : ''}`;
  return `<div class="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary via-primary-container to-inverse-surface text-on-primary p-space-lg shadow-lg w-full">
    <div class="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-secondary-fixed/20 blur-2xl pointer-events-none"></div>
    <div class="absolute right-4 bottom-0 w-36 h-36 rounded-full bg-primary-fixed/15 blur-xl pointer-events-none"></div>
    <div class="relative z-10 flex flex-col gap-space-md">
      <div class="flex flex-col gap-space-md">
        ${b.etiqueta ? `<div class="inline-flex items-center gap-1.5 self-start max-w-full px-2.5 py-1 rounded-full bg-surface-container-lowest/20 backdrop-blur-md">${ico('verified', 'text-secondary-fixed text-[16px]', true)}<span class="font-label-sm text-label-sm tracking-wide text-surface-bright uppercase truncate">${esc(b.etiqueta)}</span></div>` : ''}
        <div class="flex flex-col gap-space-xs">
          <p class="font-headline-lg-mobile text-headline-lg-mobile text-on-primary break-words ${b.titulo ? '' : 'opacity-60'}">${esc(b.titulo || 'Escribe el título del banner')}</p>
          ${b.subtitulo ? `<p class="font-body-sm text-body-sm text-on-primary-container/90 break-words">${esc(b.subtitulo)}</p>` : ''}
        </div>
      </div>
      ${b.imagen_url ? `<div class="relative w-full h-40 rounded-lg overflow-hidden shadow-md">
        <img class="w-full h-full object-cover" src="${esc(urlImagen(b.imagen_url))}" alt="">
        ${b.nota_imagen ? `<div class="absolute inset-0 bg-gradient-to-t from-inverse-surface/80 via-transparent to-transparent flex items-end p-space-sm">
          <span class="font-label-sm text-label-sm text-surface-bright flex items-center gap-1.5"><span class="relative flex w-2 h-2"><span class="absolute inline-flex h-full w-full rounded-full bg-wa opacity-75 animate-ping"></span><span class="relative inline-flex rounded-full w-2 h-2 bg-wa"></span></span>${esc(b.nota_imagen)}</span></div>` : ''}
      </div>` : ''}
      ${b.boton_texto || b.boton_whatsapp ? `<div class="flex flex-col items-stretch gap-space-xs pt-space-xs">${botones}</div>` : ''}
    </div></div>`;
}

function chipVigencia(inicio, fin) {
  const v = vigencia(inicio, fin);
  if (v === 'programado') return `<span class="chip-azul">${ico('event_upcoming', 'text-[14px]')}Programado · ${esc(rango(inicio, fin))}</span>`;
  if (v === 'vencido') return `<span class="chip-rojo">${ico('event_busy', 'text-[14px]')}Vencido · ${esc(fechaDia(fin))}</span>`;
  return `<span class="chip-gris">${ico('event', 'text-[14px]')}${esc(rango(inicio, fin))}</span>`;
}

const boton = (accion, id, icono, titulo, nombre, { deshabilitado = false, peligro = false } = {}) => `<button type="button" data-accion="${accion}" data-id="${esc(id)}" ${deshabilitado ? 'disabled' : ''}
  class="btn-icono w-8 h-8 ${peligro ? 'hover:text-error hover:bg-error-container/40' : 'hover:text-primary'}" title="${titulo}" aria-label="${titulo}: ${nombre}">${ico(icono, 'text-[18px]')}</button>`;

function tarjetaBanner(b, i) {
  const ahora = visibleAhora(b);
  const nombre = esc(b.titulo);
  return `<article class="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col md:flex-row">
    <div class="p-3 md:w-[22rem] xl:w-[26rem] shrink-0 transition-opacity ${b.activo ? '' : 'opacity-60'}">${heroMini(b)}</div>
    <div class="flex-1 min-w-0 px-3 pb-3 md:pt-3 md:pl-1 flex flex-col gap-3">
      <div class="flex flex-wrap items-center gap-1.5">
        ${b.activo ? `<span class="chip-verde">${ico('check_circle', 'text-[14px]')}Activo</span>` : `<span class="chip-gris">${ico('pause_circle', 'text-[14px]')}Inactivo</span>`}
        ${chipVigencia(b.inicio, b.fin)}
        ${b.ejemplo ? '<span class="chip-violeta">Ejemplo</span>' : ''}
      </div>
      <ul class="flex flex-col gap-1.5 font-body-sm text-body-sm text-on-surface-variant">
        <li class="flex items-center gap-2 ${ahora ? 'text-secondary font-semibold' : ''}"><span class="w-2 h-2 rounded-full shrink-0 ${ahora ? 'bg-secondary' : 'bg-outline-variant'}"></span>${ahora ? 'Se muestra ahora en la portada' : 'No se muestra en la portada'}</li>
        <li class="flex items-center gap-1.5 min-w-0">${ico('link', 'text-[16px] text-outline')}<span class="truncate">${b.boton_texto ? `“${esc(b.boton_texto)}” → ${esc(destino(b.boton_enlace))}` : 'Sin botón principal'}</span></li>
        <li class="flex items-center gap-1.5 min-w-0">${ico('chat', 'text-[16px] text-outline')}<span class="truncate">${b.boton_whatsapp ? 'Con botón “Comprar por WhatsApp”' : 'Sin botón de WhatsApp'}</span></li>
      </ul>
      <div class="mt-auto flex items-center justify-between gap-2 pt-3 border-t border-surface-container">
        <label class="flex items-center gap-2 font-label-md text-label-md text-on-surface-variant cursor-pointer">
          <input type="checkbox" class="interruptor" data-activo-banner="${esc(b.id)}" ${b.activo ? 'checked' : ''} aria-label="Banner activo: ${nombre}">Activo</label>
        <div class="flex items-center">
          <span class="font-label-md text-label-md text-outline tnum mr-1" title="Posición en el carrusel">#${i + 1}</span>
          ${boton('subir-banner', b.id, 'arrow_upward', 'Subir', nombre, { deshabilitado: i === 0 })}
          ${boton('bajar-banner', b.id, 'arrow_downward', 'Bajar', nombre, { deshabilitado: i === banners.length - 1 })}
          <span class="w-px h-5 bg-surface-container-high mx-1" aria-hidden="true"></span>
          ${boton('editar-banner', b.id, 'edit', 'Editar', nombre)}
          ${boton('duplicar-banner', b.id, 'content_copy', 'Duplicar', nombre)}
          ${boton('borrar-banner', b.id, 'delete', 'Eliminar', nombre, { peligro: true })}
        </div>
      </div>
    </div></article>`;
}

function panelBanners() {
  const visibles = banners.filter(visibleAhora).length;
  return `<div class="flex flex-col gap-space-md">
    <div class="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 rounded-xl bg-surface-container-low">
      ${ico('info', 'text-[22px] text-primary')}
      <p class="flex-1 font-body-sm text-body-sm text-on-surface-variant">Sólo los banners <strong class="text-on-surface">activos y dentro de sus fechas</strong> se muestran en la portada.
        Si hay varios, rotan en un carrusel en el orden de esta lista. Si no hay ninguno, la tienda muestra un saludo con el nombre y el eslogan.</p>
      <span class="${visibles ? 'chip-verde' : 'chip-gris'} shrink-0 self-start sm:self-auto">${visibles} de ${banners.length} en la portada</span>
    </div>
    ${banners.length ? `<div class="flex flex-col gap-space-md">${banners.map(tarjetaBanner).join('')}</div>`
      : `<div class="bg-surface-container-lowest rounded-xl shadow-sm">${vacio({
        icono: 'view_carousel', titulo: 'Aún no hay banners',
        texto: 'Crea uno para destacar una oferta, una temporada o el envío gratis en la portada de tu tienda.',
        accion: `<button type="button" data-accion="nuevo-banner" class="btn-primario">${ico('add', 'text-[18px]')}Nuevo banner</button>`,
      })}</div>`}
  </div>`;
}

// ---------------- Banners: acciones ----------------
async function alternarBanner(input) {
  const b = banners.find((x) => x.id === input.dataset.activoBanner);
  if (!b) return;
  const activo = input.checked;
  input.disabled = true;
  try {
    await db.actualizar('mt_banners', `id=eq.${b.id}`, { activo });
    b.activo = activo;
    toast(!activo ? 'Banner desactivado: ya no se muestra en la portada'
      : visibleAhora(b) ? 'Banner activo: ya se muestra en la portada' : 'Banner activo: se mostrará según sus fechas', { tipo: activo ? 'ok' : 'info' });
  } catch (e) { toastError(e); }
  pintar();
  enfocar(`[data-activo-banner="${b.id}"]`);
}

/** Sube o baja un banner en el carrusel. Si hay valores de orden repetidos se renumera la lista. */
async function moverBanner(id, paso) {
  if (ocupado) return;
  const i = banners.findIndex((x) => x.id === id);
  const j = i + paso;
  if (i < 0 || j < 0 || j >= banners.length) return;
  const nueva = [...banners];
  [nueva[i], nueva[j]] = [nueva[j], nueva[i]];
  const repetidos = new Set(banners.map((x) => x.orden)).size !== banners.length;
  const cambios = repetidos
    ? nueva.map((x, k) => [x, k + 1]).filter(([x, o]) => x.orden !== o)
    : [[banners[i], banners[j].orden], [banners[j], banners[i].orden]];
  ocupado = true;
  try {
    await Promise.all(cambios.map(([x, o]) => db.actualizar('mt_banners', `id=eq.${x.id}`, { orden: o })));
    cambios.forEach(([x, o]) => { x.orden = o; });
    banners = nueva;
    pintar();
    const [a, b] = paso < 0 ? ['subir-banner', 'bajar-banner'] : ['bajar-banner', 'subir-banner'];
    enfocar(`[data-accion="${a}"][data-id="${id}"]`, `[data-accion="${b}"][data-id="${id}"]`);
  } catch (e) {
    toastError(e);
    await cargar();
  } finally {
    ocupado = false;
  }
}

async function duplicarBanner(b) {
  const copia = { ...b, titulo: `${b.titulo} (copia)`.slice(0, 120), activo: false, ejemplo: false, orden: maxOrden(banners) + 1 };
  delete copia.id;
  delete copia.creado_en;
  try {
    await db.crear('mt_banners', [copia]);
    toast('Copia creada como inactiva: edítala y actívala cuando esté lista.', { tipo: 'info' });
    await cargar();
  } catch (e) { toastError(e); }
}

async function borrarBanner(b) {
  const ok = await confirmar({
    titulo: '¿Eliminar este banner?', peligro: true, icono: 'delete', boton: 'Eliminar banner',
    mensaje: `<strong class="text-[#0F172A]">“${esc(b.titulo)}”</strong> dejará de mostrarse en la portada. La imagen seguirá en tu galería.
      <span class="block mt-1.5">Si sólo quieres pausarlo, mejor desactívalo. Esta acción no se puede deshacer.</span>`,
  });
  if (!ok) return;
  try {
    const r = await db.borrar('mt_banners', `id=eq.${b.id}`);
    if (Array.isArray(r) && !r.length) throw new Error('No se pudo eliminar: el banner ya no existe o no tienes permiso.');
    toast('Banner eliminado');
  } catch (e) { toastError(e); }
  await cargar();
}

// ---------------- Banners: formulario ----------------
function gruposEnlace() {
  return [
    { grupo: 'Páginas', items: [['catalogo.html', 'Catálogo completo'], ['catalogo.html?oferta=1', 'Ofertas']] },
    { grupo: 'Categorías', items: categorias.map((c) => [`catalogo.html?cat=${c.slug}`, c.visible ? c.nombre : `${c.nombre} (oculta)`]) },
    { grupo: 'Productos publicados', items: productos.map((p) => [`producto.html?p=${p.slug}`, p.nombre]) },
  ].filter((g) => g.items.length);
}

function selectEnlace(actual, grupos, conocido) {
  return `<select id="banEnlace" name="enlace" class="campo">
    ${grupos.map((g) => `<optgroup label="${esc(g.grupo)}">${g.items.map(([v, t]) => `<option value="${esc(v)}" ${v === actual ? 'selected' : ''}>${esc(t)}</option>`).join('')}</optgroup>`).join('')}
    <option value="${OTRA_URL}" ${conocido ? '' : 'selected'}>URL personalizada…</option></select>`;
}

const filaInterruptor = (nombre, titulo, ayuda, activo) => `<label class="flex items-center justify-between gap-3 cursor-pointer">
    <span class="min-w-0"><span class="block font-label-lg text-label-lg text-[#0F172A]">${titulo}</span><span class="block font-body-sm text-body-sm text-[#64748B]">${ayuda}</span></span>
    <input type="checkbox" name="${nombre}" class="interruptor" ${activo ? 'checked' : ''}></label>`;

const burbujaWhatsApp = (texto) => `<div class="rounded-xl bg-[#EFEAE2] p-2.5 flex flex-col gap-1">
    <p class="font-label-sm text-label-sm text-[#54656F] flex items-center gap-1">${ico('chat', 'text-[14px] text-wa-tinta', true)}Mensaje que te llegará por WhatsApp</p>
    <div class="ml-auto max-w-[92%] w-fit rounded-lg rounded-tr-none bg-wa-burbuja px-2.5 py-1.5 font-body-sm text-body-sm text-[#111B21] shadow-sm break-words">${esc(texto)}</div></div>`;

function textoPublicacion(d) {
  if (d.inicio && d.fin && d.inicio > d.fin) return '<span class="text-error">La fecha “desde” es posterior a “hasta”.</span>';
  if (!d.activo) return 'Inactivo: se guarda sin mostrarse en la tienda.';
  const v = vigencia(d.inicio || null, d.fin || null);
  if (v === 'programado') return `Programado: se mostrará desde el ${esc(fechaDia(d.inicio))}${d.fin ? ` hasta el ${esc(fechaDia(d.fin))}` : ''}.`;
  if (v === 'vencido') return '<span class="text-error">La fecha “hasta” ya pasó: no se mostrará.</span>';
  return d.fin ? `Se muestra desde ya y hasta el ${esc(fechaDia(d.fin))} (incluido).` : 'Se muestra desde ya, sin fecha de fin.';
}

function htmlFormBanner(b, grupos) {
  const actual = b.boton_enlace || 'catalogo.html';
  const conocido = grupos.some((g) => g.items.some(([v]) => v === actual));
  const sinWhatsApp = !tienda().whatsapp;
  return `<div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
    <div class="flex flex-col gap-4 min-w-0">
      <div><label class="etiqueta" for="banTitulo">Título *</label>
        <input id="banTitulo" name="titulo" class="campo" maxlength="120" required autofocus autocomplete="off" value="${esc(b.titulo || '')}" placeholder="Ej.: Envío gratis en compras desde $150"></div>
      <div class="grid sm:grid-cols-2 gap-3">
        <div><label class="etiqueta" for="banEtiqueta">Etiqueta</label>
          <input id="banEtiqueta" name="etiqueta" class="campo" maxlength="60" autocomplete="off" value="${esc(b.etiqueta || '')}" placeholder="Ej.: Temporada 2026 • Oficial">
          <p class="ayuda">Texto corto que va sobre el título.</p></div>
        <div><label class="etiqueta" for="banNota">Nota sobre la imagen</label>
          <input id="banNota" name="nota_imagen" class="campo" maxlength="80" autocomplete="off" value="${esc(b.nota_imagen || '')}" placeholder="Ej.: Stock listo para despacho">
          <p class="ayuda">Aparece en la parte baja de la imagen.</p></div>
      </div>
      <div><label class="etiqueta" for="banSub">Subtítulo</label>
        <textarea id="banSub" name="subtitulo" class="campo" rows="2" maxlength="240" placeholder="Ej.: Arma tu pedido, envíalo por WhatsApp y te lo despachamos el mismo día.">${esc(b.subtitulo || '')}</textarea>
        <p class="ayuda text-right tnum" data-cuenta-sub></p></div>
      <div><span class="etiqueta">Imagen</span>
        <div class="flex items-center gap-3">
          <div data-img-vista class="w-24 h-16 rounded-lg overflow-hidden bg-[#F1F5F9] flex items-center justify-center shrink-0"></div>
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button type="button" data-elegir-img class="btn-secundario btn-sm">${ico('photo_library', 'text-[16px]')}<span data-txt-img></span></button>
            <button type="button" data-quitar-img class="font-label-md text-label-md text-error hover:underline px-1">Quitar</button>
          </div></div>
        <p class="ayuda">Opcional. Mejor una foto horizontal (por ejemplo 1400 × 900 px).</p></div>
      <fieldset class="flex flex-col gap-3 p-3.5 rounded-xl border border-[#E2E8F0] min-w-0">
        <legend class="px-1 font-label-md text-label-md text-[#334155]">Botón principal</legend>
        <div class="grid sm:grid-cols-2 gap-3">
          <div><label class="etiqueta" for="banBoton">Texto del botón</label>
            <input id="banBoton" name="boton_texto" class="campo" maxlength="40" autocomplete="off" value="${esc(b.boton_texto || '')}" placeholder="Ej.: Explorar Catálogo">
            <p class="ayuda">Déjalo vacío para no mostrar el botón.</p></div>
          <div class="min-w-0"><label class="etiqueta" for="banEnlace">Enlace del botón</label>${selectEnlace(actual, grupos, conocido)}</div>
        </div>
        <div data-bloque-url class="${conocido ? 'hidden' : ''}"><label class="etiqueta" for="banUrl">URL personalizada</label>
          <input id="banUrl" name="enlace_url" class="campo font-mono" maxlength="300" autocomplete="off" autocapitalize="off" spellcheck="false" value="${conocido ? '' : esc(actual)}" placeholder="https://… o soporte.html">
          <p class="ayuda">Una dirección completa (https://…) o una página de tu tienda, como soporte.html.</p></div>
      </fieldset>
      <fieldset class="flex flex-col gap-3 p-3.5 rounded-xl border border-[#E2E8F0] min-w-0">
        <legend class="px-1 font-label-md text-label-md text-[#334155]">WhatsApp</legend>
        ${filaInterruptor('boton_whatsapp', 'Mostrar botón “Comprar por WhatsApp”', 'Abre un chat con tu tienda con el mensaje de abajo ya escrito.', b.boton_whatsapp)}
        <div data-bloque-wa class="${b.boton_whatsapp ? '' : 'hidden'}">
          <div class="flex items-center justify-between gap-2 mb-1.5"><label class="etiqueta mb-0" for="banMsg">Mensaje</label>
            <button type="button" data-insertar-tienda class="font-label-md text-label-md text-primary hover:underline">Insertar {tienda}</button></div>
          <textarea id="banMsg" name="mensaje_whatsapp" class="campo" rows="2" maxlength="300">${esc(b.mensaje_whatsapp || '')}</textarea>
          <p class="ayuda">Escribe <code class="font-mono text-[#0F172A]">{tienda}</code> y se reemplaza por el nombre de tu tienda (${esc(nombreTienda())}). Si lo dejas vacío se usa “${esc(MENSAJE_WA)}”.</p>
          ${sinWhatsApp ? `<p class="mt-2 px-3 py-2 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] font-body-sm text-body-sm">Aún no configuraste el número de WhatsApp de la tienda: este botón no funcionará hasta hacerlo.${puede('config') ? ' <a href="configuracion.html#whatsapp" class="font-semibold underline">Configurar ahora</a>' : ''}</p>` : ''}
        </div>
      </fieldset>
      <fieldset class="flex flex-col gap-3 p-3.5 rounded-xl border border-[#E2E8F0] min-w-0">
        <legend class="px-1 font-label-md text-label-md text-[#334155]">Publicación</legend>
        ${filaInterruptor('activo', 'Activo', 'Apágalo para guardarlo sin mostrarlo en la tienda.', b.activo)}
        <div class="grid grid-cols-2 gap-3">
          <div><label class="etiqueta" for="banInicio">Desde</label><input id="banInicio" name="inicio" type="date" class="campo" value="${esc(b.inicio || '')}"></div>
          <div><label class="etiqueta" for="banFin">Hasta</label><input id="banFin" name="fin" type="date" class="campo" value="${esc(b.fin || '')}"></div>
        </div>
        <p class="ayuda mt-0" data-estado-pub></p>
      </fieldset>
    </div>
    <div class="min-w-0 order-first lg:order-none">
      <div class="lg:sticky lg:top-0 flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2"><span class="etiqueta mb-0">Vista previa</span>
          <span class="font-label-sm text-label-sm text-outline flex items-center gap-1">${ico('smartphone', 'text-[14px]')}Así se ve en un celular</span></div>
        <div data-vista class="rounded-2xl bg-surface p-2.5 border border-[#E2E8F0]"></div>
        <div data-burbuja></div>
        <p class="ayuda mt-0">Si hay varios banners vigentes, rotan cada pocos segundos en un carrusel.</p>
      </div>
    </div>
  </div>`;
}

async function formularioBanner(original = null) {
  const nuevo = !original;
  const b = original ? { ...original } : {
    etiqueta: '', titulo: '', subtitulo: '', imagen_url: '', nota_imagen: '', boton_texto: 'Explorar Catálogo', boton_enlace: 'catalogo.html',
    boton_whatsapp: true, mensaje_whatsapp: MENSAJE_WA, activo: true, inicio: null, fin: null,
  };
  let imagen = b.imagen_url || '';
  const grupos = gruposEnlace();
  const r = await modal({
    titulo: nuevo ? 'Nuevo banner' : 'Editar banner', subtitulo: 'Aparece en el carrusel de la portada de tu tienda.',
    icono: 'view_carousel', ancho: 'xl', textoEnviar: nuevo ? 'Crear banner' : 'Guardar cambios',
    contenido: htmlFormBanner(b, grupos),
    alAbrir: (capa) => {
      const form = $('form', capa);
      const el = form.elements;
      const pintarImagen = () => {
        $('[data-img-vista]', capa).innerHTML = imagen
          ? `<img src="${esc(urlImagen(imagen))}" alt="" class="w-full h-full object-cover">`
          : ico('hide_image', 'text-[24px] text-[#94A3B8]');
        $('[data-txt-img]', capa).textContent = imagen ? 'Cambiar imagen' : 'Elegir imagen';
        $('[data-quitar-img]', capa).classList.toggle('hidden', !imagen);
      };
      const refrescar = () => {
        const d = leerFormulario(form);
        $('[data-bloque-url]', capa).classList.toggle('hidden', d.enlace !== OTRA_URL);
        $('[data-bloque-wa]', capa).classList.toggle('hidden', !d.boton_whatsapp);
        $('[data-cuenta-sub]', capa).textContent = `${d.subtitulo.length}/240`;
        $('[data-vista]', capa).innerHTML = heroMovil({ ...d, imagen_url: imagen });
        $('[data-burbuja]', capa).innerHTML = d.boton_whatsapp ? burbujaWhatsApp(plantilla(d.mensaje_whatsapp || MENSAJE_WA, { tienda: nombreTienda() })) : '';
        $('[data-estado-pub]', capa).innerHTML = textoPublicacion(d);
      };
      form.addEventListener('input', refrescar);
      form.addEventListener('change', refrescar);
      el.enlace.addEventListener('change', () => { if (el.enlace.value === OTRA_URL) setTimeout(() => el.enlace_url.focus(), 0); });
      $('[data-elegir-img]', capa).addEventListener('click', async () => {
        const elegidas = await elegirImagenes({ carpeta: 'banners', titulo: 'Imagen del banner' });
        if (elegidas?.length) { imagen = elegidas[0].url; pintarImagen(); refrescar(); }
      });
      $('[data-quitar-img]', capa).addEventListener('click', () => { imagen = ''; pintarImagen(); refrescar(); });
      // Se inserta donde estaba el cursor; si nunca se tocó el mensaje, al final.
      let mensajeTocado = false;
      el.mensaje_whatsapp.addEventListener('focus', () => { mensajeTocado = true; });
      $('[data-insertar-tienda]', capa).addEventListener('click', () => {
        const t = el.mensaje_whatsapp;
        if (mensajeTocado && t.selectionStart != null) t.setRangeText('{tienda}', t.selectionStart, t.selectionEnd ?? t.selectionStart, 'end');
        else t.value = `${t.value}${t.value && !/\s$/.test(t.value) ? ' ' : ''}{tienda}`;
        t.focus();
        refrescar();
      });
      pintarImagen();
      refrescar();
    },
    alEnviar: async (form) => {
      const d = leerFormulario(form);
      if (!d.titulo) throw new Error('Escribe el título del banner.');
      if (d.titulo.length > 120) throw new Error('El título puede tener hasta 120 caracteres.');
      if (d.subtitulo.length > 240) throw new Error('El subtítulo puede tener hasta 240 caracteres.');
      if (d.mensaje_whatsapp.length > 300) throw new Error('El mensaje de WhatsApp puede tener hasta 300 caracteres.');
      let enlace = d.enlace;
      if (enlace === OTRA_URL) {
        enlace = d.enlace_url.replace(/^\/+/, '');
        if (/^(www\.|wa\.me\/)/i.test(enlace)) enlace = `https://${enlace}`;
        if (!enlace) throw new Error('Escribe la URL personalizada del botón (o elige un destino de la lista).');
        if (/\s/.test(enlace)) throw new Error('La URL del botón no puede tener espacios.');
        if (/^[a-z][a-z0-9+.-]*:/i.test(enlace) && !/^https?:\/\/[^/\s]+/i.test(enlace)) {
          throw new Error('Usa una dirección que empiece con https:// o una página de tu tienda (por ejemplo soporte.html).');
        }
        if (enlace.length > 300) throw new Error('La URL del botón puede tener hasta 300 caracteres.');
      }
      if (d.inicio && d.fin && d.inicio > d.fin) throw new Error('La fecha “desde” debe ser anterior o igual a “hasta”.');
      const fila = {
        etiqueta: d.etiqueta || null, titulo: d.titulo, subtitulo: d.subtitulo || null, imagen_url: imagen || null,
        nota_imagen: d.nota_imagen || null, boton_texto: d.boton_texto || null, boton_enlace: enlace || 'catalogo.html',
        boton_whatsapp: d.boton_whatsapp, mensaje_whatsapp: d.mensaje_whatsapp || null, activo: d.activo,
        inicio: d.inicio || null, fin: d.fin || null,
      };
      if (nuevo) {
        fila.orden = maxOrden(banners) + 1;
        await db.crear('mt_banners', [fila]);
      } else {
        await db.actualizar('mt_banners', `id=eq.${original.id}`, fila);
      }
      return fila;
    },
  });
  if (!r) return;
  toast(nuevo ? 'Banner creado' : 'Banner actualizado');
  await cargar();
}

// ---------------- Promociones: piezas visuales ----------------
function estadoPromo(p) {
  if (!p.activa) return { texto: 'Pausada', clase: 'chip-gris' };
  const v = vigencia(p.inicio, p.fin);
  if (v === 'programado') return { texto: 'Programada', clase: 'chip-azul' };
  if (v === 'vencido') return { texto: 'Vencida', clase: 'chip-rojo' };
  if (p.codigo && p.max_usos != null && num(p.usos) >= p.max_usos) return { texto: 'Agotada', clase: 'chip-ambar' };
  return { texto: 'Vigente', clase: 'chip-verde' };
}

const aplicacion = (p) => (p.codigo
  ? `<button type="button" data-accion="copiar-codigo" data-codigo="${esc(p.codigo)}" class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-container-high text-on-surface font-mono text-[13px] leading-4 font-semibold tracking-wide hover:bg-surface-container-highest transition-colors" title="Copiar código">${esc(p.codigo)}${ico('content_copy', 'text-[14px] text-outline')}</button>`
  : `<span class="chip-violeta">${ico('bolt', 'text-[14px]')}Automática</span>`);

const minimo = (p) => (num(p.minimo_compra) > 0 ? esc(dineroPanel(p.minimo_compra)) : '<span class="text-outline">Sin mínimo</span>');

function usos(p) {
  if (!p.codigo) return '<span class="text-outline" title="Las promociones automáticas no cuentan usos">—</span>';
  const n = num(p.usos);
  if (p.max_usos == null) return `<span class="tnum">${n} <span class="text-outline">/ ∞</span></span>`;
  const pct = Math.min(100, Math.round((n / p.max_usos) * 100));
  return `<div class="min-w-[76px]"><span class="tnum">${n} <span class="text-outline">/ ${p.max_usos}</span></span>
    <div class="w-full h-1.5 bg-surface-container rounded-full overflow-hidden mt-1"><div class="h-full rounded-full ${pct >= 100 ? 'bg-error' : pct >= 80 ? 'bg-[#F59E0B]' : 'bg-primary'}" style="width:${pct}%"></div></div></div>`;
}

const interruptorPromo = (p, clases = '') => `<input type="checkbox" class="interruptor ${clases}" data-activa-promo="${esc(p.id)}" ${p.activa ? 'checked' : ''} aria-label="Promoción activa: ${esc(p.nombre)}">`;

const accionesPromo = (p) => `<div class="flex items-center justify-end gap-0.5">
    ${boton('editar-promo', p.id, 'edit', 'Editar', esc(p.nombre))}
    ${boton('borrar-promo', p.id, 'delete', 'Eliminar', esc(p.nombre), { peligro: true })}</div>`;

function tablaPromos() {
  return `<div class="hidden xl:block bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden"><div class="overflow-x-auto">
    <table class="tabla"><thead><tr>
      <th>Promoción</th><th>Aplicación</th><th class="text-right">Descuento</th><th class="text-right">Mín. de compra</th>
      <th>Vigencia</th><th>Usos</th><th class="text-center">Activa</th><th class="text-right"><span class="sr-only">Acciones</span></th></tr></thead>
    <tbody>${promociones.map((p) => {
      const e = estadoPromo(p);
      return `<tr>
        <td><div class="min-w-[170px]"><p class="font-label-lg text-label-lg text-on-surface">${esc(p.nombre)}</p>
          <div class="mt-1 flex items-center gap-1.5 flex-wrap"><span class="${e.clase}">${e.texto}</span>${p.ejemplo ? '<span class="chip-violeta">Ejemplo</span>' : ''}</div></div></td>
        <td class="whitespace-nowrap">${aplicacion(p)}</td>
        <td class="text-right whitespace-nowrap font-label-lg text-label-lg text-on-surface tnum">${esc(descuento(p))}</td>
        <td class="text-right whitespace-nowrap tnum">${minimo(p)}</td>
        <td class="whitespace-nowrap">${esc(rango(p.inicio, p.fin))}</td>
        <td>${usos(p)}</td>
        <td class="text-center">${interruptorPromo(p, 'align-middle')}</td>
        <td class="text-right whitespace-nowrap">${accionesPromo(p)}</td></tr>`;
    }).join('')}</tbody></table></div></div>`;
}

function tarjetasPromos() {
  const dato = (titulo, valor) => `<div class="min-w-0"><dt class="font-label-sm text-label-sm uppercase tracking-wider text-outline">${titulo}</dt><dd class="text-on-surface mt-0.5">${valor}</dd></div>`;
  return `<div class="xl:hidden grid grid-cols-1 md:grid-cols-2 gap-3">${promociones.map((p) => {
    const e = estadoPromo(p);
    return `<div class="bg-surface-container-lowest rounded-xl shadow-sm p-4 flex flex-col gap-3">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0"><p class="font-label-lg text-label-lg text-on-surface">${esc(p.nombre)}</p>
          <div class="mt-1 flex items-center gap-1.5 flex-wrap"><span class="${e.clase}">${e.texto}</span>${p.ejemplo ? '<span class="chip-violeta">Ejemplo</span>' : ''}</div></div>
        ${interruptorPromo(p, 'mt-0.5')}
      </div>
      <div class="flex items-center justify-between gap-3">${aplicacion(p)}<span class="font-headline-md text-headline-md text-primary tnum">${esc(descuento(p))}</span></div>
      <dl class="grid grid-cols-3 gap-2 font-body-sm text-body-sm">${dato('Mínimo', minimo(p))}${dato('Vigencia', esc(rango(p.inicio, p.fin)))}${dato('Usos', usos(p))}</dl>
      <div class="mt-auto pt-2 border-t border-surface-container">${accionesPromo(p)}</div>
    </div>`;
  }).join('')}</div>`;
}

function tarjetaEnvio() {
  const eg = tienda().envio_gratis_desde;
  const hay = eg !== null && eg !== undefined && eg !== '';
  const titulo = !hay ? 'Sin envío gratis por monto' : num(eg) <= 0 ? 'Envío gratis en todos los pedidos' : `Envío gratis desde ${dineroPanel(eg)}`;
  return `<div class="bg-surface-container-lowest rounded-xl shadow-sm p-space-md flex flex-col gap-2">
    <div class="flex items-start justify-between gap-2"><span class="font-label-sm text-label-sm uppercase tracking-wider text-outline">Envío gratis</span>
      <div class="w-8 h-8 rounded-lg bg-secondary-container/40 text-on-secondary-container flex items-center justify-center shrink-0">${ico('local_shipping', 'text-[18px]')}</div></div>
    <p class="font-headline-sm text-headline-sm text-on-surface">${esc(titulo)}</p>
    <p class="font-body-sm text-body-sm text-on-surface-variant">${hay && num(eg) > 0 ? 'Se calcula con el subtotal del pedido después del descuento.' : 'Puedes ofrecerlo a partir de un monto de compra.'}</p>
    ${puede('config') ? `<a href="configuracion.html#envios" class="mt-auto font-label-md text-label-md text-primary font-semibold hover:underline inline-flex items-center gap-1">Cambiar en Configuración ${ico('arrow_forward', 'text-[14px]')}</a>`
      : '<p class="mt-auto font-label-sm text-label-sm text-outline">Lo cambia el dueño o un administrador en Configuración.</p>'}
  </div>`;
}

function panelPromos() {
  return `<div class="flex flex-col gap-space-md">
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-space-md">
      <div class="lg:col-span-2 bg-surface-container-lowest rounded-xl shadow-sm p-space-md flex gap-3">
        <div class="w-10 h-10 rounded-xl bg-tertiary-fixed text-on-tertiary-fixed-variant flex items-center justify-center shrink-0">${ico('lightbulb', 'text-[22px]')}</div>
        <div class="min-w-0"><p class="font-label-lg text-label-lg text-on-surface">Cómo se aplican los descuentos</p>
          <ul class="mt-1.5 space-y-1 font-body-sm text-body-sm text-on-surface-variant list-disc pl-4">
            <li><strong class="text-on-surface">No se acumulan:</strong> en cada pedido la tienda aplica sólo el mejor descuento vigente.</li>
            <li><strong class="text-on-surface">Automáticas:</strong> se aplican solas cuando el pedido llega al mínimo de compra.</li>
            <li><strong class="text-on-surface">Con código:</strong> el cliente lo escribe en “Mi Pedido”; cada pedido enviado con el código cuenta un uso.</li>
            <li>Las fechas incluyen el día de inicio y el de fin.</li>
          </ul></div>
      </div>
      ${tarjetaEnvio()}
    </div>
    ${promociones.length ? `${tablaPromos()}${tarjetasPromos()}`
      : `<div class="bg-surface-container-lowest rounded-xl shadow-sm">${vacio({
        icono: 'sell', titulo: 'Aún no hay promociones',
        texto: 'Crea un descuento automático (por ejemplo 10% en compras desde $100) o un código para compartir en tus redes.',
        accion: `<button type="button" data-accion="nueva-promo" class="btn-primario">${ico('add', 'text-[18px]')}Nueva promoción</button>`,
      })}</div>`}
  </div>`;
}

// ---------------- Promociones: acciones ----------------
async function alternarPromo(input) {
  const p = promociones.find((x) => x.id === input.dataset.activaPromo);
  if (!p) return;
  const activa = input.checked;
  input.disabled = true;
  try {
    await db.actualizar('mt_promociones', `id=eq.${p.id}`, { activa });
    p.activa = activa;
    toast(activa ? `“${p.nombre}” activada` : `“${p.nombre}” pausada: no se aplica en pedidos nuevos`, { tipo: activa ? 'ok' : 'info' });
  } catch (e) { toastError(e); }
  pintar();
  enfocar(`[data-activa-promo="${p.id}"]`);
}

async function borrarPromo(p) {
  const ok = await confirmar({
    titulo: '¿Eliminar esta promoción?', peligro: true, icono: 'delete', boton: 'Eliminar promoción',
    mensaje: `<strong class="text-[#0F172A]">“${esc(p.nombre)}”</strong>${p.codigo ? ` (código <span class="font-mono font-semibold">${esc(p.codigo)}</span>)` : ''} dejará de aplicarse en los pedidos nuevos; los anteriores conservan su descuento.
      <span class="block mt-1.5">Si sólo quieres detenerla, mejor desactívala. Esta acción no se puede deshacer.</span>`,
  });
  if (!ok) return;
  try {
    const r = await db.borrar('mt_promociones', `id=eq.${p.id}`);
    if (Array.isArray(r) && !r.length) throw new Error('No se pudo eliminar: la promoción ya no existe o no tienes permiso.');
    toast('Promoción eliminada');
  } catch (e) { toastError(e); }
  await cargar();
}

// ---------------- Promociones: formulario ----------------
function generarCodigo() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...crypto.getRandomValues(new Uint8Array(8))].map((n) => letras[n % letras.length]).join('');
}

function ejemploPromo(d) {
  const icono = ico('calculate', 'text-[18px] text-primary');
  const valor = num(d.valor);
  if (!(valor > 0)) return `${icono}<span>Escribe el valor del descuento para ver un ejemplo.</span>`;
  const min = Math.max(0, num(d.minimo_compra));
  const subtotal = min > 0 ? min : 100;
  const ahorro = d.tipo === 'monto' ? Math.min(valor, subtotal) : Math.round(subtotal * Math.min(valor, 90)) / 100;
  const eg = tienda().envio_gratis_desde;
  const envioGratis = eg !== null && eg !== undefined && eg !== '' && subtotal - ahorro >= num(eg);
  const extra = d.aplicacion === 'codigo'
    ? ` Sólo si escribe el código${d.codigo ? ` <span class="font-mono font-semibold">${esc(d.codigo)}</span>` : ''} en “Mi Pedido”.`
    : min > 0 ? ' Se aplica sola, sin código.' : ' <strong>Ojo:</strong> al ser automática y sin mínimo, se aplica a todos los pedidos.';
  return `${icono}<span>Ejemplo: en un pedido de <strong>${esc(dineroPanel(subtotal))}</strong>${min > 0 ? ' (el mínimo)' : ''} el cliente ahorra
    <strong>${esc(dineroPanel(ahorro))}</strong> y paga ${esc(dineroPanel(subtotal - ahorro))}${envioGratis ? ' con envío gratis' : ''}.${extra}</span>`;
}

function htmlFormPromo(p, conCodigo, nuevo) {
  const tarjetaRadio = (valor, marcado, icono, titulo, texto) => `<label class="block cursor-pointer">
      <input type="radio" name="aplicacion" value="${valor}" class="peer sr-only" ${marcado ? 'checked' : ''}>
      <span class="flex items-start gap-2.5 h-full p-3 rounded-xl border border-[#E2E8F0] bg-white transition-colors hover:border-[#CBD5E1] peer-checked:border-primary peer-checked:bg-primary/5 peer-focus-visible:ring-[3px] peer-focus-visible:ring-primary/20">
        <span class="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">${ico(icono, 'text-[18px]')}</span>
        <span class="min-w-0"><span class="block font-label-lg text-label-lg text-[#0F172A]">${titulo}</span><span class="block font-body-sm text-body-sm text-[#64748B]">${texto}</span></span>
      </span></label>`;
  const radioTipo = (valor, texto, marca, marcado) => `<label class="block cursor-pointer">
      <input type="radio" name="tipo" value="${valor}" class="peer sr-only" ${marcado ? 'checked' : ''}>
      <span class="h-12 lg:h-[42px] px-2 rounded-lg border border-[#E2E8F0] bg-white flex items-center justify-center gap-1.5 font-label-lg text-label-lg text-[#334155] transition-colors hover:border-[#CBD5E1] peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-primary peer-focus-visible:ring-[3px] peer-focus-visible:ring-primary/20">
        <span class="font-mono">${esc(marca)}</span>${texto}</span></label>`;
  return `<div class="flex flex-col gap-4">
    <div><label class="etiqueta" for="proNombre">Nombre *</label>
      <input id="proNombre" name="nombre" class="campo" maxlength="60" required autofocus autocomplete="off" value="${esc(p.nombre || '')}" placeholder="Ej.: Descuento de temporada">
      <p class="ayuda">El cliente lo ve en el resumen de su pedido.</p></div>
    <div><span class="etiqueta">Aplicación</span>
      <div class="grid sm:grid-cols-2 gap-2">
        ${tarjetaRadio('automatica', !conCodigo, 'bolt', 'Automática', 'Se aplica sola cuando el pedido llega al mínimo.')}
        ${tarjetaRadio('codigo', conCodigo, 'confirmation_number', 'Con código', 'El cliente lo escribe en “Mi Pedido”.')}
      </div></div>
    <div data-bloque-codigo class="grid sm:grid-cols-2 gap-3 ${conCodigo ? '' : 'hidden'}">
      <div><label class="etiqueta" for="proCodigo">Código *</label>
        <div class="flex gap-2"><input id="proCodigo" name="codigo" class="campo font-mono uppercase tracking-wider" maxlength="20" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(p.codigo || '')}" placeholder="VERANO10">
          <button type="button" data-generar class="btn-secundario shrink-0 px-3" title="Generar un código al azar">${ico('casino', 'text-[18px]')}Generar</button></div>
        <p class="ayuda">De 3 a 20 letras o números, sin espacios (también valen - y _).</p></div>
      <div><label class="etiqueta" for="proMax">Máximo de usos</label>
        <input id="proMax" name="max_usos" type="number" inputmode="numeric" min="1" step="1" class="campo" value="${p.max_usos ?? ''}" placeholder="Ilimitado">
        <p class="ayuda">${!nuevo && p.codigo ? `Usado ${plural(num(p.usos), 'vez', 'veces')}. ` : ''}Vacío = ilimitado. Cada pedido enviado con el código cuenta un uso.</p></div>
    </div>
    <div class="grid sm:grid-cols-2 gap-3">
      <div><span class="etiqueta">Tipo de descuento</span>
        <div class="grid grid-cols-2 gap-2">${radioTipo('porcentaje', 'Porcentaje', '%', p.tipo !== 'monto')}${radioTipo('monto', 'Monto fijo', simbolo, p.tipo === 'monto')}</div></div>
      <div><label class="etiqueta" for="proValor">Valor *</label>
        <div class="relative">
          <span data-prefijo class="hidden absolute left-3 top-1/2 -translate-y-1/2 font-label-lg text-label-lg text-[#64748B] pointer-events-none">${esc(simbolo)}</span>
          <input id="proValor" name="valor" type="number" inputmode="decimal" min="0.01" step="0.01" class="campo pr-10" required value="${p.valor ?? ''}" placeholder="10">
          <span data-sufijo class="absolute right-3 top-1/2 -translate-y-1/2 font-label-lg text-label-lg text-[#64748B] pointer-events-none">%</span>
        </div>
        <p class="ayuda" data-ayuda-valor></p></div>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <div class="col-span-2 sm:col-span-1"><label class="etiqueta" for="proMin">Mínimo de compra</label>
        <input id="proMin" name="minimo_compra" type="number" inputmode="decimal" min="0" step="0.01" class="campo" value="${num(p.minimo_compra) > 0 ? num(p.minimo_compra) : ''}" placeholder="Sin mínimo"></div>
      <div><label class="etiqueta" for="proInicio">Desde</label><input id="proInicio" name="inicio" type="date" class="campo" value="${esc(p.inicio || '')}"></div>
      <div><label class="etiqueta" for="proFin">Hasta</label><input id="proFin" name="fin" type="date" class="campo" value="${esc(p.fin || '')}"></div>
    </div>
    <label class="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] cursor-pointer">
      <span class="min-w-0"><span class="block font-label-lg text-label-lg text-[#0F172A]">Activa</span><span class="block font-body-sm text-body-sm text-[#64748B]">Si la pausas, deja de aplicarse en los pedidos nuevos.</span></span>
      <input type="checkbox" name="activa" class="interruptor" ${p.activa ? 'checked' : ''}></label>
    <div data-ejemplo class="p-3 rounded-xl bg-primary/5 border border-primary/15 font-body-sm text-body-sm text-[#334155] flex items-start gap-2"></div>
    <p class="flex items-start gap-2 font-body-sm text-body-sm text-[#64748B]">${ico('info', 'text-[18px] text-outline')}<span>Los descuentos no se acumulan: la tienda aplica sólo el mejor descuento vigente en cada pedido (automático o con código).</span></p>
  </div>`;
}

async function formularioPromo(original = null) {
  const nuevo = !original;
  const p = original ? { ...original } : { nombre: '', codigo: null, tipo: 'porcentaje', valor: null, minimo_compra: 0, inicio: null, fin: null, max_usos: null, activa: true, usos: 0 };
  // Una promoción nueva arranca "con código": así nada se descuenta solo hasta que lo decidas.
  const conCodigo = nuevo ? true : !!p.codigo;
  const r = await modal({
    titulo: nuevo ? 'Nueva promoción' : 'Editar promoción', subtitulo: 'Descuento automático por monto de compra o con un código que comparte tu cliente.',
    icono: 'sell', ancho: 'lg', textoEnviar: nuevo ? 'Crear promoción' : 'Guardar cambios',
    contenido: htmlFormPromo(p, conCodigo, nuevo),
    alAbrir: (capa) => {
      const form = $('form', capa);
      const el = form.elements;
      const refrescar = () => {
        const d = leerFormulario(form);
        $('[data-bloque-codigo]', capa).classList.toggle('hidden', d.aplicacion !== 'codigo');
        const porcentaje = d.tipo !== 'monto';
        $('[data-sufijo]', capa).classList.toggle('hidden', !porcentaje);
        $('[data-prefijo]', capa).classList.toggle('hidden', porcentaje);
        el.valor.classList.toggle('pr-10', porcentaje);
        el.valor.classList.toggle('pl-8', !porcentaje);
        const ayuda = $('[data-ayuda-valor]', capa);
        ayuda.textContent = porcentaje ? 'Máximo 90%.' : 'El descuento nunca supera el subtotal del pedido.';
        ayuda.classList.toggle('text-error', porcentaje && num(d.valor) > 90);
        $('[data-ejemplo]', capa).innerHTML = ejemploPromo(d);
      };
      el.codigo.addEventListener('input', () => {
        const limpio = normalizar(el.codigo.value).toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 20);
        if (limpio !== el.codigo.value) el.codigo.value = limpio;
      });
      $('[data-generar]', capa).addEventListener('click', () => { el.codigo.value = generarCodigo(); el.codigo.focus(); refrescar(); });
      form.addEventListener('input', refrescar);
      form.addEventListener('change', (e) => {
        refrescar();
        if (e.target.name === 'aplicacion' && e.target.value === 'codigo' && !el.codigo.value) setTimeout(() => el.codigo.focus(), 0);
      });
      refrescar();
    },
    alEnviar: async (form) => {
      const d = leerFormulario(form);
      if (!d.nombre) throw new Error('Escribe el nombre de la promoción.');
      if (d.nombre.length > 60) throw new Error('El nombre puede tener hasta 60 caracteres.');
      const conCodigoAhora = d.aplicacion === 'codigo';
      let codigo = null;
      let maxUsos = null;
      if (conCodigoAhora) {
        codigo = (d.codigo || '').toUpperCase();
        if (!/^[A-Z0-9_-]{3,20}$/.test(codigo)) throw new Error('El código debe tener de 3 a 20 letras, números, guion o guion bajo, sin espacios.');
        if (promociones.some((x) => x.codigo === codigo && x.id !== p.id)) throw new Error(`Ya existe una promoción con el código ${codigo}.`);
        if (d.max_usos != null) {
          if (!Number.isInteger(d.max_usos) || d.max_usos < 1) throw new Error('El máximo de usos debe ser un número entero mayor que 0 (o déjalo vacío para ilimitado).');
          maxUsos = d.max_usos;
        }
      }
      const tipo = d.tipo === 'monto' ? 'monto' : 'porcentaje';
      if (d.valor == null || !(d.valor > 0)) throw new Error('Escribe un valor de descuento mayor que 0.');
      if (tipo === 'porcentaje' && d.valor > 90) throw new Error('El descuento por porcentaje puede ser de hasta 90%.');
      const minimoCompra = d.minimo_compra ?? 0;
      if (minimoCompra < 0) throw new Error('El mínimo de compra no puede ser negativo.');
      if (d.inicio && d.fin && d.inicio > d.fin) throw new Error('La fecha “desde” debe ser anterior o igual a “hasta”.');
      const fila = {
        nombre: d.nombre, codigo, tipo, valor: Math.round(d.valor * 100) / 100, minimo_compra: Math.round(minimoCompra * 100) / 100,
        inicio: d.inicio || null, fin: d.fin || null, max_usos: maxUsos, activa: d.activa,
      };
      if (nuevo) await db.crear('mt_promociones', [fila]);
      else await db.actualizar('mt_promociones', `id=eq.${p.id}`, fila);
      return fila;
    },
  });
  if (!r) return;
  toast(nuevo ? `Promoción “${r.nombre}” creada` : 'Promoción actualizada');
  await cargar();
}

// ---------------- Datos y eventos ----------------
async function cargar() {
  try {
    const [b, p, c, pr] = await Promise.all([
      db.leer('mt_banners', 'select=*&order=orden,creado_en'),
      db.leer('mt_promociones', 'select=*&order=creado_en.desc'),
      db.leer('mt_categorias', 'select=id,nombre,slug,visible&order=orden,nombre'),
      leerTodo('mt_productos', 'select=id,nombre,slug&estado=eq.publicado&order=nombre,id'),
    ]);
    banners = b;
    promociones = p;
    categorias = c;
    productos = pr;
    pintar();
  } catch (e) {
    toastError(e);
    if (!cargado) pintarError(e);
  }
}

contenido.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-accion]');
  if (!t || t.disabled) return;
  const id = t.dataset.id;
  const b = banners.find((x) => x.id === id);
  const p = promociones.find((x) => x.id === id);
  switch (t.dataset.accion) {
    case 'pestana': cambiarPestana(t.dataset.pestana); break;
    case 'nuevo-banner': formularioBanner(); break;
    case 'editar-banner': if (b) formularioBanner(b); break;
    case 'duplicar-banner': if (b) duplicarBanner(b); break;
    case 'borrar-banner': if (b) borrarBanner(b); break;
    case 'subir-banner': moverBanner(id, -1); break;
    case 'bajar-banner': moverBanner(id, 1); break;
    case 'nueva-promo': formularioPromo(); break;
    case 'editar-promo': if (p) formularioPromo(p); break;
    case 'borrar-promo': if (p) borrarPromo(p); break;
    case 'copiar-codigo': if (await copiar(t.dataset.codigo)) toast(`Código ${t.dataset.codigo} copiado`); break;
    case 'recargar': cargar(); break;
    default: break;
  }
});
contenido.addEventListener('change', (e) => {
  const ib = e.target.closest('input[data-activo-banner]');
  if (ib) { alternarBanner(ib); return; }
  const ip = e.target.closest('input[data-activa-promo]');
  if (ip) alternarPromo(ip);
});

/** #banner y #promo abren el alta (y eligen la pestaña); #banners / #promociones sólo cambian de pestaña; #<id> edita. */
function revisarHash() {
  let h = '';
  try { h = decodeURIComponent(location.hash.slice(1)); } catch { h = ''; }
  if (!h) return;
  const limpiar = () => {
    history.replaceState(null, '', location.pathname + location.search);
    $('[data-menu-crear]')?.classList.add('hidden'); // si se llegó desde "Crear Nuevo" estando en esta página
  };
  if (['banner', 'banners', 'nuevo-banner'].includes(h)) {
    limpiar();
    cambiarPestana('banners');
    if (h !== 'banners') formularioBanner();
    return;
  }
  if (['promo', 'promos', 'promociones', 'nueva-promo'].includes(h)) {
    limpiar();
    cambiarPestana('promos');
    if (h === 'promo' || h === 'nueva-promo') formularioPromo();
    return;
  }
  const b = banners.find((x) => x.id === h);
  const p = promociones.find((x) => x.id === h);
  if (b) { limpiar(); cambiarPestana('banners'); formularioBanner(b); } else if (p) { limpiar(); cambiarPestana('promos'); formularioPromo(p); }
}
window.addEventListener('hashchange', revisarHash);

await cargar();
revisarHash();
