// Utilidades compartidas por la tienda y el panel (sin dependencias).

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

const MAPA_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escapa texto para insertarlo en HTML (contenido o atributos). */
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => MAPA_ESC[c]);

export const ico = (nombre, clases = '', relleno = false) =>
  `<span class="material-symbols-outlined ${relleno ? 'relleno ' : ''}${clases}" aria-hidden="true">${nombre}</span>`;

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
export const redondear = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const num = (v, def = 0) => { const n = Number(v); return Number.isFinite(n) ? n : def; };

// ---------------- Dinero y números ----------------
const formatos = new Map();
export function dinero(n, cfg = {}) {
  const locale = cfg.locale || 'es-US';
  const moneda = cfg.moneda || 'USD';
  const clave = locale + moneda;
  if (!formatos.has(clave)) {
    try {
      formatos.set(clave, new Intl.NumberFormat(locale, { style: 'currency', currency: moneda, currencyDisplay: 'narrowSymbol' }));
    } catch {
      formatos.set(clave, new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD' }));
    }
  }
  return formatos.get(clave).format(num(n));
}
export const numero = (n, locale = 'es-US') => new Intl.NumberFormat(locale).format(num(n));
export const porcentaje = (n, dec = 1) => `${num(n).toFixed(dec).replace(/\.0$/, '')}%`;

// ---------------- Fechas ----------------
export function fecha(d, opciones = { day: '2-digit', month: 'short', year: 'numeric' }, locale = 'es') {
  if (!d) return '';
  return new Intl.DateTimeFormat(locale, opciones).format(new Date(d));
}
export const fechaHora = (d) => fecha(d, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
export const hora = (d) => fecha(d, { hour: '2-digit', minute: '2-digit' });

/** "Hace 4 min", "Hace 2 h", "Ayer, 18:40", "12 nov" */
export function hace(d) {
  if (!d) return '';
  const t = new Date(d);
  const seg = (Date.now() - t.getTime()) / 1000;
  if (seg < 50) return 'Hace un momento';
  if (seg < 3600) return `Hace ${Math.max(1, Math.round(seg / 60))} min`;
  if (seg < 86400 && new Date().getDate() === t.getDate()) return `Hace ${Math.round(seg / 3600)} h`;
  const ayer = new Date(); ayer.setDate(ayer.getDate() - 1);
  if (ayer.toDateString() === t.toDateString()) return `Ayer, ${hora(t)}`;
  if (seg < 86400 * 6) return fecha(t, { weekday: 'long', hour: '2-digit', minute: '2-digit' });
  return fecha(t, { day: '2-digit', month: 'short', year: t.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

// ---------------- Texto ----------------
export function slug(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/&/g, ' y ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}
export const normalizar = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const soloDigitos = (t) => String(t ?? '').replace(/\D/g, '');
export const iniciales = (nombre) => String(nombre ?? '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || '?';

/** Reemplaza {clave} por datos[clave]. */
export const plantilla = (texto, datos) => String(texto ?? '').replace(/\{(\w+)\}/g, (m, k) => (datos[k] ?? m));

export function urlWhatsApp(numeroWa, texto) {
  const n = soloDigitos(numeroWa);
  return `https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

/** Teléfono legible: 13055550118 → +1 305 555 0118 (aproximado, sólo para mostrar). */
export function telefonoBonito(t) {
  const d = soloDigitos(t);
  if (!d) return '';
  if (d.length === 11 && d.startsWith('1')) return `+1 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  if (d.length >= 11) return `+${d.slice(0, d.length - 10)} ${d.slice(-10, -7)} ${d.slice(-7, -4)} ${d.slice(-4)}`;
  return `+${d}`;
}

// ---------------- Markdown mínimo y seguro ----------------
function enLinea(t) {
  return t
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:|\/|[a-z0-9-]+\.html)[^\s)]*)\)/gi,
      (m, txt, url) => `<a href="${url.replace(/"/g, '%22')}" ${/^https?:/i.test(url) ? 'target="_blank" rel="noopener"' : ''}>${txt}</a>`);
}
/** Convierte markdown sencillo (títulos, negritas, listas, enlaces) a HTML. Escapa todo lo demás. */
export function markdown(md) {
  const lineas = esc(md ?? '').split(/\r?\n/);
  let html = ''; let lista = null; let parrafo = [];
  const cerrarParrafo = () => { if (parrafo.length) { html += `<p>${enLinea(parrafo.join(' '))}</p>`; parrafo = []; } };
  const cerrarLista = () => { if (lista) { html += `</${lista}>`; lista = null; } };
  for (const crudo of lineas) {
    const l = crudo.trim();
    let m;
    if (!l) { cerrarParrafo(); cerrarLista(); continue; }
    if ((m = l.match(/^(#{1,4})\s+(.*)$/))) {
      cerrarParrafo(); cerrarLista();
      const nivel = Math.min(4, m[1].length + 1);
      html += `<h${nivel}>${enLinea(m[2])}</h${nivel}>`;
    } else if ((m = l.match(/^[-*•]\s+(.*)$/))) {
      cerrarParrafo(); if (lista !== 'ul') { cerrarLista(); html += '<ul>'; lista = 'ul'; }
      html += `<li>${enLinea(m[1])}</li>`;
    } else if ((m = l.match(/^\d+[.)]\s+(.*)$/))) {
      cerrarParrafo(); if (lista !== 'ol') { cerrarLista(); html += '<ol>'; lista = 'ol'; }
      html += `<li>${enLinea(m[1])}</li>`;
    } else {
      cerrarLista(); parrafo.push(l);
    }
  }
  cerrarParrafo(); cerrarLista();
  return html;
}
/** Quita el formato markdown (para mensajes de WhatsApp o vistas cortas). */
export const textoPlano = (md) => String(md ?? '').replace(/[#*_`>]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();

// ---------------- Archivos ----------------
export function descargar(nombre, contenido, tipo = 'text/plain;charset=utf-8') {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

const celdaCsv = (v) => {
  const s = v == null ? '' : Array.isArray(v) ? v.join('|') : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** filas: array de objetos; columnas: [{clave, titulo}] o array de claves. Incluye BOM para Excel. */
export function aCsv(filas, columnas) {
  const cols = columnas.map((c) => (typeof c === 'string' ? { clave: c, titulo: c } : c));
  const cab = cols.map((c) => celdaCsv(c.titulo)).join(',');
  const cuerpo = filas.map((f) => cols.map((c) => celdaCsv(typeof c.valor === 'function' ? c.valor(f) : f[c.clave])).join(',')).join('\n');
  return `﻿${cab}\n${cuerpo}`;
}

/** Lee CSV (coma o punto y coma, comillas dobles). Devuelve array de objetos con la primera fila como claves. */
export function leerCsv(texto) {
  const t = String(texto ?? '').replace(/^﻿/, '');
  const sep = (t.split('\n')[0].match(/;/g) || []).length > (t.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const filas = []; let fila = []; let celda = ''; let comillas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (comillas) {
      if (c === '"' && t[i + 1] === '"') { celda += '"'; i++; } else if (c === '"') comillas = false; else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(celda); celda = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      fila.push(celda); celda = '';
      if (fila.some((x) => x !== '')) filas.push(fila);
      fila = [];
    } else celda += c;
  }
  fila.push(celda);
  if (fila.some((x) => x !== '')) filas.push(fila);
  const [cab = [], ...resto] = filas;
  return resto.map((r) => Object.fromEntries(cab.map((k, i) => [k.trim(), (r[i] ?? '').trim()])));
}

/** Redimensiona una imagen en el navegador. Devuelve {blob, ancho, alto, tipo}. */
export async function redimensionar(archivo, { max = 1200, calidad = 0.82, cuadrado = false } = {}) {
  const bitmap = await createImageBitmap(archivo).catch(async () => {
    const img = new Image();
    img.src = URL.createObjectURL(archivo);
    await img.decode();
    return img;
  });
  let { width: w, height: h } = bitmap;
  let sx = 0; let sy = 0; let sw = w; let sh = h;
  if (cuadrado) { const lado = Math.min(w, h); sx = (w - lado) / 2; sy = (h - lado) / 2; sw = sh = lado; w = h = lado; }
  const escala = Math.min(1, max / Math.max(w, h));
  const ancho = Math.round(w * escala); const alto = Math.round(h * escala);
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho; lienzo.height = alto;
  const ctx = lienzo.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, ancho, alto);
  const aBlob = (tipo, q) => new Promise((r) => lienzo.toBlob(r, tipo, q));
  let blob = await aBlob('image/webp', calidad);
  if (!blob || blob.type !== 'image/webp') blob = await aBlob('image/jpeg', calidad);
  return { blob, ancho, alto, tipo: blob.type };
}

export async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); return true; } catch {
    const t = document.createElement('textarea'); t.value = texto; document.body.appendChild(t); t.select();
    const ok = document.execCommand('copy'); t.remove(); return ok;
  }
}

// ---------------- Reglas de producto (iguales en tienda, panel y servidor) ----------------
const hoyISO = () => new Date().toISOString().slice(0, 10);

/** ¿La oferta está vigente hoy? */
export function ofertaVigente(p) {
  if (!p?.oferta_activa || p.precio_oferta == null || num(p.precio_oferta) >= num(p.precio)) return false;
  const hoy = hoyISO();
  if (p.oferta_inicio && p.oferta_inicio > hoy) return false;
  if (p.oferta_fin && p.oferta_fin < hoy) return false;
  return true;
}
export const precioVigente = (p) => (ofertaVigente(p) ? num(p.precio_oferta) : num(p.precio));
export const descuentoPct = (p) => (ofertaVigente(p) ? Math.round((1 - num(p.precio_oferta) / num(p.precio)) * 100) : 0);

/** Disponibilidad de un producto (o de una variante si se pasa). */
export function disponibilidad(p, variante = null, umbral = 10) {
  const conVariantes = (p?.variantes?.length || 0) > 0;
  const stock = variante ? num(variante.stock) : conVariantes ? p.variantes.reduce((s, v) => s + Math.max(0, num(v.stock)), 0) : num(p?.stock);
  if (!p?.rastrear_stock) return { codigo: 'disponible', texto: 'Disponible', stock: null, comprable: true };
  if (stock > 0) {
    if (stock <= umbral) return { codigo: 'pocas', texto: 'Pocas unidades', stock, comprable: true };
    return { codigo: 'disponible', texto: 'Disponible', stock, comprable: true };
  }
  if (p.al_agotarse === 'preventa') return { codigo: 'preventa', texto: 'Preventa', stock: 0, comprable: true };
  if (p.al_agotarse === 'continuar') return { codigo: 'consulta', texto: 'Bajo pedido', stock: 0, comprable: true };
  return { codigo: 'agotado', texto: 'Agotado', stock: 0, comprable: false };
}

/** Máximo que se puede pedir de un producto/variante (null = sin límite). */
export function maximoPedido(p, variante = null) {
  if (!p?.rastrear_stock || p.al_agotarse !== 'bloquear') return 99;
  const stock = variante ? num(variante.stock) : num(p.stock);
  return Math.max(0, Math.min(99, stock));
}

// Iconos que se pueden elegir en el panel (categorías, beneficios, puntos destacados).
// Se incluyen en el subconjunto de la fuente de iconos (herramientas/iconos.mjs).
export const ICONOS_ELEGIBLES = /* iconos */ [
  'devices', 'smartphone', 'laptop', 'headphones', 'watch', 'tv', 'photo_camera', 'videogame_asset', 'keyboard', 'mouse',
  'apparel', 'checkroom', 'styler', 'steps', 'diamond', 'eyeglasses', 'backpack', 'shopping_bag', 'chair', 'bed',
  'kitchen', 'blender', 'light', 'lightbulb', 'home', 'yard', 'spa', 'face', 'self_care', 'health_and_beauty',
  'fitness_center', 'sports_soccer', 'pets', 'child_care', 'toys', 'restaurant', 'local_cafe', 'local_bar', 'cake', 'icecream',
  'menu_book', 'school', 'palette', 'brush', 'construction', 'handyman', 'directions_car', 'two_wheeler', 'pedal_bike', 'local_florist',
  'redeem', 'sell', 'category', 'storefront', 'inventory_2', 'local_shipping', 'payments', 'verified', 'verified_user', 'support_agent',
  'chat', 'schedule', 'star', 'favorite', 'bolt', 'eco', 'water_drop', 'air', 'battery_charging_full', 'noise_control_on',
  'mic', 'satellite_alt', 'pool', 'touch_app', 'light_mode', 'dark_mode', 'lock', 'usb', '360', 'airline_seat_recline_extra',
  'workspace_premium', 'recycling', 'thermostat', 'speed', 'straighten', 'scale', 'shield', 'wifi', 'bluetooth', 'cable',
];
