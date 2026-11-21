// Ficha completa del producto (diseño "Detalle de producto" de Stitch) con pedido por WhatsApp.
import { $, $$, esc, ico, num, markdown, plantilla, ofertaVigente, precioVigente, descuentoPct, disponibilidad, maximoPedido, copiar, fecha } from '../util.js';
import { urlImagen, ruta } from '../api.js';
import { iniciarTienda, precio, abrirWhatsApp, toast, textoTienda } from './base.js';
import { params, registrar } from './estado.js';
import { agregarProducto, avisarDisponibilidad, tarjetaRelacionado, conectarTarjetas } from './tarjetas.js';
import { estrellas, resumenResenas, resenaHtml, claseColor } from './secciones.js';

const d = await iniciarTienda({ pagina: 'catalogo', subtitulo: 'Detalle Producto', encabezado: 'detalle', tituloDetalle: 'Detalle Producto' });
const c = d.cfg;
const umbral = c.stock_bajo_umbral ?? 10;
const p = d.porSlug.get(params.get('p') || '') || d.porId.get(params.get('id') || '');
const ficha = $('#ficha');

if (!p) {
  document.title = `Producto no encontrado · ${c.nombre}`;
  ficha.innerHTML = `<div class="max-w-md mx-auto px-6 py-20 text-center flex flex-col items-center gap-3">
    ${ico('inventory_2', 'text-[48px] text-outline')}
    <h1 class="font-headline-md text-headline-md">Este producto no está disponible</h1>
    <p class="font-body-md text-body-md text-on-surface-variant">Puede que lo hayan retirado o que el enlace esté incompleto.</p>
    <a href="${ruta('catalogo.html')}" class="btn-primario mt-2">${ico('grid_view', 'text-[18px]')} Ver el catálogo</a></div>`;
  throw new Error('Producto no encontrado');
}

registrar('vista_producto', { pagina: 'producto', producto: p.id });
document.title = `${p.nombre} · ${c.nombre}`;
document.querySelector('meta[name="description"]')?.setAttribute('content', p.descripcion_corta || p.nombre);

const cat = d.catPorId.get(p.categoria_id);
const imagenes = (p.imagenes || []).length ? p.imagenes : [{ url: 'assets/img/logo.svg', alt: p.nombre }];
const variantes = p.variantes || [];
const garantias = p.garantias || [];
const resenas = d.testimonios.filter((t) => t.producto_id === p.id);
const resumen = resumenResenas(resenas);

const estado = {
  img: 0,
  variante: variantes.find((v) => disponibilidad(p, v, umbral).comprable) || variantes[0] || null,
  garantia: garantias[0] || null,
  cantidad: 1,
  pestana: 'desc',
};

const etiquetaVariante = variantes.some((v) => v.color) ? 'Color' : variantes.every((v) => /^talla/i.test(v.nombre)) ? 'Talla' : 'Opción';
const unitario = () => precioVigente(p) + num(estado.variante?.precio_extra) + num(estado.garantia?.precio_extra);
const unitarioSinOferta = () => num(p.precio) + num(estado.variante?.precio_extra) + num(estado.garantia?.precio_extra);
const disp = () => disponibilidad(p, estado.variante, umbral);
const maximo = () => maximoPedido(p, estado.variante);
const skuActual = () => estado.variante?.sku || p.sku;
const envioGratis = p.envio_gratis || (c.envio_gratis_desde != null && precioVigente(p) >= num(c.envio_gratis_desde));

function mensajeWhatsApp() {
  const opciones = [estado.variante ? `${etiquetaVariante.toLowerCase()}: ${estado.variante.nombre}` : '', estado.garantia && num(estado.garantia.precio_extra) ? `garantía: ${estado.garantia.nombre}` : '']
    .filter(Boolean).join(', ');
  if (disp().codigo === 'agotado') return textoTienda(`Hola {tienda}, quiero que me avisen cuando vuelva a estar disponible: ${p.nombre} (SKU: ${skuActual()})${opciones ? `, ${opciones}` : ''}.`);
  return plantilla(c.plantilla_producto || 'Hola {tienda}, me interesa el producto: {producto} (SKU: {sku}){opciones}. Cantidad: {cantidad} por {total}. ¿Tienen disponibilidad inmediata?', {
    tienda: c.nombre, producto: p.nombre, sku: skuActual(), opciones: opciones ? `, ${opciones}` : '', cantidad: estado.cantidad,
    total: precio(unitario() * estado.cantidad), precio: precio(unitario()), enlace: location.href.split('#')[0],
  });
}

// ---------------- Plantilla ----------------
function insigniasImagen() {
  const dd = disp();
  const estilos = {
    disponible: ['bg-secondary-container text-on-secondary-fixed', 'bg-secondary', 'Disponible en Stock'],
    pocas: ['bg-[#FEF3C7] text-[#92400E]', 'bg-[#F59E0B]', 'Pocas unidades'],
    agotado: ['bg-error-container text-on-error-container', 'bg-error', 'Agotado'],
    preventa: ['bg-tertiary-fixed text-on-tertiary-fixed', 'bg-tertiary', 'Preventa'],
    consulta: ['bg-tertiary-fixed text-on-tertiary-fixed', 'bg-tertiary', 'Bajo pedido'],
  }[dd.codigo];
  return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full ${estilos[0]} shadow-sm font-label-md text-label-md"><span class="w-2 h-2 rounded-full ${estilos[1]}"></span>${estilos[2]}</span>
    ${envioGratis ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-tertiary-fixed text-on-tertiary-fixed shadow-sm font-label-md text-label-md">${ico('local_shipping', 'text-[14px]')}Envío Gratis</span>` : ''}
    ${p.relampago && ofertaVigente(p) ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FEF3C7] text-[#92400E] shadow-sm font-label-md text-label-md">${ico('bolt', 'text-[14px]', true)}Oferta relámpago</span>` : ''}`;
}

function htmlGaleria() {
  return `<section class="p-space-md lg:p-0 flex flex-col gap-space-sm lg:sticky lg:top-24" aria-label="Fotos del producto">
    <div class="relative w-full aspect-square rounded-xl overflow-hidden bg-surface-container shadow-md group" id="marcoImagen">
      <img id="imagenPrincipal" alt="${esc(imagenes[0].alt || p.nombre)}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 ${disp().codigo === 'agotado' ? 'grayscale-[35%]' : ''}" src="${esc(urlImagen(imagenes[0].url))}" fetchpriority="high">
      <div id="insignias" class="absolute top-space-sm left-space-sm flex flex-col gap-1.5 items-start pointer-events-none">${insigniasImagen()}</div>
      <button type="button" id="ampliar" aria-label="Ampliar imagen" class="absolute bottom-space-sm right-space-sm w-10 h-10 rounded-full bg-surface/90 backdrop-blur-md text-on-surface flex items-center justify-center shadow-md active:scale-95 transition-transform">${ico('zoom_in', 'text-[20px]')}</button>
      ${imagenes.length > 1 ? `<span id="indiceImagen" class="absolute bottom-space-sm left-space-sm px-2 py-0.5 rounded-full bg-inverse-surface/70 text-inverse-on-surface font-label-sm text-label-sm tnum">1/${imagenes.length}</span>` : ''}
    </div>
    ${imagenes.length > 1 ? `<div class="flex items-center gap-2 overflow-x-auto no-scrollbar py-1" role="tablist" aria-label="Miniaturas">
      ${imagenes.map((im, i) => `<button type="button" role="tab" data-miniatura="${i}" aria-selected="${i === 0}" aria-label="Foto ${i + 1}" class="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-surface-container shadow-sm p-0.5 transition-all ${i === 0 ? 'bg-primary-container' : 'opacity-70 hover:opacity-100'}">
        <img alt="" class="w-full h-full object-cover rounded-lg" src="${esc(urlImagen(im.mini || im.url))}" loading="lazy"></button>`).join('')}</div>` : ''}
  </section>`;
}

function htmlPrecio() {
  const oferta = ofertaVigente(p);
  return `<div class="flex items-baseline gap-space-sm flex-wrap">
      <span class="font-display-hero-mobile text-display-hero-mobile text-primary font-black tracking-tight tnum">${precio(unitario())}</span>
      ${oferta ? `<span class="font-headline-sm text-headline-sm text-on-surface-variant line-through opacity-70 tnum">${precio(unitarioSinOferta())}</span>
        <span class="px-2.5 py-0.5 rounded-full bg-error-container text-on-error-container font-label-md text-label-md font-bold self-center">-${descuentoPct(p)}% Especial</span>` : ''}
    </div>
    ${estado.cantidad > 1 ? `<p class="font-label-lg text-label-lg text-on-surface tnum">Total por ${estado.cantidad}: ${precio(unitario() * estado.cantidad)}</p>` : ''}
    ${oferta && p.oferta_fin ? `<p class="font-body-sm text-body-sm text-error flex items-center gap-1">${ico('timer', 'text-[16px]')} Oferta válida hasta el ${esc(fecha(`${p.oferta_fin}T12:00:00`, { day: 'numeric', month: 'long' }))}</p>` : ''}
    ${c.nota_precios ? `<p class="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1">${ico('verified_user', 'text-[16px] text-secondary')}${esc(c.nota_precios)}</p>` : ''}`;
}

function htmlVariantes() {
  if (!variantes.length) return '';
  const conColor = variantes.some((v) => v.color);
  return `<div class="flex flex-col gap-2">
    <div class="flex items-center justify-between"><span class="font-label-lg text-label-lg text-on-surface">${etiquetaVariante}:</span>
      <span class="font-body-sm text-body-sm text-primary font-semibold" id="nombreVariante">${esc(estado.variante?.nombre || '')}</span></div>
    <div class="grid ${conColor ? 'grid-cols-3' : 'grid-cols-4 sm:grid-cols-6'} gap-2" role="radiogroup" aria-label="${etiquetaVariante}">
      ${variantes.map((v, i) => {
        const dv = disponibilidad(p, v, umbral);
        const activo = estado.variante === v;
        const corto = conColor ? v.nombre.split(' ')[0] : v.nombre.replace(/^talla\s+/i, '');
        return `<button type="button" role="radio" aria-checked="${activo}" data-variante="${i}" title="${esc(v.nombre)}${dv.comprable ? '' : ' · Agotado'}"
          class="relative flex items-center ${conColor ? 'gap-2 p-2.5 text-left' : 'justify-center p-2.5'} rounded-lg shadow-sm transition-all ${activo ? 'bg-surface-container-high ring-2 ring-primary font-bold' : 'bg-surface-container-low hover:bg-surface-container'} ${dv.comprable ? '' : 'opacity-45'}">
          ${conColor ? `<span class="w-5 h-5 rounded-full shadow-sm shrink-0 ring-1 ring-black/10" style="background:${esc(v.color || '#e2e8f0')}"></span>` : ''}
          <span class="font-label-md text-label-md text-on-surface truncate ${dv.comprable ? '' : 'line-through'}">${esc(corto)}</span>
          ${num(v.precio_extra) ? `<span class="absolute -top-2 -right-1 px-1.5 rounded-full bg-primary text-on-primary text-[10px] font-bold">+${precio(v.precio_extra)}</span>` : ''}
        </button>`;
      }).join('')}
    </div></div>`;
}

function htmlGarantias() {
  if (garantias.length < 2) return '';
  return `<div class="flex flex-col gap-2"><span class="font-label-lg text-label-lg text-on-surface">Garantía / Cobertura:</span>
    <div class="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Garantía">
      ${garantias.map((g, i) => {
        const activo = estado.garantia === g;
        return `<button type="button" role="radio" aria-checked="${activo}" data-garantia="${i}" class="p-3 rounded-lg shadow-sm text-left flex flex-col justify-between transition-all ${activo ? 'bg-surface-container-high ring-2 ring-primary' : 'bg-surface-container-low hover:bg-surface-container'}">
          <span class="font-label-md text-label-md text-on-surface font-semibold">${esc(g.nombre)}</span>
          <span class="font-body-sm text-body-sm ${num(g.precio_extra) ? 'text-primary font-bold' : 'text-secondary font-medium'}">${num(g.precio_extra) ? `+ ${precio(g.precio_extra)}` : 'Incluida'}</span></button>`;
      }).join('')}
    </div></div>`;
}

function htmlCantidad() {
  const dd = disp();
  if (dd.codigo === 'agotado') {
    return `<div class="flex items-center gap-2 p-space-sm rounded-lg bg-error-container/60 text-on-error-container">${ico('block', 'text-[20px]')}
      <span class="font-label-lg text-label-lg">${variantes.length ? 'Esta opción está agotada.' : 'Producto agotado por ahora.'} Te avisamos por WhatsApp cuando llegue.</span></div>`;
  }
  const nota = dd.codigo === 'preventa' ? `${ico('event_upcoming', 'text-[14px]')} Preventa: entrega estimada en 7 a 10 días hábiles`
    : dd.codigo === 'consulta' ? `${ico('schedule', 'text-[14px]')} Bajo pedido: confirmamos el tiempo de entrega por WhatsApp`
    : dd.codigo === 'pocas' ? `<span class="w-1.5 h-1.5 rounded-full bg-error animate-ping"></span> Quedan ${dd.stock} ${dd.stock === 1 ? 'unidad' : 'unidades'} en bodega`
    : dd.stock != null ? `<span class="w-1.5 h-1.5 rounded-full bg-secondary"></span> ${dd.stock} disponibles para envío inmediato` : `<span class="w-1.5 h-1.5 rounded-full bg-secondary"></span> Disponible para envío inmediato`;
  return `<div class="flex items-center justify-between p-space-sm rounded-lg bg-surface-container-lowest shadow-sm">
    <div class="flex flex-col"><span class="font-label-lg text-label-lg text-on-surface">Cantidad:</span>
      <span class="font-body-sm text-body-sm ${dd.codigo === 'pocas' ? 'text-error' : dd.codigo === 'disponible' ? 'text-secondary' : 'text-tertiary'} font-medium flex items-center gap-1">${nota}</span></div>
    <div class="flex items-center bg-surface-container rounded-lg p-1">
      <button type="button" data-cantidad="-1" aria-label="Disminuir cantidad" class="w-9 h-9 flex items-center justify-center rounded-md bg-surface-container-lowest text-on-surface shadow-sm active:scale-90 transition-transform disabled:opacity-40" ${estado.cantidad <= 1 ? 'disabled' : ''}>${ico('remove', 'text-[18px]')}</button>
      <span class="w-10 text-center font-headline-sm text-headline-sm text-on-surface tnum" aria-live="polite">${estado.cantidad}</span>
      <button type="button" data-cantidad="1" aria-label="Aumentar cantidad" class="w-9 h-9 flex items-center justify-center rounded-md bg-surface-container-lowest text-on-surface shadow-sm active:scale-90 transition-transform disabled:opacity-40" ${estado.cantidad >= maximo() ? 'disabled' : ''}>${ico('add', 'text-[18px]')}</button>
    </div></div>`;
}

const SVG_WA = '<svg class="w-6 h-6 fill-current shrink-0" viewBox="0 0 24 24" aria-hidden="true"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>';

function htmlAcciones() {
  const agotado = disp().codigo === 'agotado';
  const reservar = disp().codigo === 'preventa';
  return `<a href="#" id="pedirWhatsApp" class="w-full flex items-center justify-center gap-3 py-3.5 px-space-md rounded-xl ${agotado ? 'bg-wa/15 text-[#136633]' : 'bg-wa hover:bg-wa-hover text-white shadow-[0_8px_24px_-4px_rgba(37,211,102,0.4)]'} active:scale-[0.98] transition-all">
      ${SVG_WA}<span class="font-headline-sm text-headline-sm font-bold tracking-wide">${agotado ? 'Avisarme cuando llegue' : 'Pedir por WhatsApp ahora'}</span></a>
    <div class="p-space-sm rounded-lg bg-surface-container text-on-surface-variant flex items-start gap-2 text-left">
      ${ico('chat_bubble', 'text-[18px] text-primary shrink-0 mt-0.5')}
      <div class="flex-1 min-w-0"><span class="font-label-sm text-label-sm uppercase font-bold text-primary block">Mensaje predeterminado:</span>
        <p class="font-body-sm text-body-sm text-on-surface italic line-clamp-3" id="vistaMensaje">"${esc(mensajeWhatsApp())}"</p></div>
    </div>
    <button type="button" id="agregar" ${agotado ? 'disabled' : ''} class="w-full flex items-center justify-center gap-2 py-3 px-space-md rounded-xl bg-surface-container-highest text-primary font-headline-sm text-headline-sm font-bold shadow-sm active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none">
      ${ico(reservar ? 'bookmark_add' : 'shopping_bag', 'text-[20px]')}<span>${reservar ? 'Reservar en mi Pedido' : 'Agregar a mi Pedido'}</span></button>`;
}

function htmlPestanas() {
  const especificaciones = [
    p.marca && ['Marca', p.marca], p.modelo && ['Modelo', p.modelo], p.material && ['Material', p.material], p.peso && ['Peso', p.peso],
    ...(p.especificaciones || []).map((s) => [s.nombre, s.valor]),
  ].filter(Boolean);
  const pestanas = [['desc', 'Descripción'], ['specs', 'Especificaciones'], ['envios', 'Garantía & Envíos']];
  const ge = d.contenido.garantia_envios || [];
  return `<section class="mt-space-md px-space-md lg:px-0 flex flex-col gap-space-sm" aria-label="Información del producto">
    <div class="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1" role="tablist">
      ${pestanas.map(([id, t]) => `<button type="button" role="tab" data-pestana="${id}" aria-selected="${estado.pestana === id}" class="px-4 py-2 rounded-full font-label-lg text-label-lg shrink-0 transition-all ${estado.pestana === id ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface-container text-on-surface-variant hover:text-on-surface'}">${t}</button>`).join('')}
    </div>
    <div data-panel="desc" role="tabpanel" class="${estado.pestana === 'desc' ? '' : 'hidden'} p-space-md rounded-xl bg-surface-container-low shadow-sm flex flex-col gap-space-sm text-on-surface">
      ${p.descripcion ? `<div class="prosa">${markdown(p.descripcion)}</div>` : `<p class="prosa">${esc(p.descripcion_corta || 'Pronto agregaremos más detalles. Pregúntanos por WhatsApp.')}</p>`}
      ${(p.destacados || []).length ? `<div class="grid grid-cols-2 gap-2 mt-2">${p.destacados.map((x) => `<div class="p-space-sm rounded-lg bg-surface-container flex items-center gap-2">
        ${ico(x.icono || 'verified', 'text-primary text-[22px]')}<div class="min-w-0"><span class="font-label-md text-label-md font-bold block">${esc(x.titulo)}</span>
        <span class="font-body-sm text-body-sm text-on-surface-variant">${esc(x.detalle || '')}</span></div></div>`).join('')}</div>` : ''}
      ${(p.etiquetas || []).length ? `<div class="flex flex-wrap gap-1.5 pt-1">${p.etiquetas.map((t) => `<a href="${ruta(`catalogo.html?q=${encodeURIComponent(t)}`)}" class="px-2.5 py-1 rounded-full bg-surface-container-lowest text-on-surface-variant font-label-sm text-label-sm hover:text-primary">#${esc(t)}</a>`).join('')}</div>` : ''}
    </div>
    <div data-panel="specs" role="tabpanel" class="${estado.pestana === 'specs' ? '' : 'hidden'} p-space-md rounded-xl bg-surface-container-low shadow-sm flex flex-col gap-2 text-on-surface">
      <h3 class="font-subheading text-subheading text-on-surface font-bold mb-1">Ficha Técnica Oficial</h3>
      <div class="flex flex-col gap-1.5 font-body-sm text-body-sm">
        ${[['SKU', skuActual()], ...especificaciones].map(([k, v], i) => `<div class="flex justify-between gap-4 py-1.5 px-2 rounded ${i % 2 ? 'bg-surface-container-lowest' : 'bg-surface-container'}">
          <span class="text-on-surface-variant shrink-0">${esc(k)}</span><span class="font-semibold text-on-surface text-right" ${k === 'SKU' ? 'data-sku' : ''}>${esc(v)}</span></div>`).join('')}
      </div></div>
    <div data-panel="envios" role="tabpanel" class="${estado.pestana === 'envios' ? '' : 'hidden'} p-space-md rounded-xl bg-surface-container-low shadow-sm flex flex-col gap-space-sm text-on-surface">
      ${ge.map((x, i) => `<div class="flex items-start gap-3 ${i ? 'mt-2' : ''}">${ico(x.icono || 'verified', `text-[24px] shrink-0 ${claseColor(x.color).split(' ').find((k) => k.startsWith('text-'))}`)}
        <div><span class="font-label-lg text-label-lg font-bold block">${esc(x.titulo)}</span><p class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">${esc(x.texto)}</p></div></div>`).join('')}
      ${c.envio_gratis_desde != null ? `<p class="font-body-sm text-body-sm text-primary font-semibold flex items-center gap-1 mt-1">${ico('local_shipping', 'text-[16px]')} Envío gratis en pedidos desde ${precio(c.envio_gratis_desde)}</p>` : ''}
    </div>
  </section>`;
}

function htmlRelacionados() {
  let rel = (p.relacionados || []).map((id) => d.porId.get(id)).filter(Boolean);
  if (rel.length < 2) rel = rel.concat(d.productos.filter((x) => x.id !== p.id && x.categoria_id === p.categoria_id && !rel.includes(x)).sort((a, b) => b.ventas - a.ventas)).slice(0, 6);
  if (!rel.length) return '';
  const corto = p.nombre.split(' ').slice(0, 2).join(' ');
  return `<section class="mt-space-lg px-space-md lg:px-0 pb-space-lg flex flex-col gap-space-sm" aria-labelledby="tituloRel">
    <div class="flex items-center justify-between"><div>
      <h3 id="tituloRel" class="font-headline-sm text-headline-sm text-on-surface font-bold">${(p.relacionados || []).length ? 'Completa tu equipo' : 'También te puede gustar'}</h3>
      <span class="font-body-sm text-body-sm text-on-surface-variant">${(p.relacionados || []).length ? `Recomendados para tu ${esc(corto)}` : `Más de ${esc(cat?.nombre || 'la tienda')}`}</span></div>
      <a href="${ruta(cat ? `catalogo.html?cat=${cat.slug}` : 'catalogo.html')}" aria-label="Ver más">${ico('arrow_forward', 'text-primary')}</a></div>
    <div id="relacionados" class="flex items-stretch gap-space-sm overflow-x-auto no-scrollbar py-2">${rel.map(tarjetaRelacionado).join('')}</div>
  </section>`;
}

function htmlResenas() {
  if (!resenas.length) return '';
  return `<section class="mt-space-lg px-space-md lg:px-0 flex flex-col gap-space-sm"><h3 class="font-headline-sm text-headline-sm text-on-surface font-bold">Opiniones de clientes</h3>
    ${resenas.slice(0, 3).map(resenaHtml).join('')}</section>`;
}

function pintar() {
  ficha.innerHTML = `
    <div class="px-space-md lg:px-margin-desktop py-space-sm flex items-center justify-between bg-surface-container-low lg:bg-transparent text-on-surface-variant">
      <nav class="flex items-center gap-1 font-label-md text-label-md overflow-x-auto no-scrollbar whitespace-nowrap py-1" aria-label="Ruta">
        <a href="${ruta('index.html')}" class="hover:text-primary transition-colors">Inicio</a>${ico('chevron_right', 'text-[14px]')}
        ${cat ? `<a href="${ruta(`catalogo.html?cat=${cat.slug}`)}" class="hover:text-primary transition-colors">${esc(cat.nombre)}</a>${ico('chevron_right', 'text-[14px]')}` : ''}
        <span class="text-on-surface font-semibold truncate max-w-[160px] lg:max-w-none" aria-current="page">${esc(p.nombre)}</span>
      </nav>
      <button type="button" data-compartir aria-label="Compartir producto" class="p-2 rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors flex items-center justify-center shrink-0">${ico('share', 'text-[18px]')}</button>
    </div>
    <div class="lg:grid lg:grid-cols-2 lg:gap-10 lg:px-margin-desktop lg:pt-2 lg:items-start">
      ${htmlGaleria()}
      <div>
        <section class="px-space-md lg:px-0 py-space-sm flex flex-col gap-space-md">
          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between font-label-md text-label-md text-on-surface-variant gap-2">
              <span class="font-bold tracking-wide uppercase text-primary">${esc(p.marca || cat?.nombre || '')}</span><span class="tnum" data-sku>SKU: ${esc(skuActual())}</span></div>
            <h1 class="font-headline-md text-headline-md lg:text-[28px] lg:leading-9 text-on-surface leading-tight">${esc(p.nombre)}</h1>
            ${resumen ? `<a href="#opiniones" class="flex items-center gap-2 mt-1"><div class="flex items-center text-secondary">${estrellas(resumen.promedio, 'text-[18px]')}</div>
              <span class="font-label-md text-label-md font-bold text-on-surface">${resumen.promedio.toFixed(1)}</span>
              <span class="font-body-sm text-body-sm text-on-surface-variant">(${resumen.total} ${resumen.total === 1 ? 'reseña de cliente' : 'reseñas de clientes'})</span></a>` : ''}
            ${p.descripcion_corta ? `<p class="font-body-md text-body-md text-on-surface-variant mt-1">${esc(p.descripcion_corta)}</p>` : ''}
          </div>
          <div id="bloquePrecio" class="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-2 shadow-sm">${htmlPrecio()}</div>
          <div class="flex flex-col gap-space-md">
            <div id="bloqueVariantes">${htmlVariantes()}</div>
            <div id="bloqueGarantias">${htmlGarantias()}</div>
            <div id="bloqueCantidad">${htmlCantidad()}</div>
          </div>
        </section>
        <section id="acciones" class="p-space-md lg:px-0 flex flex-col gap-space-sm">${htmlAcciones()}</section>
        ${htmlPestanas()}
        <div id="opiniones">${htmlResenas()}</div>
      </div>
    </div>
    <div class="lg:px-margin-desktop">${htmlRelacionados()}</div>`;
  if ($('#relacionados')) conectarTarjetas($('#relacionados'), { pagina: 'producto' });
  observarAcciones();
}

/** Repinta sólo las partes que cambian al elegir opción o cantidad (sin perder el scroll). */
function refrescar() {
  $('#bloquePrecio').innerHTML = htmlPrecio();
  $('#bloqueVariantes').innerHTML = htmlVariantes();
  $('#bloqueGarantias').innerHTML = htmlGarantias();
  $('#bloqueCantidad').innerHTML = htmlCantidad();
  $('#acciones').innerHTML = htmlAcciones();
  $('#insignias').innerHTML = insigniasImagen();
  $$('[data-sku]').forEach((el) => { el.textContent = el.closest('.flex.justify-between.gap-4') ? skuActual() : `SKU: ${skuActual()}`; });
  $('#imagenPrincipal').classList.toggle('grayscale-[35%]', disp().codigo === 'agotado');
  pintarBarra();
}

function cambiarImagen(i) {
  estado.img = (i + imagenes.length) % imagenes.length;
  const img = $('#imagenPrincipal');
  img.src = urlImagen(imagenes[estado.img].url);
  img.alt = imagenes[estado.img].alt || p.nombre;
  $$('[data-miniatura]').forEach((b, k) => {
    b.setAttribute('aria-selected', String(k === estado.img));
    b.classList.toggle('bg-primary-container', k === estado.img);
    b.classList.toggle('opacity-70', k !== estado.img);
  });
  if ($('#indiceImagen')) $('#indiceImagen').textContent = `${estado.img + 1}/${imagenes.length}`;
}

function abrirVisor() {
  const capa = document.createElement('div');
  capa.className = 'fixed inset-0 z-[90] bg-black/90 flex items-center justify-center animate-entrar';
  capa.setAttribute('role', 'dialog');
  capa.setAttribute('aria-label', 'Fotos ampliadas');
  const pintarVisor = () => {
    capa.innerHTML = `<img src="${esc(urlImagen(imagenes[estado.img].url))}" alt="${esc(imagenes[estado.img].alt || p.nombre)}" class="max-w-full max-h-full object-contain select-none">
      <button type="button" data-cerrar aria-label="Cerrar" class="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/15 text-white flex items-center justify-center">${ico('close')}</button>
      ${imagenes.length > 1 ? `<button type="button" data-mover="-1" aria-label="Anterior" class="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 text-white flex items-center justify-center">${ico('chevron_left')}</button>
      <button type="button" data-mover="1" aria-label="Siguiente" class="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 text-white flex items-center justify-center">${ico('chevron_right')}</button>
      <span class="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/80 font-label-md text-label-md tnum">${estado.img + 1} / ${imagenes.length}</span>` : ''}`;
  };
  pintarVisor();
  document.body.appendChild(capa);
  document.body.style.overflow = 'hidden';
  const cerrar = () => { capa.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', teclas); };
  const mover = (n) => { cambiarImagen(estado.img + n); pintarVisor(); };
  const teclas = (e) => { if (e.key === 'Escape') cerrar(); if (e.key === 'ArrowRight') mover(1); if (e.key === 'ArrowLeft') mover(-1); };
  document.addEventListener('keydown', teclas);
  capa.addEventListener('click', (e) => {
    const m = e.target.closest('[data-mover]');
    if (m) mover(Number(m.dataset.mover));
    else if (e.target.closest('[data-cerrar]') || e.target === capa) cerrar();
  });
  deslizar(capa, mover);
}

function deslizar(el, alMover) {
  let x0 = null;
  el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 45) alMover(dx < 0 ? 1 : -1);
    x0 = null;
  });
}

// ---------------- Barra fija inferior (móvil) ----------------
let observador;
function observarAcciones() {
  observador?.disconnect();
  const acciones = $('#acciones');
  if (!acciones || !('IntersectionObserver' in window)) return;
  observador = new IntersectionObserver(([entrada]) => {
    $('#barraFija')?.classList.toggle('translate-y-[150%]', entrada.isIntersecting || entrada.boundingClientRect.top > 0);
  });
  observador.observe(acciones);
}
function pintarBarra() {
  let barra = $('#barraFija');
  if (!barra) {
    barra = document.createElement('div');
    barra.id = 'barraFija';
    barra.className = 'lg:hidden fixed left-0 right-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 px-3 pb-2 transition-transform duration-300 translate-y-[150%]';
    document.body.appendChild(barra);
  }
  const agotado = disp().codigo === 'agotado';
  barra.innerHTML = `<div class="flex items-center gap-2 p-2 pl-3 rounded-2xl bg-surface-container-lowest shadow-nivel3 border border-[#E2E8F0]">
    <div class="flex-1 min-w-0"><p class="font-label-sm text-label-sm text-on-surface-variant truncate">${esc(p.nombre)}</p>
      <p class="font-headline-sm text-headline-sm text-primary tnum leading-tight">${precio(unitario())}</p></div>
    ${agotado ? '' : `<button type="button" data-barra="agregar" aria-label="Agregar a mi pedido" class="w-11 h-11 rounded-xl bg-surface-container-highest text-primary flex items-center justify-center">${ico('add_shopping_cart', 'text-[22px]')}</button>`}
    <button type="button" data-barra="wa" class="h-11 px-4 rounded-xl bg-wa text-white font-label-lg text-label-lg flex items-center gap-1.5 shadow-wa">${ico(agotado ? 'notifications' : 'chat', 'text-[20px]', true)}${agotado ? 'Avisarme' : 'Pedir'}</button></div>`;
}

// ---------------- Eventos ----------------
async function agregar() {
  const ok = await agregarProducto(p, { cantidad: estado.cantidad, variante: estado.variante, garantia: estado.garantia?.nombre || null, pagina: 'producto' });
  if (ok) { estado.cantidad = 1; refrescar(); }
}
function pedirPorWhatsApp() {
  if (disp().codigo === 'agotado') { avisarDisponibilidad(p, 'producto'); return; }
  abrirWhatsApp(mensajeWhatsApp(), { canal: 'producto', producto: p.id, pagina: 'producto' });
}

document.addEventListener('click', async (e) => {
  const mini = e.target.closest('[data-miniatura]');
  if (mini) { cambiarImagen(Number(mini.dataset.miniatura)); return; }
  if (e.target.closest('#ampliar')) { abrirVisor(); return; }
  const v = e.target.closest('[data-variante]');
  if (v) {
    estado.variante = variantes[Number(v.dataset.variante)];
    estado.cantidad = Math.max(1, Math.min(estado.cantidad, maximo() || 1));
    refrescar(); return;
  }
  const g = e.target.closest('[data-garantia]');
  if (g) { estado.garantia = garantias[Number(g.dataset.garantia)]; refrescar(); return; }
  const cant = e.target.closest('[data-cantidad]');
  if (cant) {
    const siguiente = estado.cantidad + Number(cant.dataset.cantidad);
    if (siguiente > maximo()) { toast(`Sólo quedan ${maximo()} unidades disponibles`, { icono: 'inventory_2' }); return; }
    estado.cantidad = Math.max(1, siguiente);
    refrescar(); return;
  }
  if (e.target.closest('#pedirWhatsApp')) { e.preventDefault(); pedirPorWhatsApp(); return; }
  if (e.target.closest('#agregar')) { await agregar(); return; }
  const barra = e.target.closest('[data-barra]');
  if (barra) { if (barra.dataset.barra === 'wa') pedirPorWhatsApp(); else await agregar(); return; }
  const pest = e.target.closest('[data-pestana]');
  if (pest) {
    estado.pestana = pest.dataset.pestana;
    $$('[data-pestana]').forEach((b) => {
      const activo = b.dataset.pestana === estado.pestana;
      b.setAttribute('aria-selected', String(activo));
      b.className = `px-4 py-2 rounded-full font-label-lg text-label-lg shrink-0 transition-all ${activo ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface-container text-on-surface-variant hover:text-on-surface'}`;
    });
    $$('[data-panel]').forEach((el) => el.classList.toggle('hidden', el.dataset.panel !== estado.pestana));
    return;
  }
  if (e.target.closest('[data-compartir]')) {
    const datosCompartir = { title: p.nombre, text: `Mira ${p.nombre} en ${c.nombre} por ${precio(unitario())}`, url: location.href.replace(/[?&]vista_previa=1/, '') };
    if (navigator.share) navigator.share(datosCompartir).catch(() => {});
    else if (await copiar(datosCompartir.url)) toast('Enlace del producto copiado', { icono: 'link' });
  }
});

pintar();
pintarBarra();
deslizar($('#marcoImagen'), (n) => cambiarImagen(estado.img + n));
