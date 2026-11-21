// Bloques de contenido reutilizados en varias páginas: preguntas frecuentes, reseñas y beneficios.
import { esc, ico, markdown, iniciales, num, plantilla } from '../util.js';

const COLORES = {
  whatsapp: 'bg-wa/15 text-wa-hover', primary: 'bg-primary/10 text-primary', tertiary: 'bg-tertiary/10 text-tertiary',
  secondary: 'bg-secondary/10 text-secondary', amber: 'bg-[#FEF3C7] text-[#B45309]', error: 'bg-error/10 text-error',
};
export const claseColor = (c) => COLORES[c] || COLORES.primary;

export function faqHtml(items = []) {
  return items.map((f, i) => `<div class="rounded-xl bg-surface-container-lowest overflow-hidden shadow-sm">
      <button type="button" data-faq aria-expanded="false" aria-controls="faq-${i}" class="w-full p-space-md text-left flex items-center justify-between gap-space-sm font-subheading text-subheading text-on-surface">
        <span>${esc(f.pregunta)}</span>${ico('expand_more', 'transition-transform duration-200 text-outline shrink-0')}</button>
      <div id="faq-${i}" class="max-h-0 overflow-hidden transition-all duration-300 px-space-md" role="region">
        <div class="prosa pb-space-md">${markdown(f.respuesta)}</div></div></div>`).join('');
}

export function conectarFaq(contenedor) {
  contenedor.addEventListener('click', (e) => {
    const boton = e.target.closest('[data-faq]');
    if (!boton) return;
    const abierto = boton.getAttribute('aria-expanded') === 'true';
    contenedor.querySelectorAll('[data-faq]').forEach((b) => {
      b.setAttribute('aria-expanded', 'false');
      b.nextElementSibling.style.maxHeight = null;
      b.querySelector('.material-symbols-outlined').style.transform = '';
    });
    if (!abierto) {
      boton.setAttribute('aria-expanded', 'true');
      boton.nextElementSibling.style.maxHeight = `${boton.nextElementSibling.scrollHeight}px`;
      boton.querySelector('.material-symbols-outlined').style.transform = 'rotate(180deg)';
    }
  });
}

export const estrellas = (n, clases = 'text-[16px]') =>
  Array.from({ length: 5 }, (_, i) => ico(n >= i + 1 ? 'star' : n > i ? 'star_half' : 'star', `${clases} ${n > i ? '' : 'opacity-30'}`, true)).join('');

export function resumenResenas(testimonios) {
  if (!testimonios.length) return null;
  const promedio = testimonios.reduce((s, t) => s + num(t.estrellas), 0) / testimonios.length;
  return { promedio: Math.round(promedio * 10) / 10, total: testimonios.length };
}

export function resenaHtml(t, indice = 0) {
  const colores = ['text-primary', 'text-tertiary', 'text-secondary'];
  const detalle = [t.producto_texto ? `Compró ${t.producto_texto}` : '', t.ciudad].filter(Boolean).join(' • ');
  return `<div class="p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-2">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center font-bold ${colores[indice % 3]} font-headline-sm text-headline-sm shrink-0">${esc(iniciales(t.nombre).slice(0, 1))}</div>
        <div class="flex flex-col min-w-0"><span class="font-subheading text-[14px] text-on-surface truncate">${esc(t.nombre)}</span>
          <span class="font-label-sm text-label-sm text-on-surface-variant truncate">${esc(detalle)}</span></div>
      </div>
      <div class="flex text-amber-500 shrink-0" aria-label="${t.estrellas} de 5 estrellas">${estrellas(t.estrellas)}</div>
    </div>
    <p class="font-body-md text-body-md text-on-surface-variant italic">“${esc(t.texto)}”</p>
    <div class="flex items-center gap-2 flex-wrap">
      ${t.verificado ? `<span class="inline-flex items-center gap-1 text-wa font-label-sm text-label-sm">${ico('check_circle', 'text-[14px]', true)}<span class="text-[#15803d]">Compra verificada por WhatsApp</span></span>` : ''}
      ${t.ejemplo ? '<span class="chip-gris normal-case tracking-normal" title="Reseña de muestra: reemplázala desde el panel">Reseña de ejemplo</span>' : ''}
    </div></div>`;
}

export function resenasSeccionHtml(testimonios, limite = 3) {
  const r = resumenResenas(testimonios);
  if (!r) return '';
  return `<div class="flex items-center justify-between">
      <div class="flex items-center gap-2">${ico('rate_review', 'text-wa text-[22px]', true)}
        <h2 class="font-headline-sm text-headline-sm text-on-surface">Clientes Felices</h2></div>
      <div class="flex items-center text-wa">${ico('star', 'text-[16px]', true)}
        <span class="font-label-md text-label-md text-on-surface ml-1 tnum">${r.promedio.toFixed(1)}/5 (${r.total} ${r.total === 1 ? 'reseña' : 'reseñas'})</span></div>
    </div>
    <div class="flex flex-col gap-space-sm">${testimonios.slice(0, limite).map(resenaHtml).join('')}</div>`;
}

export function beneficiosHtml(b, nombreTienda) {
  if (!b?.items?.length) return '';
  return `<div class="rounded-xl bg-surface-container-low p-space-md shadow-sm">
    <div class="text-center mb-space-md">
      <span class="font-label-sm text-label-sm uppercase tracking-wider text-primary font-bold">${esc(plantilla(b.etiqueta || '', { tienda: nombreTienda }))}</span>
      <h3 class="font-headline-sm text-headline-sm text-on-surface mt-0.5">${esc(b.titulo || '')}</h3>
    </div>
    <div class="grid grid-cols-2 gap-3">
      ${b.items.map((it) => `<div class="p-3 rounded-lg bg-surface-container-lowest shadow-sm flex flex-col gap-1.5">
        <div class="w-9 h-9 rounded-full ${claseColor(it.color)} flex items-center justify-center">${ico(it.icono || 'verified', 'text-[20px]', it.color === 'whatsapp')}</div>
        <span class="font-subheading text-[13px] text-on-surface">${esc(it.titulo)}</span>
        <p class="font-body-sm text-[11px] text-on-surface-variant leading-snug">${esc(it.texto)}</p></div>`).join('')}
    </div></div>`;
}
