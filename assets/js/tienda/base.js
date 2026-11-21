// Estructura común de la tienda: encabezado, menú inferior, botón de WhatsApp, pie,
// buscador y avisos. Cada página llama a iniciarTienda() y recibe los datos del catálogo.
import { esc, ico, dinero, plantilla, urlWhatsApp, normalizar, precioVigente, debounce, $, iniciales } from '../util.js';
import { urlImagen, ruta } from '../api.js';
import { cargarDatos, unidadesEnPedido, alCambiarPedido, registrar, vistaPrevia, leerCliente } from './estado.js';

const NAV = [
  { id: 'inicio', texto: 'Inicio', icono: 'storefront', href: 'index.html' },
  { id: 'catalogo', texto: 'Catálogo', icono: 'grid_view', href: 'catalogo.html' },
  { id: 'categorias', texto: 'Categorías', icono: 'category', href: 'categorias.html' },
  { id: 'pedido', texto: 'Mi Pedido', icono: 'receipt_long', href: 'pedido.html' },
  { id: 'soporte', texto: 'Soporte', icono: 'support_agent', href: 'soporte.html' },
];

let datosTienda = null;
export const datos = () => datosTienda;
export const cfg = () => datosTienda?.cfg || {};
export const precio = (n) => dinero(n, cfg());

const ultimaCfg = () => { try { return JSON.parse(localStorage.getItem('mt_cfg_ultima') || '{}'); } catch { return {}; } };

// ---------------- WhatsApp ----------------
export const textoTienda = (t) => plantilla(t, { tienda: cfg().nombre || 'MI TIENDA' });
export const enlaceWhatsApp = (texto) => urlWhatsApp(cfg().whatsapp, texto);

/** Abre WhatsApp con el mensaje y registra el clic para las estadísticas del panel. */
export function abrirWhatsApp(texto, { canal = 'general', producto = null, pagina = null, ventana = null, registrarClic = true } = {}) {
  const url = enlaceWhatsApp(texto);
  if (registrarClic) registrar('clic_whatsapp', { canal, producto, pagina });
  if (ventana && !ventana.closed) {
    ventana.location.href = url;
    return url;
  }
  const w = window.open(url, '_blank');
  if (w) { try { w.opener = null; } catch { /* nada */ } } else location.href = url;
  return url;
}

// ---------------- Aviso flotante (toast) ----------------
let temporizadorToast;
export function toast(mensaje, { icono = 'check_circle', error = false } = {}) {
  let el = $('#mt-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mt-toast';
    el.setAttribute('role', 'status');
    el.className = 'fixed top-20 left-1/2 -translate-x-1/2 z-[70] pointer-events-none transition-all duration-300 opacity-0 -translate-y-2 max-w-[92%] w-max';
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="bg-inverse-surface text-inverse-on-surface px-4 py-2.5 rounded-full shadow-xl flex items-center gap-2">
      ${ico(icono, `text-[20px] ${error ? 'text-[#fca5a5]' : 'text-secondary-fixed'}`, true)}
      <span class="font-label-md text-label-md">${esc(mensaje)}</span></div>`;
  requestAnimationFrame(() => el.classList.remove('opacity-0', '-translate-y-2'));
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => el.classList.add('opacity-0', '-translate-y-2'), 2600);
}

export function animarBolsa() {
  document.querySelectorAll('[data-bolsa]').forEach((b) => {
    b.classList.remove('animate-rebote');
    void b.offsetWidth;
    b.classList.add('animate-rebote');
  });
}

// ---------------- Encabezado ----------------
function htmlLogo(c, clases = 'h-8 w-8') {
  return `<img alt="" class="${clases} rounded-lg object-contain shrink-0" src="${esc(c.logo_url ? urlImagen(c.logo_url) : ruta('assets/img/logo.svg'))}" width="32" height="32">`;
}

function htmlAvatar() {
  const cli = leerCliente();
  const contenido = cli.nombre
    ? `<span class="font-label-md text-label-md text-primary">${esc(iniciales(cli.nombre))}</span>`
    : ico('person', 'text-[20px] text-primary');
  return `<a href="${ruta('cuenta.html')}" aria-label="Mi cuenta" title="Mi cuenta"
      class="w-9 h-9 rounded-full bg-surface-container-high flex items-center justify-center ring-2 ring-primary/20 shrink-0 ml-1 hover:ring-primary/40 transition">${contenido}</a>`;
}

function htmlAccionesDerecha(c, conBuscar = true) {
  return `<div class="flex items-center gap-space-xs">
      ${conBuscar ? `<button type="button" data-abrir-buscador aria-label="Buscar" class="w-11 h-11 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container-high transition-colors">${ico('search', 'text-[22px]')}</button>` : ''}
      <a href="${ruta('pedido.html')}" data-bolsa aria-label="Ver mi pedido" class="relative w-11 h-11 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container-high transition-colors">
        ${ico('shopping_bag', 'text-[22px]')}
        <span data-contador-pedido class="hidden absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 bg-primary text-on-primary font-label-sm text-label-sm rounded-full flex items-center justify-center tnum">0</span>
      </a>
      <a href="${esc(enlaceWhatsApp(textoTienda('Hola {tienda}, tengo una consulta')))}" target="_blank" rel="noopener" data-wa-general title="Chatear"
         class="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-wa hover:bg-wa-hover text-white rounded-full font-label-md text-label-md shadow-wa transition-all">
        ${ico('chat', 'text-[18px]', true)}<span>Chatear</span></a>
      ${htmlAvatar()}
    </div>`;
}

function htmlEncabezado({ pagina, subtitulo, encabezado, tituloDetalle }, c) {
  const navEscritorio = `<nav class="hidden lg:flex items-center gap-1" aria-label="Principal">
      ${NAV.map((n) => `<a href="${ruta(n.href)}" class="px-3 py-2 rounded-full font-label-lg text-label-lg transition-colors ${n.id === pagina ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'}">${n.texto}</a>`).join('')}
    </nav>`;
  if (encabezado === 'detalle') {
    return `<header class="fixed top-0 inset-x-0 z-50 pt-safe bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div class="h-16 max-w-7xl mx-auto px-space-md lg:px-margin-desktop flex items-center justify-between gap-space-sm">
        <div class="flex items-center gap-space-xs min-w-0">
          <button type="button" data-volver aria-label="Volver" class="w-11 h-11 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container-high transition-colors">${ico('arrow_back', 'text-[24px]')}</button>
          <a href="${ruta('index.html')}" class="flex items-center gap-2 min-w-0">${htmlLogo(c, 'h-7 w-7')}
            <span class="font-headline-sm text-headline-sm text-on-surface truncate ml-1">${esc(tituloDetalle || subtitulo)}</span></a>
        </div>
        ${navEscritorio}
        <div class="flex items-center gap-space-xs">
          <button type="button" data-compartir aria-label="Compartir" class="w-11 h-11 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors">${ico('share', 'text-[22px]')}</button>
          <a href="${ruta('pedido.html')}" data-bolsa aria-label="Ver mi pedido" class="relative w-11 h-11 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container-high transition-colors">
            ${ico('shopping_bag', 'text-[22px]')}
            <span data-contador-pedido class="hidden absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 bg-primary text-on-primary font-label-sm text-label-sm rounded-full flex items-center justify-center tnum">0</span>
          </a>
          ${htmlAvatar()}
        </div>
      </div></header>`;
  }
  return `<header class="fixed top-0 inset-x-0 z-50 pt-safe bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
    <div class="h-16 max-w-7xl mx-auto px-space-md lg:px-margin-desktop flex items-center justify-between gap-space-sm">
      <a href="${ruta('index.html')}" class="flex items-center gap-space-sm min-w-0">
        ${htmlLogo(c)}
        <div class="flex flex-col min-w-0">
          <span class="font-headline-sm text-headline-sm text-on-surface truncate" data-nombre-tienda>${esc(c.nombre || 'MI TIENDA')}</span>
          <span class="font-label-sm text-label-sm text-on-surface-variant truncate">${esc(subtitulo)}</span>
        </div>
      </a>
      ${navEscritorio}
      ${htmlAccionesDerecha(c)}
    </div></header>`;
}

function htmlNavInferior(pagina) {
  return `<nav class="lg:hidden fixed bottom-0 inset-x-0 z-50 pb-safe bg-surface/90 backdrop-blur-xl shadow-[0_-2px_12px_rgba(0,0,0,0.06)]" aria-label="Menú">
    <div class="flex items-center justify-around h-16 px-space-xs">
      ${NAV.map((n) => `<a href="${ruta(n.href)}" ${n.id === pagina ? 'aria-current="page"' : ''}
          class="relative flex flex-col items-center justify-center min-w-[56px] h-12 transition-colors ${n.id === pagina ? 'text-primary font-bold' : 'text-on-surface-variant hover:text-on-surface'}">
          ${ico(n.icono, 'text-[24px]', n.id === pagina)}
          ${n.id === 'pedido' ? '<span data-punto-pedido class="hidden absolute top-1 right-3.5 w-2 h-2 bg-primary rounded-full ring-2 ring-surface"></span>' : ''}
          <span class="font-label-sm text-label-sm mt-0.5">${n.texto}</span></a>`).join('')}
    </div></nav>`;
}

function htmlPie(d) {
  const c = d.cfg;
  const redes = Object.entries(c.redes || {}).filter(([, v]) => v);
  const iconosRed = { instagram: 'photo_camera', facebook: 'thumb_up', tiktok: 'music_note' };
  const enlace = (href, texto) => `<a class="font-body-sm text-body-sm text-on-surface-variant hover:text-primary transition-colors" href="${ruta(href)}">${texto}</a>`;
  return `<footer class="mt-space-xl w-full max-w-7xl mx-auto lg:px-margin-desktop">
    <div class="px-space-md pt-space-lg pb-28 lg:pb-space-lg bg-surface-container-lowest rounded-t-2xl lg:rounded-2xl lg:mb-8 shadow-sm flex flex-col gap-space-md lg:grid lg:grid-cols-4 lg:gap-8 lg:p-8">
      <div class="flex flex-col gap-space-xs lg:col-span-1">
        <div class="flex items-center gap-2">${ico('storefront', 'text-primary text-[26px]')}
          <span class="font-headline-sm text-headline-sm text-on-surface">${esc(c.nombre || 'MI TIENDA')} Oficial</span></div>
        <p class="font-body-sm text-body-sm text-on-surface-variant">${esc(d.contenido?.pie?.texto || '')}</p>
        ${redes.length ? `<div class="flex gap-2 pt-1">${redes.map(([red, url]) => `<a href="${esc(url)}" target="_blank" rel="noopener" aria-label="${esc(red)}" class="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-primary hover:bg-surface-container-high">${ico(iconosRed[red] || 'link', 'text-[18px]')}</a>`).join('')}</div>` : ''}
      </div>
      <div class="grid grid-cols-2 gap-space-md py-space-sm lg:py-0 lg:col-span-2">
        <div class="flex flex-col gap-1.5">
          <span class="font-label-md text-label-md text-on-surface font-bold uppercase tracking-wider">Enlaces</span>
          ${enlace('catalogo.html', 'Catálogo Completo')}${enlace('categorias.html', 'Todas las Categorías')}${enlace('pedido.html', 'Revisar Mi Pedido')}${enlace('cuenta.html', 'Mis Pedidos y Favoritos')}${enlace('soporte.html', 'Centro de Soporte')}
        </div>
        <div class="flex flex-col gap-1.5">
          <span class="font-label-md text-label-md text-on-surface font-bold uppercase tracking-wider">Garantía &amp; Legal</span>
          ${enlace('legal.html#devoluciones', 'Política de Devolución')}${enlace('legal.html#terminos', 'Términos del Servicio')}${enlace('legal.html#privacidad', 'Privacidad y Datos')}${enlace('soporte.html#preguntas', 'Preguntas Clave')}
        </div>
      </div>
      <div class="flex flex-col gap-space-md lg:col-span-1">
        <a data-wa-general class="p-space-sm rounded-xl bg-wa/10 hover:bg-wa/20 transition-colors flex items-center justify-between gap-space-sm text-on-surface"
           href="${esc(enlaceWhatsApp(textoTienda('Hola, tengo una consulta sobre {tienda}')))}" target="_blank" rel="noopener">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-wa text-white flex items-center justify-center shrink-0 shadow-sm">${ico('chat', 'text-[22px]', true)}</div>
            <div class="flex flex-col"><span class="font-subheading text-[13px] leading-tight">Canal de Ventas WhatsApp</span>
              <span class="font-label-sm text-label-sm text-on-surface-variant">${esc(c.horario || '')}</span></div>
          </div>${ico('arrow_forward', 'text-wa-hover text-[20px]')}</a>
      </div>
      <div class="pt-space-sm text-center lg:col-span-4 lg:border-t lg:border-surface-container lg:pt-5">
        <p class="font-label-sm text-label-sm text-outline">© ${new Date().getFullYear()} ${esc(c.nombre || 'MI TIENDA')} • Todos los derechos reservados. Comercio Conversacional Seguro.</p>
      </div>
    </div></footer>`;
}

// ---------------- Buscador ----------------
function abrirBuscador() {
  const d = datosTienda;
  if (!d) return;
  const capa = document.createElement('div');
  capa.className = 'fixed inset-0 z-[80] bg-[#0F172A]/40 backdrop-blur-[4px] flex items-start justify-center animate-entrar';
  capa.innerHTML = `<div class="w-full lg:max-w-2xl lg:mt-24 bg-surface rounded-b-3xl lg:rounded-3xl shadow-nivel3 p-space-md pt-safe">
      <form class="relative flex items-center gap-2 mt-2" role="search">
        ${ico('search', 'absolute left-3.5 text-outline text-[20px] pointer-events-none')}
        <input type="search" name="q" autocomplete="off" placeholder="Buscar por nombre, marca o categoría..." aria-label="Buscar productos"
          class="w-full h-12 pl-10 pr-3 rounded-xl bg-surface-container-lowest text-on-surface placeholder:text-outline font-body-md text-body-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
        <button type="button" data-cerrar class="h-12 px-3 rounded-xl font-label-lg text-label-lg text-primary hover:bg-surface-container">Cerrar</button>
      </form>
      <div data-resultados class="mt-3 flex flex-col gap-1 max-h-[60vh] overflow-y-auto"></div>
    </div>`;
  document.body.appendChild(capa);
  document.body.style.overflow = 'hidden';
  const input = $('input', capa);
  const resultados = $('[data-resultados]', capa);
  const cerrar = () => { capa.remove(); document.body.style.overflow = ''; };
  const pintar = () => {
    const q = normalizar(input.value.trim());
    if (q.length < 2) {
      const sugeridos = d.productos.filter((p) => p.destacado).slice(0, 4);
      resultados.innerHTML = `<p class="px-2 pt-1 pb-2 font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">Populares</p>${sugeridos.map(filaResultado).join('')}`;
      return;
    }
    const encontrados = buscar(d, q);
    resultados.innerHTML = encontrados.length
      ? `${encontrados.slice(0, 6).map(filaResultado).join('')}
         <a href="${ruta(`catalogo.html?q=${encodeURIComponent(input.value.trim())}`)}" class="mt-1 h-11 rounded-xl bg-surface-container text-primary font-label-lg text-label-lg flex items-center justify-center gap-1">Ver los ${encontrados.length} resultados ${ico('arrow_forward', 'text-[18px]')}</a>`
      : `<div class="py-8 text-center flex flex-col items-center gap-2">${ico('search_off', 'text-[36px] text-outline')}
           <p class="font-body-md text-body-md text-on-surface-variant">No encontramos "${esc(input.value)}".</p>
           <a class="btn-wa btn-sm" target="_blank" rel="noopener" href="${esc(enlaceWhatsApp(textoTienda(`Hola {tienda}, ¿tienen ${input.value.trim()}?`)))}">${ico('chat', 'text-[16px]', true)} Preguntar por WhatsApp</a></div>`;
  };
  const filaResultado = (p) => `<a href="${ruta(`producto.html?p=${encodeURIComponent(p.slug)}`)}" class="flex items-center gap-3 p-2 rounded-xl hover:bg-surface-container-low">
      <img src="${esc(urlImagen(p.imagenes?.[0]?.mini || p.imagenes?.[0]?.url))}" alt="" class="w-12 h-12 rounded-lg object-cover bg-surface-container" loading="lazy">
      <div class="flex-1 min-w-0"><p class="font-label-lg text-label-lg text-on-surface truncate">${esc(p.nombre)}</p>
        <p class="font-body-sm text-body-sm text-on-surface-variant truncate">${esc(d.catPorId.get(p.categoria_id)?.nombre || '')}</p></div>
      <span class="font-headline-sm text-[15px] text-primary tnum">${precio(precioVigente(p))}</span></a>`;
  input.addEventListener('input', debounce(pintar, 120));
  $('form', capa).addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q) location.href = ruta(`catalogo.html?q=${encodeURIComponent(q)}`);
  });
  $('[data-cerrar]', capa).addEventListener('click', cerrar);
  capa.addEventListener('click', (e) => { if (e.target === capa) cerrar(); });
  capa.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });
  pintar();
  setTimeout(() => input.focus(), 30);
}

/** Búsqueda simple por nombre, marca, SKU, etiquetas y categoría (sin acentos). */
export function buscar(d, consulta) {
  const terminos = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (!terminos.length) return d.productos;
  return d.productos
    .map((p) => {
      const cat = d.catPorId.get(p.categoria_id)?.nombre || '';
      const texto = normalizar([p.nombre, p.marca, p.sku, p.modelo, p.subcategoria, cat, ...(p.etiquetas || [])].join(' '));
      const nombre = normalizar(p.nombre);
      let puntos = 0;
      for (const t of terminos) {
        if (!texto.includes(t)) return null;
        puntos += nombre.includes(t) ? 3 : 1;
        if (nombre.startsWith(t)) puntos += 2;
      }
      return { p, puntos };
    })
    .filter(Boolean)
    .sort((a, b) => b.puntos - a.puntos)
    .map((x) => x.p);
}

// ---------------- Contador de la bolsa ----------------
function actualizarContadores() {
  const n = unidadesEnPedido();
  document.querySelectorAll('[data-contador-pedido]').forEach((el) => { el.textContent = n > 99 ? '99+' : n; el.classList.toggle('hidden', n === 0); });
  document.querySelectorAll('[data-punto-pedido]').forEach((el) => el.classList.toggle('hidden', n === 0));
}

// ---------------- Arranque de cada página ----------------
/**
 * @param {{pagina: string, subtitulo: string, encabezado?: 'normal'|'detalle', tituloDetalle?: string, registrarVisita?: boolean}} opciones
 */
export async function iniciarTienda(opciones) {
  const { pagina, subtitulo } = opciones;
  const contEncabezado = $('#encabezado');
  const contPie = $('#pie');
  const cfgRapida = ultimaCfg();
  if (contEncabezado) contEncabezado.innerHTML = htmlEncabezado(opciones, cfgRapida);
  document.body.insertAdjacentHTML('beforeend', htmlNavInferior(pagina));
  actualizarContadores();

  try {
    datosTienda = await cargarDatos();
  } catch (e) {
    const principal = $('#principal');
    if (principal) {
      principal.innerHTML = `<div class="max-w-md mx-auto px-6 py-24 text-center flex flex-col items-center gap-3">
        ${ico('cloud_off', 'text-[44px] text-outline')}
        <h1 class="font-headline-sm text-headline-sm">No pudimos cargar la tienda</h1>
        <p class="font-body-md text-body-md text-on-surface-variant">${esc(e.message)}</p>
        <button class="btn-primario" onclick="location.reload()">${ico('refresh', 'text-[18px]')} Reintentar</button></div>`;
    }
    throw e;
  }
  const c = datosTienda.cfg;
  try { localStorage.setItem('mt_cfg_ultima', JSON.stringify({ nombre: c.nombre, logo_url: c.logo_url, whatsapp: c.whatsapp })); } catch { /* nada */ }

  if (contEncabezado) contEncabezado.innerHTML = htmlEncabezado(opciones, c);
  if (contPie && !opciones.sinPie) contPie.innerHTML = htmlPie(datosTienda);
  document.title = `${subtitulo} · ${c.nombre || 'MI TIENDA'}`;
  if (c.logo_url) document.querySelector('link[rel="icon"]')?.setAttribute('href', urlImagen(c.logo_url));

  // Botón flotante de WhatsApp
  if (!opciones.sinBotonWa) {
    document.body.insertAdjacentHTML('beforeend', `<a data-wa-general aria-label="Chatear por WhatsApp" target="_blank" rel="noopener"
      href="${esc(enlaceWhatsApp(textoTienda('Hola {tienda}, tengo una consulta')))}"
      class="fixed bottom-24 lg:bottom-6 right-4 z-40 w-14 h-14 bg-wa hover:bg-wa-hover text-white rounded-full flex items-center justify-center shadow-wa-fuerte transition-transform hover:scale-105 active:scale-95">
      ${ico('chat', 'text-[30px]', true)}<span class="absolute inset-0 rounded-full bg-wa/40 animate-ping -z-10"></span></a>`);
  }

  // Avisos: tienda cerrada / vista previa
  const principal = $('#principal');
  if (principal && vistaPrevia) {
    principal.insertAdjacentHTML('afterbegin', `<div class="max-w-7xl mx-auto px-space-md lg:px-margin-desktop pt-2"><div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#F5F3FF] text-[#5B21B6] font-label-md text-label-md">${ico('visibility', 'text-[18px]')} Vista previa del panel: también ves borradores y productos ocultos.</div></div>`);
  }
  if (principal && c.abierta === false) {
    principal.insertAdjacentHTML('afterbegin', `<div class="max-w-7xl mx-auto px-space-md lg:px-margin-desktop pt-2"><div class="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A] font-label-md text-label-md">${ico('schedule', 'text-[18px]')}<span>${esc(c.mensaje_cerrado || 'Estamos fuera de horario.')}</span></div></div>`);
  }

  // Eventos comunes
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-abrir-buscador]')) { e.preventDefault(); abrirBuscador(); }
    if (e.target.closest('[data-volver]')) {
      e.preventDefault();
      if (history.length > 1 && document.referrer && new URL(document.referrer).origin === location.origin) history.back();
      else location.href = ruta('catalogo.html');
    }
    if (e.target.closest('[data-wa-general]')) registrar('clic_whatsapp', { canal: 'general', pagina });
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && !/input|textarea|select/i.test(document.activeElement?.tagName)) {
      e.preventDefault(); abrirBuscador();
    }
  });
  alCambiarPedido(actualizarContadores);
  actualizarContadores();
  if (opciones.registrarVisita !== false) registrar('visita', { pagina });
  return datosTienda;
}
