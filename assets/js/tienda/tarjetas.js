// Tarjetas de producto (las variantes de la tienda de Stitch) y la hoja para elegir opción.
import { esc, ico, ofertaVigente, descuentoPct, precioVigente, disponibilidad, maximoPedido, num, $ } from '../util.js';
import { urlImagen, ruta } from '../api.js';
import { agregarAlPedido, alternarFavorito, leerFavoritos, registrar } from './estado.js';
import { precio, toast, animarBolsa, abrirWhatsApp, textoTienda, cfg, datos } from './base.js';

export const urlProducto = (p) => ruta(`producto.html?p=${encodeURIComponent(p.slug)}`);
const imgMini = (p) => urlImagen(p.imagenes?.[0]?.mini || p.imagenes?.[0]?.url) || ruta('assets/img/logo.svg');

/** Insignia superior izquierda de la tarjeta de inicio (estilo Stitch). */
function insigniaInicio(p, d) {
  const disp = disponibilidad(p, null, cfg().stock_bajo_umbral ?? 10);
  const pill = (clases, icono, texto) => `<div class="absolute top-2 left-2 px-2 py-0.5 rounded-full ${clases} font-label-sm text-label-sm shadow-sm flex items-center gap-0.5">${ico(icono, 'text-[12px]')}<span>${esc(texto)}</span></div>`;
  if (disp.codigo === 'agotado') return pill('bg-error-container text-on-error-container', 'block', 'Agotado');
  if (disp.codigo === 'preventa') return pill('bg-tertiary-fixed text-on-tertiary-fixed', 'event_upcoming', 'Preventa');
  if (ofertaVigente(p)) return pill('bg-secondary-container text-on-secondary-container', 'percent', `Oferta ${descuentoPct(p)}%`);
  if (p.relampago) return pill('bg-[#FEF3C7] text-[#92400E]', 'bolt', 'Relámpago');
  if (p.novedad) return pill('bg-secondary-fixed text-on-secondary-fixed-variant', 'fiber_new', 'Novedad');
  if (d.topVentas.has(p.id)) return pill('bg-tertiary-container text-on-tertiary-container', 'local_fire_department', 'Top Ventas');
  if (disp.codigo === 'pocas' && disp.stock <= 5) return pill('bg-error-container text-on-error-container', 'schedule', `Últimas ${disp.stock}`);
  return '';
}

function pastillaEstado(p) {
  const disp = disponibilidad(p, null, cfg().stock_bajo_umbral ?? 10);
  const estilos = {
    disponible: 'bg-primary-fixed text-on-primary-fixed-variant', pocas: 'bg-surface-container-highest text-on-surface',
    agotado: 'bg-error-container text-on-error-container', preventa: 'bg-tertiary-fixed text-on-tertiary-fixed', consulta: 'bg-surface-container-highest text-on-surface',
  };
  return `<div class="absolute bottom-2 left-2 px-2 py-0.5 rounded-full ${estilos[disp.codigo]} font-label-sm text-label-sm backdrop-blur-sm shadow-sm">${esc(disp.texto)}</div>`;
}

const bloquePrecio = (p, grande = false) => `<div class="flex items-baseline gap-1.5 flex-wrap ${grande ? '' : 'mt-1'}">
    <span class="font-headline-sm ${grande ? 'text-headline-sm' : 'text-[16px]'} text-primary tnum">${precio(precioVigente(p))}</span>
    ${ofertaVigente(p) ? `<span class="font-label-sm text-label-sm text-outline line-through tnum">${precio(p.precio)}</span>` : ''}
  </div>`;

/** Tarjeta de "Productos Destacados" (inicio). */
export function tarjetaInicio(p) {
  const d = datos();
  const disp = disponibilidad(p, null, cfg().stock_bajo_umbral ?? 10);
  return `<article class="flex flex-col bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all relative group animate-entrar">
    <a href="${urlProducto(p)}" class="relative w-full aspect-square bg-surface-container-low overflow-hidden block" aria-label="${esc(p.nombre)}">
      <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${disp.codigo === 'agotado' ? 'grayscale-[35%]' : ''}" src="${esc(imgMini(p))}" alt="${esc(p.nombre)}" loading="lazy" width="440" height="440">
      ${insigniaInicio(p, d)}${pastillaEstado(p)}
    </a>
    <div class="p-2.5 flex flex-col flex-1 justify-between gap-1.5">
      <div><h3 class="font-subheading text-[13px] leading-tight text-on-surface line-clamp-2"><a href="${urlProducto(p)}">${esc(p.nombre)}</a></h3>${bloquePrecio(p)}</div>
      <div class="flex items-center gap-1.5 pt-1">
        <a href="${urlProducto(p)}" class="flex-1 h-9 rounded-lg bg-surface-container text-on-surface font-label-sm text-label-sm flex items-center justify-center hover:bg-surface-container-high active:scale-95 transition-all">Ver</a>
        ${botonAccion(p, 'inicio')}
      </div>
    </div></article>`;
}

function botonAccion(p, estilo) {
  const disp = disponibilidad(p, null, cfg().stock_bajo_umbral ?? 10);
  if (disp.codigo === 'agotado') {
    return estilo === 'inicio'
      ? `<button type="button" data-accion="avisar" data-id="${p.id}" aria-label="Avisarme por WhatsApp" title="Avisarme cuando llegue" class="w-9 h-9 rounded-lg bg-wa/15 text-wa-tinta flex items-center justify-center active:scale-90 transition-transform">${ico('notifications', 'text-[20px]')}</button>`
      : '';
  }
  const reservar = disp.codigo === 'preventa';
  if (estilo === 'inicio') {
    return `<button type="button" data-accion="agregar" data-id="${p.id}" aria-label="${reservar ? 'Reservar' : 'Agregar a mi pedido'}" title="${reservar ? 'Reservar (preventa)' : 'Agregar a mi pedido'}"
      class="w-9 h-9 rounded-lg ${reservar ? 'bg-surface-container-high text-primary' : 'bg-primary hover:bg-primary-container text-on-primary'} flex items-center justify-center active:scale-90 transition-transform shadow-sm">${ico(reservar ? 'bookmark_add' : 'add_shopping_cart', 'text-[20px]')}</button>`;
  }
  return `<button type="button" data-accion="agregar" data-id="${p.id}" aria-label="${reservar ? 'Reservar' : 'Agregar'} ${esc(p.nombre)}" title="${reservar ? 'Reservar cupo (preventa)' : 'Agregar a mi pedido'}"
    class="col-span-2 h-8 rounded-lg ${reservar ? 'bg-surface-container-high text-primary' : 'bg-primary text-on-primary'} font-label-sm text-label-sm active:scale-95 transition-all flex items-center justify-center shadow-xs">${ico(reservar ? 'bookmark_add' : 'add', 'text-[16px]')}</button>`;
}

function insigniaCatalogo(p, d) {
  const disp = disponibilidad(p, null, cfg().stock_bajo_umbral ?? 10);
  const pill = (clases, texto) => `<span class="absolute top-2 left-2 px-2 py-0.5 rounded-full ${clases} font-label-sm text-label-sm shadow-xs">${esc(texto)}</span>`;
  if (disp.codigo === 'agotado') return pill('bg-error-container text-on-error-container font-bold', 'Agotado');
  if (disp.codigo === 'preventa') return pill('bg-surface-container-highest text-on-surface font-semibold', 'Próximamente');
  if (ofertaVigente(p)) return pill('bg-error text-on-error', `${descuentoPct(p)}% OFF`);
  if (p.relampago) return pill('bg-tertiary-container text-on-tertiary-container', 'Oferta');
  if (p.novedad) return pill('bg-secondary-container text-on-secondary-container font-bold', 'Nuevo');
  if (d.topVentas.has(p.id)) return pill('bg-tertiary-container text-on-tertiary-container', 'Top Ventas');
  return '';
}

function lineaEstado(p) {
  const disp = disponibilidad(p, null, cfg().stock_bajo_umbral ?? 10);
  const colores = { disponible: ['bg-secondary', 'text-secondary'], pocas: ['bg-[#F59E0B]', 'text-[#B45309]'], agotado: ['bg-error', 'text-error'], preventa: ['bg-tertiary', 'text-tertiary'], consulta: ['bg-tertiary', 'text-tertiary'] };
  const [punto, texto] = colores[disp.codigo];
  const etiqueta = disp.codigo === 'agotado' ? 'Sin Stock' : disp.codigo === 'pocas' && disp.stock <= 5 ? `Quedan ${disp.stock}` : disp.texto;
  return `<div class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full ${punto}"></span><span class="font-label-sm text-label-sm ${texto} font-bold">${esc(etiqueta)}</span></div>`;
}

const botonFavorito = (p, favs) => `<button type="button" data-accion="fav" data-id="${p.id}" aria-pressed="${favs.has(p.id)}" aria-label="${favs.has(p.id) ? 'Quitar de favoritos' : 'Agregar a favoritos'}"
    class="absolute top-2 right-2 w-7 h-7 rounded-full bg-surface/80 backdrop-blur-sm ${favs.has(p.id) ? 'text-error' : 'text-on-surface'} flex items-center justify-center active:scale-90 transition-transform">${ico('favorite', 'text-[16px]', favs.has(p.id))}</button>`;

/** Tarjeta del catálogo general (cuadrícula). */
export function tarjetaCatalogo(p, favs = leerFavoritos()) {
  const d = datos();
  const disp = disponibilidad(p, null, cfg().stock_bajo_umbral ?? 10);
  const agotado = disp.codigo === 'agotado';
  return `<div class="flex flex-col w-full rounded-2xl bg-surface-container-lowest shadow-sm ${agotado ? 'opacity-95' : 'hover:shadow-md group'} transition-all overflow-hidden animate-entrar">
    <div class="relative w-full aspect-square bg-surface-container overflow-hidden">
      <a href="${urlProducto(p)}" aria-label="${esc(p.nombre)}"><img class="w-full h-full object-cover ${agotado ? 'grayscale-[35%]' : 'group-hover:scale-105 transition-transform duration-300'}" src="${esc(imgMini(p))}" alt="${esc(p.nombre)}" loading="lazy" width="440" height="440"></a>
      ${insigniaCatalogo(p, d)}${agotado ? '' : botonFavorito(p, favs)}
    </div>
    <div class="p-2.5 flex flex-col flex-1 justify-between gap-2">
      <div class="flex flex-col gap-1 min-w-0">${lineaEstado(p)}
        <h2 class="font-subheading text-subheading text-on-surface line-clamp-2 leading-tight"><a href="${urlProducto(p)}">${esc(p.nombre)}</a></h2></div>
      <div class="flex flex-col gap-2 pt-0.5">
        <div class="flex items-baseline gap-1.5 flex-wrap">
          <span class="font-headline-sm text-headline-sm ${agotado ? 'text-on-surface-variant' : 'text-primary'} tnum">${precio(precioVigente(p))}</span>
          ${ofertaVigente(p) ? `<span class="font-body-sm text-body-sm text-outline line-through tnum">${precio(p.precio)}</span>` : ''}
        </div>
        ${agotado
          ? `<button type="button" data-accion="avisar" data-id="${p.id}" class="w-full h-8 rounded-lg bg-wa/15 hover:bg-wa/25 text-[#136633] font-label-sm text-label-sm font-bold flex items-center justify-center gap-1 active:scale-95 transition-all">${ico('notifications', 'text-[15px] text-wa')}<span>Avisar en WhatsApp</span></button>`
          : `<div class="grid grid-cols-5 gap-1.5">
              <a href="${urlProducto(p)}" class="col-span-3 h-8 rounded-lg bg-surface-container text-on-surface font-label-sm text-label-sm hover:bg-surface-container-high active:scale-95 transition-all flex items-center justify-center">Detalle</a>
              ${botonAccion(p, 'catalogo')}</div>`}
      </div>
    </div></div>`;
}

/** Fila para la vista de lista del catálogo. */
export function filaCatalogo(p, favs = leerFavoritos()) {
  const disp = disponibilidad(p, null, cfg().stock_bajo_umbral ?? 10);
  const agotado = disp.codigo === 'agotado';
  return `<div class="flex gap-3 p-2.5 rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-all animate-entrar">
    <a href="${urlProducto(p)}" class="relative w-28 h-28 shrink-0 rounded-xl overflow-hidden bg-surface-container"><img class="w-full h-full object-cover ${agotado ? 'grayscale-[35%]' : ''}" src="${esc(imgMini(p))}" alt="${esc(p.nombre)}" loading="lazy"></a>
    <div class="flex-1 min-w-0 flex flex-col justify-between gap-1">
      <div class="flex items-start justify-between gap-2"><div class="min-w-0">${lineaEstado(p)}
        <h2 class="font-subheading text-subheading text-on-surface line-clamp-2 leading-tight mt-0.5"><a href="${urlProducto(p)}">${esc(p.nombre)}</a></h2>
        ${p.descripcion_corta ? `<p class="font-body-sm text-body-sm text-on-surface-variant line-clamp-1 mt-0.5">${esc(p.descripcion_corta)}</p>` : ''}</div>
        ${agotado ? '' : `<button type="button" data-accion="fav" data-id="${p.id}" aria-label="Favorito" class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${favs.has(p.id) ? 'text-error' : 'text-on-surface-variant'}">${ico('favorite', 'text-[18px]', favs.has(p.id))}</button>`}</div>
      <div class="flex items-center justify-between gap-2">${bloquePrecio(p, true)}
        ${agotado ? `<button type="button" data-accion="avisar" data-id="${p.id}" class="h-8 px-3 rounded-lg bg-wa/15 text-[#136633] font-label-sm text-label-sm font-bold flex items-center gap-1">${ico('notifications', 'text-[15px] text-wa')} Avisar</button>`
          : `<button type="button" data-accion="agregar" data-id="${p.id}" class="h-8 px-3 rounded-lg ${disp.codigo === 'preventa' ? 'bg-surface-container-high text-primary' : 'bg-primary text-on-primary'} font-label-sm text-label-sm flex items-center gap-1 active:scale-95">${ico(disp.codigo === 'preventa' ? 'bookmark_add' : 'add', 'text-[16px]')} ${disp.codigo === 'preventa' ? 'Reservar' : 'Agregar'}</button>`}
      </div>
    </div></div>`;
}

/** Tarjeta compacta para "Completa tu equipo" y carruseles. */
export function tarjetaRelacionado(p) {
  const disp = disponibilidad(p, null, cfg().stock_bajo_umbral ?? 10);
  return `<div class="w-44 shrink-0 p-space-sm rounded-xl bg-surface-container-low shadow-sm flex flex-col justify-between">
    <a href="${urlProducto(p)}" class="aspect-square w-full rounded-lg overflow-hidden bg-surface-container mb-2 relative block"><img alt="${esc(p.nombre)}" class="w-full h-full object-cover" src="${esc(imgMini(p))}" loading="lazy"></a>
    <div class="flex flex-col gap-1">
      <h4 class="font-label-lg text-label-lg text-on-surface truncate"><a href="${urlProducto(p)}">${esc(p.nombre)}</a></h4>
      <span class="font-headline-sm text-headline-sm text-primary font-bold tnum">${precio(precioVigente(p))}</span>
      ${disp.codigo === 'agotado'
        ? `<button type="button" data-accion="avisar" data-id="${p.id}" class="mt-1 w-full py-1.5 px-2 rounded-lg bg-wa/15 text-[#136633] font-label-md text-label-md font-semibold flex items-center justify-center gap-1">${ico('notifications', 'text-[16px]')}<span>Avisar</span></button>`
        : `<button type="button" data-accion="agregar" data-id="${p.id}" class="mt-1 w-full py-1.5 px-2 rounded-lg bg-surface-container text-on-surface font-label-md text-label-md font-semibold hover:bg-primary hover:text-on-primary transition-colors flex items-center justify-center gap-1">${ico('add', 'text-[16px]')}<span>Añadir</span></button>`}
    </div></div>`;
}

export function esqueletoTarjetas(n = 4) {
  return Array.from({ length: n }, () => `<div class="rounded-xl bg-surface-container-lowest shadow-sm overflow-hidden">
    <div class="aspect-square esqueleto rounded-none"></div><div class="p-2.5 flex flex-col gap-2"><div class="h-3.5 esqueleto w-4/5"></div><div class="h-4 esqueleto w-1/3"></div><div class="h-8 esqueleto"></div></div></div>`).join('');
}

// ---------------- Hoja para elegir opción (productos con variantes) ----------------
function elegirOpcion(p) {
  return new Promise((resolver) => {
    const umbral = cfg().stock_bajo_umbral ?? 10;
    const capa = document.createElement('div');
    capa.className = 'fixed inset-0 z-[80] bg-[#0F172A]/40 backdrop-blur-[4px] flex items-end lg:items-center justify-center';
    capa.innerHTML = `<div role="dialog" aria-modal="true" aria-label="Elige una opción" class="w-full lg:max-w-md bg-surface rounded-t-3xl lg:rounded-3xl shadow-nivel3 p-space-md pb-[calc(1rem+env(safe-area-inset-bottom))] animate-subir">
        <div class="w-10 h-1.5 rounded-full bg-outline-variant mx-auto mb-3 lg:hidden"></div>
        <div class="flex items-center gap-3 mb-3">
          <img src="${esc(imgMini(p))}" alt="" class="w-14 h-14 rounded-lg object-cover bg-surface-container">
          <div class="min-w-0"><p class="font-subheading text-subheading text-on-surface line-clamp-2">${esc(p.nombre)}</p>
            <p class="font-body-sm text-body-sm text-on-surface-variant">Elige una opción</p></div>
        </div>
        <div class="grid grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto">
          ${p.variantes.map((v, i) => {
            const dv = disponibilidad(p, v, umbral);
            return `<button type="button" data-i="${i}" ${dv.comprable ? '' : 'disabled'} class="flex items-center gap-2 p-2.5 rounded-lg bg-surface-container-low shadow-sm text-left disabled:opacity-40 disabled:line-through hover:bg-surface-container-high">
              ${v.color ? `<span class="w-5 h-5 rounded-full shadow-sm shrink-0 ring-1 ring-black/10" style="background:${esc(v.color)}"></span>` : ''}
              <span class="flex-1 min-w-0"><span class="block font-label-md text-label-md text-on-surface truncate">${esc(v.nombre)}</span>
              <span class="block font-body-sm text-[11px] ${dv.comprable ? 'text-on-surface-variant' : 'text-error'}">${dv.comprable ? (num(v.precio_extra) ? `+ ${precio(v.precio_extra)}` : dv.codigo === 'pocas' ? `Quedan ${dv.stock}` : dv.texto) : 'Agotado'}</span></span></button>`;
          }).join('')}
        </div>
        <button type="button" data-cerrar class="mt-3 w-full h-11 rounded-xl font-label-lg text-label-lg text-on-surface-variant hover:bg-surface-container">Cancelar</button>
      </div>`;
    document.body.appendChild(capa);
    const cerrar = (valor) => { capa.remove(); resolver(valor); };
    capa.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b) cerrar(p.variantes[Number(b.dataset.i)]);
      else if (e.target === capa || e.target.closest('[data-cerrar]')) cerrar(null);
    });
    capa.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(null); });
    $('[data-i]:not([disabled])', capa)?.focus();
  });
}

/** Agrega un producto (pregunta la opción si tiene variantes). */
export async function agregarProducto(p, { cantidad = 1, variante = undefined, garantia = null, boton = null, pagina = null } = {}) {
  let v = variante;
  if (v === undefined) {
    if ((p.variantes || []).length > 1) {
      v = await elegirOpcion(p);
      if (!v) return false;
    } else v = p.variantes?.[0] || null;
  }
  const disp = disponibilidad(p, v, cfg().stock_bajo_umbral ?? 10);
  if (!disp.comprable) { toast('Esa opción está agotada', { icono: 'block', error: true }); return false; }
  const max = maximoPedido(p, v);
  agregarAlPedido({ producto_id: p.id, variante: v?.nombre || null, garantia: garantia ?? p.garantias?.[0]?.nombre ?? null, cantidad }, max);
  registrar('agregar_pedido', { producto: p.id, pagina });
  if (boton) {
    const antes = boton.innerHTML;
    boton.innerHTML = ico('check', 'text-[18px]');
    setTimeout(() => { boton.innerHTML = antes; }, 1100);
  }
  animarBolsa();
  toast(`"${p.nombre}${v ? ` · ${v.nombre}` : ''}" agregado a tu pedido`);
  return true;
}

export function avisarDisponibilidad(p, pagina = null) {
  registrar('aviso_stock', { producto: p.id, pagina });
  abrirWhatsApp(textoTienda(`Hola {tienda}, quiero que me avisen cuando vuelva a estar disponible: ${p.nombre} (SKU: ${p.sku}).`), { canal: 'aviso', producto: p.id, pagina });
}

/** Conecta los botones de las tarjetas dentro de un contenedor (delegación de eventos). */
export function conectarTarjetas(contenedor, { pagina = null, alCambiarFavorito = null } = {}) {
  contenedor.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    e.preventDefault();
    const p = datos().porId.get(b.dataset.id);
    if (!p) return;
    if (b.dataset.accion === 'agregar') await agregarProducto(p, { boton: b, pagina });
    else if (b.dataset.accion === 'avisar') avisarDisponibilidad(p, pagina);
    else if (b.dataset.accion === 'fav') {
      const activo = alternarFavorito(p.id);
      b.setAttribute('aria-pressed', String(activo));
      b.classList.toggle('text-error', activo);
      b.classList.toggle('text-on-surface', !activo);
      b.innerHTML = ico('favorite', b.querySelector('.material-symbols-outlined')?.className.match(/text-\[\d+px\]/)?.[0] || 'text-[16px]', activo);
      toast(activo ? 'Guardado en tus favoritos' : 'Quitado de favoritos', { icono: activo ? 'favorite' : 'heart_broken' });
      alCambiarFavorito?.(p, activo);
    }
  });
}
