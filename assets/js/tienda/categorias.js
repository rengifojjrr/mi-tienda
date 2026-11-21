// Todas las categorías (pantalla nueva, a la que apuntan el menú inferior y "Ver todas").
import { $, esc, ico, ofertaVigente } from '../util.js';
import { urlImagen, ruta } from '../api.js';
import { iniciarTienda } from './base.js';

const d = await iniciarTienda({ pagina: 'categorias', subtitulo: 'Categorías' });
const contar = (cat) => d.productos.filter((p) => p.categoria_id === cat.id).length;
const enOferta = d.productos.filter((p) => ofertaVigente(p) || p.relampago).length;
const nuevos = d.productos.filter((p) => p.novedad).length;

const tarjeta = (cat) => `<a href="${ruta(`catalogo.html?cat=${encodeURIComponent(cat.slug)}`)}"
    class="group relative overflow-hidden rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-all active:scale-[0.98] flex flex-col animate-entrar">
    <div class="relative aspect-[4/3] bg-surface-container-high overflow-hidden">
      ${cat.imagen_url ? `<img src="${esc(urlImagen(cat.imagen_url))}" alt="" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">`
        : `<div class="w-full h-full flex items-center justify-center">${ico(cat.icono || 'category', 'text-[48px] text-primary')}</div>`}
      <div class="absolute inset-0 bg-gradient-to-t from-inverse-surface/70 via-transparent to-transparent"></div>
      <span class="absolute top-2 left-2 w-9 h-9 rounded-full bg-surface/90 backdrop-blur-sm text-primary flex items-center justify-center shadow-sm">${ico(cat.icono || 'category', 'text-[20px]')}</span>
      <span class="absolute bottom-2 left-3 right-3 font-headline-sm text-headline-sm text-white drop-shadow">${esc(cat.nombre)}</span>
    </div>
    <div class="p-3 flex flex-col gap-1 flex-1">
      <span class="font-label-md text-label-md text-primary">${contar(cat)} productos</span>
      ${cat.descripcion ? `<p class="font-body-sm text-body-sm text-on-surface-variant line-clamp-2">${esc(cat.descripcion)}</p>` : ''}
    </div></a>`;

const atajo = (href, icono, titulo, texto, clases) => `<a href="${ruta(href)}" class="flex items-center gap-3 p-3.5 rounded-2xl ${clases} shadow-sm hover:shadow-md transition-all active:scale-[0.98]">
    <span class="w-11 h-11 rounded-xl bg-white/25 flex items-center justify-center shrink-0">${ico(icono, 'text-[24px]', true)}</span>
    <span class="flex-1 min-w-0"><span class="block font-label-lg text-label-lg">${titulo}</span><span class="block font-body-sm text-body-sm opacity-90">${texto}</span></span>
    ${ico('chevron_right', 'text-[20px]')}</a>`;

$('#contenido').innerHTML = `
  <div class="pt-3 pb-2 flex flex-col gap-1">
    <div class="inline-flex items-center gap-1.5 self-start px-2 py-0.5 rounded-full bg-surface-container-high text-primary font-label-sm text-label-sm">${ico('category', 'text-[14px]')} ${d.categorias.length} categorías</div>
    <h1 class="font-headline-lg-mobile text-headline-lg-mobile lg:font-headline-lg lg:text-headline-lg text-on-surface tracking-tight">Explora por categoría</h1>
    <p class="font-body-sm text-body-sm text-on-surface-variant">Encuentra rápido lo que buscas y pídelo directo por WhatsApp.</p>
  </div>
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-2">
    ${atajo('catalogo.html', 'all_inclusive', 'Todo el catálogo', `${d.productos.length} productos`, 'bg-primary text-on-primary')}
    ${enOferta ? atajo('catalogo.html?oferta=1', 'sell', 'Ofertas activas', `${enOferta} con descuento`, 'bg-tertiary-container text-on-tertiary-container') : ''}
    ${nuevos ? atajo('catalogo.html?orden=nuevos', 'new_releases', 'Novedades', `${nuevos} recién llegados`, 'bg-secondary text-on-secondary') : ''}
  </div>
  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-5 mt-space-md">
    ${d.categorias.map(tarjeta).join('') || '<p class="col-span-full py-10 text-center text-on-surface-variant">Aún no hay categorías publicadas.</p>'}
  </div>`;
