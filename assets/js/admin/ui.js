// Componentes de interfaz del panel: avisos, modales, confirmaciones, panel lateral, chips,
// estados vacíos, paginación, subida de imágenes y selectores (imagen e icono).
import { $, $$, esc, ico, redimensionar, slug, ICONOS_ELEGIBLES, debounce, fecha } from '../util.js';
import { db, fotos, urlImagen } from '../api.js';

// ---------------- Avisos ----------------
export function toast(mensaje, { tipo = 'ok', duracion = 3200 } = {}) {
  let pila = $('#mt-avisos');
  if (!pila) {
    pila = document.createElement('div');
    pila.id = 'mt-avisos';
    pila.className = 'fixed bottom-4 right-4 left-4 sm:left-auto z-[120] flex flex-col gap-2 items-stretch sm:items-end pointer-events-none';
    pila.setAttribute('role', 'status');
    document.body.appendChild(pila);
  }
  const estilos = { ok: ['check_circle', 'text-secondary-fixed'], error: ['error', 'text-[#fca5a5]'], info: ['info', 'text-tertiary-fixed-dim'] }[tipo] || ['info', ''];
  const el = document.createElement('div');
  el.className = 'pointer-events-auto bg-inverse-surface text-inverse-on-surface pl-3 pr-2 py-2.5 rounded-xl shadow-nivel3 flex items-center gap-2 animate-entrar sm:max-w-sm';
  el.innerHTML = `${ico(estilos[0], `text-[20px] ${estilos[1]}`, true)}<span class="font-label-md text-label-md flex-1">${esc(mensaje)}</span>
    <button type="button" class="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center" aria-label="Cerrar">${ico('close', 'text-[16px]')}</button>`;
  el.querySelector('button').addEventListener('click', () => el.remove());
  pila.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, duracion);
}
export const toastError = (e) => toast(e?.message || String(e), { tipo: 'error', duracion: 5000 });

// ---------------- Modal genérico ----------------
const ANCHOS = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };
/**
 * Abre un modal. `contenido` es HTML. Si hay un <form>, al enviarlo se llama `alEnviar(form, el)`;
 * lo que devuelva resuelve la promesa (si lanza error, se muestra y el modal sigue abierto).
 */
export function modal({ titulo, subtitulo = '', icono = null, contenido = '', ancho = 'md', alAbrir = null, alEnviar = null, botones = null, textoEnviar = 'Guardar', peligro = false }) {
  return new Promise((resolver) => {
    const capa = document.createElement('div');
    capa.className = 'fixed inset-0 z-[110] bg-[#0F172A]/40 backdrop-blur-[4px] flex items-end sm:items-center justify-center sm:p-4';
    const pie = botones ?? `<button type="button" data-cerrar class="btn-secundario">Cancelar</button>
      <button type="submit" class="${peligro ? 'btn-peligro' : 'btn-primario'}" data-enviar>${esc(textoEnviar)}</button>`;
    capa.innerHTML = `<form role="dialog" aria-modal="true" aria-label="${esc(titulo)}" novalidate class="w-full ${ANCHOS[ancho] || ANCHOS.md} bg-white rounded-t-3xl sm:rounded-3xl shadow-nivel3 flex flex-col max-h-[92vh] animate-subir sm:animate-entrar">
      <div class="flex items-start gap-3 px-5 pt-5 pb-3">
        ${icono ? `<span class="w-10 h-10 rounded-xl ${peligro ? 'bg-error-container text-error' : 'bg-primary/10 text-primary'} flex items-center justify-center shrink-0">${ico(icono, 'text-[22px]')}</span>` : ''}
        <div class="flex-1 min-w-0"><h2 class="font-headline-sm text-headline-sm text-[#0F172A]">${esc(titulo)}</h2>
          ${subtitulo ? `<p class="font-body-sm text-body-sm text-[#64748B] mt-0.5">${subtitulo}</p>` : ''}</div>
        <button type="button" data-cerrar class="btn-icono -mr-2 -mt-1" aria-label="Cerrar">${ico('close', 'text-[20px]')}</button>
      </div>
      <div class="px-5 pb-2 overflow-y-auto flex-1" data-cuerpo>${contenido}</div>
      <p data-error class="hidden mx-5 mb-2 px-3 py-2 rounded-lg bg-[#FEF2F2] text-[#991B1B] font-label-md text-label-md border border-[#FECACA]"></p>
      ${pie ? `<div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-5 py-4 border-t border-[#F1F5F9] pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">${pie}</div>` : ''}
    </form>`;
    document.body.appendChild(capa);
    document.body.style.overflow = 'hidden';
    const form = $('form', capa);
    const cerrar = (valor) => {
      capa.remove();
      if (!$$('.z-\\[110\\]').length) document.body.style.overflow = '';
      document.removeEventListener('keydown', teclas);
      resolver(valor);
    };
    const teclas = (e) => { if (e.key === 'Escape') cerrar(null); };
    document.addEventListener('keydown', teclas);
    capa.addEventListener('mousedown', (e) => { if (e.target === capa) cerrar(null); });
    capa.addEventListener('click', (e) => {
      if (e.target.closest('[data-cerrar]')) cerrar(null);
      const b = e.target.closest('[data-valor]');
      if (b) cerrar(b.dataset.valor);
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = $('[data-error]', capa);
      errorEl.classList.add('hidden');
      if (!alEnviar) { cerrar(true); return; }
      const boton = $('[data-enviar]', capa);
      const antes = boton?.innerHTML;
      if (boton) { boton.disabled = true; boton.innerHTML = `${spinner()} ${esc(textoEnviar)}`; }
      try {
        const r = await alEnviar(form, capa);
        if (r !== false) cerrar(r ?? true);
      } catch (err) {
        errorEl.textContent = err.message || String(err);
        errorEl.classList.remove('hidden');
      } finally {
        if (boton && document.body.contains(boton)) { boton.disabled = false; boton.innerHTML = antes; }
      }
    });
    alAbrir?.(capa, cerrar);
    setTimeout(() => (capa.querySelector('[autofocus]') || capa.querySelector('input:not([type=hidden]),select,textarea'))?.focus(), 40);
  });
}

export const spinner = (clases = 'h-4 w-4') => `<svg class="animate-spin ${clases}" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" d="M4 12a8 8 0 018-8v8H4z" fill="currentColor"></path></svg>`;

export async function confirmar({ titulo = '¿Estás seguro?', mensaje = '', boton = 'Confirmar', peligro = false, icono = null } = {}) {
  const r = await modal({ titulo, subtitulo: mensaje, ancho: 'sm', peligro, textoEnviar: boton, icono: icono ?? (peligro ? 'warning' : 'help') });
  return r === true;
}

// ---------------- Panel lateral (detalle) ----------------
export function panelLateral({ titulo, contenido = '', ancho = 'max-w-xl', alAbrir = null }) {
  const capa = document.createElement('div');
  capa.className = 'fixed inset-0 z-[100] bg-[#0F172A]/30 backdrop-blur-[2px] flex justify-end';
  capa.innerHTML = `<aside role="dialog" aria-modal="true" aria-label="${esc(titulo)}" class="w-full ${ancho} h-full bg-white shadow-nivel3 flex flex-col animate-deslizar">
    <div class="flex items-center justify-between gap-3 px-5 h-16 border-b border-[#F1F5F9] shrink-0">
      <h2 class="font-headline-sm text-headline-sm text-[#0F172A] truncate" data-titulo>${esc(titulo)}</h2>
      <button type="button" data-cerrar-panel class="btn-icono" aria-label="Cerrar">${ico('close', 'text-[20px]')}</button></div>
    <div class="flex-1 overflow-y-auto" data-cuerpo>${contenido}</div></aside>`;
  document.body.appendChild(capa);
  document.body.style.overflow = 'hidden';
  const cerrar = () => { capa.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', teclas); };
  const teclas = (e) => { if (e.key === 'Escape' && !$('.z-\\[110\\]')) cerrar(); };
  document.addEventListener('keydown', teclas);
  capa.addEventListener('mousedown', (e) => { if (e.target === capa) cerrar(); });
  capa.addEventListener('click', (e) => { if (e.target.closest('[data-cerrar-panel]')) cerrar(); });
  const api = { el: capa, cuerpo: $('[data-cuerpo]', capa), cerrar, titulo: (t) => { $('[data-titulo]', capa).textContent = t; } };
  alAbrir?.(api);
  return api;
}

// ---------------- Chips y estados ----------------
export const ESTADOS_PEDIDO = {
  nuevo: { texto: 'Nuevo', clase: 'chip-wa', icono: 'fiber_new' },
  contactado: { texto: 'Contactado', clase: 'chip-azul', icono: 'forum' },
  negociacion: { texto: 'En negociación', clase: 'chip-ambar', icono: 'handshake' },
  confirmado: { texto: 'Confirmado', clase: 'chip-verde', icono: 'task_alt' },
  enviado: { texto: 'Enviado', clase: 'chip-violeta', icono: 'local_shipping' },
  entregado: { texto: 'Entregado', clase: 'chip-gris', icono: 'inventory' },
  cancelado: { texto: 'Cancelado', clase: 'chip-rojo', icono: 'cancel' },
};
export const chipPedido = (estado) => {
  const e = ESTADOS_PEDIDO[estado] || { texto: estado, clase: 'chip-gris' };
  return `<span class="${e.clase}">${esc(e.texto)}</span>`;
};
export const ESTADOS_PRODUCTO = {
  publicado: { texto: 'Publicado', clase: 'chip-verde' }, borrador: { texto: 'Borrador', clase: 'chip-gris' },
  oculto: { texto: 'Pausado', clase: 'chip-ambar' }, archivado: { texto: 'Archivado', clase: 'chip-rojo' },
};
export const chipProducto = (estado) => `<span class="${ESTADOS_PRODUCTO[estado]?.clase || 'chip-gris'}">${esc(ESTADOS_PRODUCTO[estado]?.texto || estado)}</span>`;
export const ROLES = { dueno: 'Dueño', admin: 'Administrador', editor: 'Editor de catálogo', vendedor: 'Ventas' };

export function vacio({ icono = 'inbox', titulo, texto = '', accion = '' }) {
  return `<div class="py-14 px-6 text-center flex flex-col items-center gap-2">
    <div class="w-14 h-14 rounded-2xl bg-surface-container-low flex items-center justify-center mb-1">${ico(icono, 'text-[30px] text-primary')}</div>
    <p class="font-subheading text-subheading text-[#0F172A]">${esc(titulo)}</p>
    ${texto ? `<p class="font-body-md text-body-md text-[#64748B] max-w-sm">${texto}</p>` : ''}
    ${accion ? `<div class="mt-2">${accion}</div>` : ''}</div>`;
}

export const esqueletoFilas = (filas = 6, cols = 5) => Array.from({ length: filas }, () => `<tr>${Array.from({ length: cols }, () => '<td><div class="h-4 esqueleto"></div></td>').join('')}</tr>`).join('');

/** HTML de paginación. Escucha clics en [data-pagina]. */
export function paginacion({ total, pagina, porPagina }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const desde = total ? (pagina - 1) * porPagina + 1 : 0;
  const hasta = Math.min(total, pagina * porPagina);
  const nums = [];
  for (let i = 1; i <= paginas; i++) {
    if (i === 1 || i === paginas || Math.abs(i - pagina) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  const boton = (n, contenido, deshabilitado = false, activo = false) => `<button type="button" ${deshabilitado ? 'disabled' : ''} data-pagina="${n}"
    class="min-w-8 h-8 px-2 rounded-lg font-label-md text-label-md flex items-center justify-center transition-colors disabled:opacity-40 ${activo ? 'bg-primary text-on-primary' : 'text-[#334155] hover:bg-[#F1F5F9]'}">${contenido}</button>`;
  return `<div class="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3">
    <span class="font-body-sm text-body-sm text-[#64748B] tnum">${desde}–${hasta} de ${total}</span>
    <div class="flex items-center gap-1">${boton(pagina - 1, ico('chevron_left', 'text-[18px]'), pagina <= 1)}
      ${nums.map((n) => (n === '…' ? '<span class="px-1 text-[#94A3B8]">…</span>' : boton(n, n, false, n === pagina))).join('')}
      ${boton(pagina + 1, ico('chevron_right', 'text-[18px]'), pagina >= paginas)}</div></div>`;
}

// ---------------- Imágenes ----------------
/** Redimensiona y sube una imagen (grande + miniatura) y la registra en la galería. */
export async function subirImagen(archivo, carpeta = 'productos') {
  if (!archivo.type.startsWith('image/')) throw new Error(`"${archivo.name}" no es una imagen`);
  if (archivo.size > 15 * 1024 * 1024) throw new Error(`"${archivo.name}" pesa más de 15 MB`);
  const [grande, chica] = await Promise.all([redimensionar(archivo, { max: 1400, calidad: 0.82 }), redimensionar(archivo, { max: 440, calidad: 0.74, cuadrado: true })]);
  const ext = grande.tipo === 'image/webp' ? 'webp' : 'jpg';
  const base = `${carpeta}/${Date.now().toString(36)}-${slug(archivo.name.replace(/\.[^.]+$/, '')).slice(0, 40) || 'foto'}`;
  const ruta = `${base}.${ext}`;
  const rutaMini = `${base}-mini.${ext}`;
  const [url, mini] = await Promise.all([fotos.subir(ruta, grande.blob), fotos.subir(rutaMini, chica.blob)]);
  await db.crear('mt_medios', [{ ruta, url, mini_url: mini, nombre: archivo.name.slice(0, 120), tipo: grande.tipo, bytes: grande.blob.size, ancho: grande.ancho, alto: grande.alto }]);
  return { url, mini, ruta, rutaMini, alt: archivo.name.replace(/\.[^.]+$/, '') };
}

/** Modal para elegir una o varias imágenes de la galería o subir nuevas. Devuelve [{url, mini, alt}] o null. */
export async function elegirImagenes({ multiple = false, carpeta = 'productos', titulo = 'Elegir imagen' } = {}) {
  let medios = [];
  const elegidas = new Map();
  return modal({
    titulo, subtitulo: 'Sube fotos nuevas o elige de tu galería. Formatos JPG, PNG o WEBP.', icono: 'photo_library', ancho: 'xl', textoEnviar: 'Usar selección',
    contenido: `<label class="flex flex-col items-center justify-center gap-1 p-5 rounded-2xl border-2 border-dashed border-[#CBD5E1] bg-[#F8FAFC] hover:border-primary hover:bg-primary/5 cursor-pointer transition-colors text-center" data-zona>
        ${ico('cloud_upload', 'text-[32px] text-primary')}<span class="font-label-lg text-label-lg text-[#0F172A]">Arrastra tus imágenes aquí o <span class="text-primary underline">explora tus archivos</span></span>
        <span class="font-body-sm text-body-sm text-[#64748B]">Se optimizan automáticamente antes de subir.</span>
        <input type="file" accept="image/*" ${multiple ? 'multiple' : ''} class="sr-only" data-archivo></label>
      <div data-estado-subida class="hidden mt-2 font-label-md text-label-md text-primary flex items-center gap-2"></div>
      <div class="flex items-center justify-between mt-4 mb-2 gap-2"><p class="font-label-md text-label-md text-[#334155]">Tu galería</p>
        <input type="search" data-filtro class="campo h-9 lg:h-9 max-w-[200px]" placeholder="Buscar..."></div>
      <div data-rejilla class="grid grid-cols-3 sm:grid-cols-5 gap-2 min-h-[120px]"><div class="col-span-full h-24 esqueleto"></div></div>`,
    alAbrir: async (capa) => {
      const rejilla = $('[data-rejilla]', capa);
      const pintar = () => {
        const q = $('[data-filtro]', capa).value.toLowerCase();
        const lista = medios.filter((m) => !q || (m.nombre || '').toLowerCase().includes(q));
        rejilla.innerHTML = lista.length ? lista.map((m) => `<button type="button" data-medio="${m.id}" class="relative aspect-square rounded-xl overflow-hidden bg-[#F1F5F9] ring-2 ${elegidas.has(m.id) ? 'ring-primary' : 'ring-transparent hover:ring-[#CBD5E1]'}">
            <img src="${esc(urlImagen(m.mini_url || m.url))}" alt="" class="w-full h-full object-cover" loading="lazy">
            ${elegidas.has(m.id) ? `<span class="absolute top-1 right-1 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center">${ico('check', 'text-[16px]')}</span>` : ''}</button>`).join('')
          : `<p class="col-span-full py-8 text-center font-body-sm text-body-sm text-[#64748B]">${medios.length ? 'Sin resultados.' : 'Aún no subiste imágenes.'}</p>`;
      };
      try { medios = await db.leer('mt_medios', 'select=*&order=creado_en.desc&limit=200'); } catch { medios = []; }
      pintar();
      $('[data-filtro]', capa).addEventListener('input', debounce(pintar, 150));
      rejilla.addEventListener('click', (e) => {
        const b = e.target.closest('[data-medio]');
        if (!b) return;
        const m = medios.find((x) => x.id === b.dataset.medio);
        if (!multiple) elegidas.clear();
        if (elegidas.has(m.id)) elegidas.delete(m.id); else elegidas.set(m.id, m);
        pintar();
      });
      const subir = async (archivos) => {
        const estado = $('[data-estado-subida]', capa);
        estado.classList.remove('hidden');
        for (const [i, a] of [...archivos].entries()) {
          estado.innerHTML = `${spinner()} Subiendo ${i + 1} de ${archivos.length}…`;
          try {
            const r = await subirImagen(a, carpeta);
            const nuevo = (await db.leer('mt_medios', `select=*&ruta=eq.${encodeURIComponent(r.ruta)}`))[0];
            if (nuevo) { medios.unshift(nuevo); if (!multiple) elegidas.clear(); elegidas.set(nuevo.id, nuevo); }
          } catch (err) { toastError(err); }
        }
        estado.classList.add('hidden');
        pintar();
      };
      $('[data-archivo]', capa).addEventListener('change', (e) => subir(e.target.files));
      const zona = $('[data-zona]', capa);
      ['dragenter', 'dragover'].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('border-primary'); }));
      ['dragleave', 'drop'].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove('border-primary'); }));
      zona.addEventListener('drop', (e) => subir(e.dataTransfer.files));
    },
    alEnviar: () => {
      if (!elegidas.size) throw new Error('Elige o sube al menos una imagen');
      return [...elegidas.values()].map((m) => ({ url: m.url, mini: m.mini_url || m.url, alt: (m.nombre || '').replace(/\.[^.]+$/, '') }));
    },
  });
}

/** Selector de icono (Material Symbols). Devuelve el nombre o null. */
export function elegirIcono(actual = '') {
  return modal({
    titulo: 'Elegir icono', icono: 'interests', ancho: 'lg', botones: '<button type="button" data-cerrar class="btn-secundario">Cancelar</button>',
    contenido: `<input type="search" data-filtro class="campo mb-3" placeholder="Buscar icono (en inglés: phone, shoe, gift...)">
      <div data-rejilla class="grid grid-cols-6 sm:grid-cols-9 gap-1.5"></div>`,
    alAbrir: (capa) => {
      const pintar = () => {
        const q = $('[data-filtro]', capa).value.trim().toLowerCase();
        $('[data-rejilla]', capa).innerHTML = ICONOS_ELEGIBLES.filter((n) => !q || n.includes(q)).map((n) => `<button type="button" data-valor="${n}" title="${n}"
          class="aspect-square rounded-xl flex items-center justify-center ${n === actual ? 'bg-primary text-on-primary' : 'bg-[#F8FAFC] text-[#334155] hover:bg-primary/10 hover:text-primary'}">${ico(n, 'text-[24px]')}</button>`).join('');
      };
      $('[data-filtro]', capa).addEventListener('input', pintar);
      pintar();
    },
  });
}

/** Lee los campos de un formulario como objeto (checkbox → boolean, number → número o null). */
export function leerFormulario(form) {
  const datos = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') datos[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) datos[el.name] = el.value; }
    else if (el.type === 'number') datos[el.name] = el.value === '' ? null : Number(el.value);
    else datos[el.name] = el.value.trim();
  }
  return datos;
}

export const fechaCorta = (d) => fecha(d, { day: '2-digit', month: 'short', year: 'numeric' });
