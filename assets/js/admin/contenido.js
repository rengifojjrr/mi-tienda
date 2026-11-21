// Contenido Tienda (Sistema): textos que ven los clientes en la tienda pública.
// Pestañas con hash: #beneficios #resenas #faq #envios #pie #legal.
// Guarda en mt_contenido (upsert por clave) y mt_testimonios (reseñas, se guardan al momento).
import { $, $$, esc, ico, hace, iniciales, markdown, num } from '../util.js';
import { db, ruta } from '../api.js';
import { iniciarPanel, puede, tienda, dineroPanel } from './base.js';
import { modal, confirmar, toast, toastError, elegirIcono, vacio, spinner, leerFormulario } from './ui.js';
import { beneficiosHtml, faqHtml, conectarFaq, claseColor, estrellas } from '../tienda/secciones.js';

await iniciarPanel({ seccion: 'contenido', migas: [{ texto: 'Sistema' }, { texto: 'Contenido Tienda' }], area: 'catalogo' });
const raiz = $('#contenido');

// ---------------- Definiciones ----------------
const PESTANAS = [
  { id: 'beneficios', texto: '¿Por qué comprar?', icono: 'verified_user', claves: ['beneficios'] },
  { id: 'resenas', texto: 'Reseñas', icono: 'rate_review', claves: [] },
  { id: 'faq', texto: 'Preguntas frecuentes', icono: 'help', claves: ['faq'] },
  { id: 'envios', texto: 'Garantía & envíos', icono: 'local_shipping', claves: ['garantia_envios'] },
  { id: 'pie', texto: 'Pie y soporte', icono: 'support_agent', claves: ['pie', 'soporte'] },
  { id: 'legal', texto: 'Legales', icono: 'gavel', claves: ['legal'] },
];
const PESTANA_DE = { beneficios: 'beneficios', faq: 'faq', garantia_envios: 'envios', pie: 'pie', soporte: 'pie', legal: 'legal' };
const COLORES = [['whatsapp', 'Verde WhatsApp'], ['primary', 'Verde principal'], ['secondary', 'Verde intenso'], ['tertiary', 'Azul'], ['amber', 'Ámbar'], ['error', 'Rojo']];
const LEGALES = [
  { id: 'devoluciones', texto: 'Devoluciones', icono: 'assignment_return', titulo: 'Política de Devolución' },
  { id: 'terminos', texto: 'Términos', icono: 'description', titulo: 'Términos del Servicio' },
  { id: 'privacidad', texto: 'Privacidad', icono: 'shield', titulo: 'Privacidad y Datos' },
];
const HERRAMIENTAS_MD = [
  { id: 'titulo', icono: 'title', texto: 'Subtítulo' },
  { id: 'negrita', icono: 'format_bold', texto: 'Negrita' },
  { id: 'cursiva', icono: 'format_italic', texto: 'Cursiva' },
  { id: 'lista', icono: 'format_list_bulleted', texto: 'Lista con viñetas' },
  { id: 'numerada', icono: 'format_list_numbered', texto: 'Lista numerada' },
  { id: 'enlace', icono: 'link', texto: 'Enlace' },
];
const TEXTO_ESTRELLAS = { 1: 'Mala', 2: 'Regular', 3: 'Buena', 4: 'Muy buena', 5: 'Excelente' };
const AYUDA_MD = 'Formato: **negrita**, *cursiva*, listas con «- » y [enlaces](https://…).';

// Valores por defecto (si la clave aún no existe en mt_contenido)
const VACIO = {
  beneficios: { etiqueta: '¿Por qué comprar en {tienda}?', titulo: '', items: [] },
  faq: [],
  garantia_envios: [],
  pie: { texto: '' },
  soporte: { titulo: '¿En qué te ayudamos?', texto: '' },
  legal: { devoluciones: '', terminos: '', privacidad: '' },
};
const txt = (v) => String(v ?? '');
const limpio = (v) => txt(v).trim();
const colorValido = (c) => (COLORES.some(([k]) => k === c) ? c : 'primary');
const punto = (x = {}) => ({ icono: txt(x?.icono) || 'verified', color: colorValido(x?.color), titulo: txt(x?.titulo), texto: txt(x?.texto) });
// Da forma segura a lo que venga de la base (conserva claves desconocidas de los objetos).
const NORMALIZAR = {
  beneficios: (v) => ({ ...(v || {}), etiqueta: txt(v?.etiqueta), titulo: txt(v?.titulo), items: (Array.isArray(v?.items) ? v.items : []).map(punto) }),
  faq: (v) => (Array.isArray(v) ? v : []).map((f) => ({ pregunta: txt(f?.pregunta), respuesta: txt(f?.respuesta) })),
  garantia_envios: (v) => (Array.isArray(v) ? v : []).map(punto),
  pie: (v) => ({ ...(v || {}), texto: txt(v?.texto) }),
  soporte: (v) => ({ ...(v || {}), titulo: txt(v?.titulo), texto: txt(v?.texto) }),
  legal: (v) => ({ ...(v || {}), devoluciones: txt(v?.devoluciones), terminos: txt(v?.terminos), privacidad: txt(v?.privacidad) }),
};
// Lo que se guarda: textos recortados y sin elementos vacíos.
const puntoLimpio = (x) => ({ icono: x.icono || 'verified', color: colorValido(x.color), titulo: limpio(x.titulo), texto: limpio(x.texto) });
const LIMPIAR = {
  beneficios: (v) => ({ ...v, etiqueta: limpio(v.etiqueta), titulo: limpio(v.titulo), items: v.items.map(puntoLimpio).filter((x) => x.titulo || x.texto) }),
  faq: (v) => v.map((f) => ({ pregunta: limpio(f.pregunta), respuesta: limpio(f.respuesta) })).filter((f) => f.pregunta || f.respuesta),
  garantia_envios: (v) => v.map(puntoLimpio).filter((x) => x.titulo || x.texto),
  pie: (v) => ({ ...v, texto: limpio(v.texto) }),
  soporte: (v) => ({ ...v, titulo: limpio(v.titulo), texto: limpio(v.texto) }),
  legal: (v) => ({ ...v, devoluciones: limpio(v.devoluciones), terminos: limpio(v.terminos), privacidad: limpio(v.privacidad) }),
};
// Listas editables: arreglo de origen, clave de mt_contenido y máximo de elementos.
const LISTAS = {
  beneficios: { clave: 'beneficios', arreglo: () => datos.beneficios.items, max: 8 },
  envios: { clave: 'garantia_envios', arreglo: () => datos.garantia_envios, max: 6 },
  faq: { clave: 'faq', arreglo: () => datos.faq, max: 30 },
};

// ---------------- Carga ----------------
let filas = [];
let resenas = [];
let productos = [];
try {
  [filas, resenas, productos] = await Promise.all([
    db.leer('mt_contenido', 'select=clave,valor,actualizado_en'),
    db.leer('mt_testimonios', 'select=*&order=orden,creado_en.desc'),
    db.leer('mt_productos', 'select=id,nombre,slug,estado&order=nombre'),
  ]);
} catch (e) {
  raiz.innerHTML = `<div class="bg-surface-container-lowest rounded-xl shadow-sm">${vacio({ icono: 'cloud_off', titulo: 'No se pudo cargar el contenido', texto: esc(e.message), accion: '<button type="button" class="btn-primario" onclick="location.reload()">Reintentar</button>' })}</div>`;
  throw e;
}

const datos = {};
const guardado = {};
const editado = {};
for (const clave of Object.keys(VACIO)) {
  const fila = filas.find((f) => f.clave === clave);
  datos[clave] = NORMALIZAR[clave](fila ? fila.valor : VACIO[clave]);
  guardado[clave] = JSON.stringify(datos[clave]);
  editado[clave] = fila?.actualizado_en || null;
}
const productosPorId = new Map(productos.map((p) => [p.id, p]));
const publicados = productos.filter((p) => p.estado === 'publicado');
const productoMuestra = publicados[0] || null;
let legalActual = 'devoluciones';

const sucia = (pid) => (PESTANAS.find((p) => p.id === pid)?.claves || []).some((k) => JSON.stringify(datos[k]) !== guardado[k]);
const panel = (pid) => $(`[data-panel="${pid}"]`, raiz);
const ENLACES = {
  beneficios: () => ruta('index.html#beneficios'),
  faq: () => ruta('soporte.html#preguntas'),
  envios: () => ruta(productoMuestra ? `producto.html?p=${encodeURIComponent(productoMuestra.slug)}` : 'catalogo.html'),
  pie: () => ruta('soporte.html'),
  legal: () => ruta(`legal.html#${legalActual}`),
};

// ---------------- Piezas de interfaz ----------------
function tarjeta({ numero = '', icono, titulo, texto = '', extra = '', cuerpo = '' }) {
  return `<section class="bg-surface-container-lowest rounded-xl p-space-md sm:p-space-lg shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
    <div class="flex items-start justify-between gap-space-sm pb-space-sm mb-space-sm">
      <div class="flex items-start gap-space-sm min-w-0">
        <div class="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">${ico(icono, 'text-[18px]')}</div>
        <div class="min-w-0"><h2 class="font-headline-sm text-headline-sm text-on-surface">${numero ? `${numero}. ` : ''}${titulo}</h2>
          ${texto ? `<p class="font-body-sm text-body-sm text-outline">${texto}</p>` : ''}</div></div>
      ${extra}</div>
    ${cuerpo}</section>`;
}

const tarjetaVista = (lugar, texto, html) => `<div class="bg-surface-container-lowest rounded-xl p-space-md sm:p-space-lg shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
    <div class="flex items-center justify-between gap-2 mb-1">
      <h3 class="font-headline-sm text-headline-sm text-on-surface flex items-center gap-space-xs">${ico('smartphone', 'text-primary text-[20px]')}<span>Vista previa</span></h3>
      <span class="px-2 py-0.5 rounded bg-surface-container text-primary font-label-sm text-label-sm font-bold">${lugar}</span></div>
    <p class="font-body-sm text-body-sm text-outline mb-space-md">${texto}</p>
    <div class="rounded-xl bg-surface p-3 sm:p-4">${html}</div></div>`;

const sinContenido = (texto) => `<p class="py-6 px-4 rounded-xl border-2 border-dashed border-surface-container-high text-center font-body-sm text-body-sm text-outline">${texto}</p>`;

const textoEditado = (p) => {
  const f = p.claves.map((k) => editado[k]).filter(Boolean).sort().pop();
  return f ? `Última edición: ${hace(f).toLowerCase()}` : 'Todavía no se ha guardado';
};

/** Barra fija de cada pestaña: estado, "Ver en la tienda", Descartar y Guardar. */
function barra(pid) {
  const p = PESTANAS.find((x) => x.id === pid);
  return `<div class="sticky top-16 z-20 -mx-4 lg:-mx-space-lg px-4 lg:px-space-lg py-2 bg-surface/90 backdrop-blur">
    <div class="flex flex-wrap items-center justify-between gap-2 bg-surface-container-lowest rounded-xl px-3 sm:px-space-md py-2 shadow-sm">
      <div class="flex items-center gap-2 min-w-0 font-body-sm text-body-sm text-on-surface-variant">${ico('history', 'text-[18px] text-outline')}
        <span class="truncate" data-editado="${pid}">${esc(textoEditado(p))}</span>
        <span data-sucio="${pid}" class="chip-ambar hidden">Sin guardar</span></div>
      <div class="flex items-center gap-1.5 ml-auto">
        <a data-ver="${pid}" href="${esc(ENLACES[pid]())}" target="_blank" rel="noopener" class="btn-secundario btn-sm" title="Abre la tienda en otra pestaña">${ico('open_in_new', 'text-[16px]')}<span class="hidden sm:inline">Ver en la tienda</span><span class="sm:hidden">Ver</span></a>
        <button type="button" data-descartar="${pid}" class="btn-fantasma btn-sm" disabled title="Volver a lo último guardado">${ico('undo', 'text-[16px]')}<span class="hidden sm:inline">Descartar</span></button>
        <button type="button" data-guardar="${pid}" class="btn-primario btn-sm" disabled>${ico('save', 'text-[16px]')}<span>Guardar</span></button>
      </div></div></div>`;
}

function actualizarSucio(pid) {
  const s = sucia(pid);
  $(`[data-sucio="${pid}"]`, raiz)?.classList.toggle('hidden', !s);
  const g = $(`[data-guardar="${pid}"]`, raiz);
  if (g) g.disabled = !s;
  const d = $(`[data-descartar="${pid}"]`, raiz);
  if (d) d.disabled = !s;
  $(`[data-pestana="${pid}"] [data-punto]`, raiz)?.classList.toggle('hidden', !s);
}

function cambio(clave) {
  VISTAS[clave]?.();
  actualizarSucio(PESTANA_DE[clave]);
}

function contar(el, ambito = raiz) {
  const salida = $(`[data-cuenta="${el.id}"]`, ambito);
  if (salida) salida.textContent = `${el.value.length} / ${el.dataset.contar || el.maxLength}`;
}

/** Inserta texto en la posición del cursor (o al final si el campo no tenía el foco). */
function insertar(el, texto) {
  if (!el) return;
  if (document.activeElement !== el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  el.setRangeText(texto, el.selectionStart, el.selectionEnd, 'end');
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Botones de formato markdown para los textos legales. */
function aplicarMd(ta, tipo) {
  if (!ta) return;
  const { selectionStart: a, selectionEnd: b, value: v } = ta;
  const sel = v.slice(a, b);
  const envolver = (marca, relleno) => {
    const t = sel || relleno;
    ta.setRangeText(`${marca}${t}${marca}`, a, b, 'end');
    ta.setSelectionRange(a + marca.length, a + marca.length + t.length);
  };
  const porLineas = (fn) => {
    const ini = a === 0 ? 0 : v.lastIndexOf('\n', a - 1) + 1;
    const corte = v.indexOf('\n', b > a && v[b - 1] === '\n' ? b - 1 : b);
    const fin = corte === -1 ? v.length : corte;
    ta.setRangeText(v.slice(ini, fin).split('\n').map(fn).join('\n'), ini, fin, 'select');
  };
  if (tipo === 'negrita') envolver('**', 'texto en negrita');
  else if (tipo === 'cursiva') envolver('*', 'texto en cursiva');
  else if (tipo === 'enlace') {
    const t = sel || 'texto del enlace';
    ta.setRangeText(`[${t}](https://)`, a, b, 'end');
    const pos = a + t.length + 11;
    ta.setSelectionRange(pos, pos);
  } else if (tipo === 'titulo') porLineas((l) => (/^#{1,4}\s/.test(l) || !l.trim() ? l : `## ${l}`));
  else if (tipo === 'lista') porLineas((l) => (/^[-*•]\s/.test(l) || !l.trim() ? l : `- ${l}`));
  else if (tipo === 'numerada') { let n = 0; porLineas((l) => (/^\d+[.)]\s/.test(l) || !l.trim() ? l : `${++n}. ${l}`)); }
  ta.focus();
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

const claseTab = (activa) => `relative px-3 sm:px-space-md py-2 rounded-lg font-label-md text-label-md whitespace-nowrap transition-all flex items-center gap-1.5 ${activa ? 'bg-surface-container-lowest text-primary font-bold shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`;

function htmlCabecera() {
  return `<div class="flex flex-col xl:flex-row xl:items-end justify-between gap-space-md">
    <div><span class="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-bold">Sistema • Tienda pública</span>
      <h1 class="font-headline-lg-mobile text-headline-lg-mobile lg:font-headline-lg lg:text-headline-lg text-on-surface tracking-tight">Contenido Tienda</h1>
      <p class="font-body-md text-body-md text-on-surface-variant">Textos, reseñas y políticas que ven tus clientes. Los cambios se publican al guardar.</p></div>
    <a href="${esc(ruta('index.html'))}" target="_blank" rel="noopener" class="self-start xl:self-auto flex items-center gap-space-xs px-3.5 py-2 rounded-xl bg-surface-container-lowest hover:bg-surface-container-low text-on-surface font-label-md text-label-md shadow-sm transition-all">${ico('storefront', 'text-[18px] text-primary')}<span>Abrir la tienda</span>${ico('open_in_new', 'text-[16px] text-outline')}</a>
  </div>
  <div class="flex items-center bg-surface-container-low p-1 rounded-xl shadow-sm overflow-x-auto no-scrollbar" role="tablist" aria-label="Secciones del contenido">
    ${PESTANAS.map((p) => `<a href="#${p.id}" id="tab-${p.id}" role="tab" data-pestana="${p.id}" aria-controls="panel-${p.id}" aria-selected="false" class="${claseTab(false)}">${ico(p.icono, 'text-[18px]')}<span>${p.texto}</span><span data-punto class="hidden w-2 h-2 rounded-full bg-[#F59E0B]" title="Cambios sin guardar"></span></a>`).join('')}
  </div>`;
}

// ---------------- Listas (puntos y preguntas) ----------------
const claseIcono = (color) => `w-12 h-12 rounded-full ${claseColor(color)} flex items-center justify-center shrink-0 transition hover:ring-2 hover:ring-primary/40`;

const controlesFila = (i, total) => `<div class="flex flex-col gap-1 shrink-0">
    <button type="button" data-mover="-1" class="btn-icono w-8 h-8" ${i === 0 ? 'disabled' : ''} aria-label="Subir">${ico('arrow_upward', 'text-[18px]')}</button>
    <button type="button" data-mover="1" class="btn-icono w-8 h-8" ${i === total - 1 ? 'disabled' : ''} aria-label="Bajar">${ico('arrow_downward', 'text-[18px]')}</button>
    <button type="button" data-quitar class="btn-icono w-8 h-8 hover:text-error hover:bg-error-container" aria-label="Quitar">${ico('delete', 'text-[18px]')}</button></div>`;

function filaPunto(lista, x, i, total) {
  const id = `${lista}-${i}`;
  return `<div data-lista="${lista}" data-i="${i}" class="p-space-sm sm:p-space-md rounded-xl bg-surface-container-low flex gap-space-sm">
    <button type="button" data-icono class="${claseIcono(x.color)}" title="Cambiar icono" aria-label="Cambiar icono">${ico(x.icono || 'verified', 'text-[24px]', x.color === 'whatsapp')}</button>
    <div class="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-2">
      <div class="sm:col-span-2"><label class="etiqueta" for="${id}-titulo">Título</label>
        <input id="${id}-titulo" class="campo" data-campo="titulo" maxlength="60" value="${esc(x.titulo)}" placeholder="Ej: Envíos rápidos"></div>
      <div><label class="etiqueta" for="${id}-color">Color</label>
        <select id="${id}-color" class="campo" data-campo="color">${COLORES.map(([c, t]) => `<option value="${c}" ${c === x.color ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="sm:col-span-3"><label class="etiqueta" for="${id}-texto">Descripción</label>
        <textarea id="${id}-texto" class="campo" rows="2" data-campo="texto" maxlength="200" placeholder="Una frase corta que explique el beneficio">${esc(x.texto)}</textarea></div>
    </div>
    ${controlesFila(i, total)}</div>`;
}

function filaFaq(f, i, total) {
  const id = `pf-${i}`;
  return `<div data-lista="faq" data-i="${i}" class="p-space-sm sm:p-space-md rounded-xl bg-surface-container-low flex gap-space-sm">
    <span class="hidden sm:flex w-7 h-7 mt-7 rounded-full bg-primary/10 text-primary font-label-md text-label-md items-center justify-center shrink-0 tnum">${i + 1}</span>
    <div class="flex-1 min-w-0 flex flex-col gap-2">
      <div><label class="etiqueta" for="${id}-p">Pregunta</label>
        <input id="${id}-p" class="campo" data-campo="pregunta" maxlength="160" value="${esc(f.pregunta)}" placeholder="Ej: ¿Hacen envíos a mi ciudad?"></div>
      <div><label class="etiqueta" for="${id}-r">Respuesta</label>
        <textarea id="${id}-r" class="campo" rows="3" data-campo="respuesta" maxlength="1500" placeholder="Responde con claridad y en pocas líneas">${esc(f.respuesta)}</textarea></div>
    </div>
    ${controlesFila(i, total)}</div>`;
}

const cuerpoLista = (lista, textoBoton, ayuda = '') => `<div data-lista-cont="${lista}" class="flex flex-col gap-space-sm"></div>
  <div class="mt-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-2">
    <button type="button" data-agregar="${lista}" class="btn-secundario w-full sm:w-auto">${ico('add', 'text-[18px]')}<span>${textoBoton}</span></button>
    ${ayuda ? `<p class="ayuda mt-0">${ayuda}</p>` : ''}</div>`;
const contadorLista = (lista) => `<span data-contador-lista="${lista}" class="font-label-sm text-label-sm uppercase tracking-wider text-outline whitespace-nowrap shrink-0 tnum"></span>`;

function pintarLista(lista) {
  const def = LISTAS[lista];
  const arr = def.arreglo();
  const cont = $(`[data-lista-cont="${lista}"]`, raiz);
  if (!cont) return;
  cont.innerHTML = arr.length
    ? arr.map((x, i) => (lista === 'faq' ? filaFaq(x, i, arr.length) : filaPunto(lista, x, i, arr.length))).join('')
    : sinContenido(`${lista === 'faq' ? 'Aún no hay preguntas.' : 'Aún no hay puntos.'} Usa el botón de abajo para agregar.`);
  const boton = $(`[data-agregar="${lista}"]`, raiz);
  if (boton) boton.disabled = arr.length >= def.max;
  const cuenta = $(`[data-contador-lista="${lista}"]`, raiz);
  if (cuenta) cuenta.textContent = `${arr.length} / ${def.max}`;
}

function agregarElemento(lista) {
  const def = LISTAS[lista];
  const arr = def.arreglo();
  if (arr.length >= def.max) return;
  arr.push(lista === 'faq' ? { pregunta: '', respuesta: '' } : { icono: 'verified', color: 'primary', titulo: '', texto: '' });
  pintarLista(lista);
  cambio(def.clave);
  $(`[data-lista="${lista}"][data-i="${arr.length - 1}"] input`, raiz)?.focus();
}

async function accionFila(fila, t) {
  const lista = fila.dataset.lista;
  const def = LISTAS[lista];
  const arr = def.arreglo();
  const i = Number(fila.dataset.i);
  if (!arr[i]) return;
  if (t.closest('[data-icono]')) {
    const nuevo = await elegirIcono(arr[i].icono);
    if (nuevo) { arr[i].icono = nuevo; pintarLista(lista); cambio(def.clave); }
    return;
  }
  const m = t.closest('[data-mover]');
  if (m) {
    const dir = Number(m.dataset.mover);
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    pintarLista(lista);
    cambio(def.clave);
    const destino = $(`[data-lista="${lista}"][data-i="${j}"] [data-mover="${dir}"]`, raiz);
    (destino && !destino.disabled ? destino : $(`[data-lista="${lista}"][data-i="${j}"] [data-mover="${-dir}"]`, raiz))?.focus();
    return;
  }
  if (t.closest('[data-quitar]')) {
    arr.splice(i, 1);
    pintarLista(lista);
    cambio(def.clave);
  }
}

// ---------------- Vistas previas ----------------
const VISTAS = {
  beneficios() {
    const el = $('[data-vista="beneficios"]', raiz);
    if (el) el.innerHTML = beneficiosHtml(LIMPIAR.beneficios(datos.beneficios), tienda().nombre || 'MI TIENDA') || sinContenido('Sin puntos destacados, esta sección no aparece en la tienda.');
  },
  faq() {
    const el = $('[data-vista="faq"]', raiz);
    if (!el) return;
    const abierta = $$('[data-faq]', el).findIndex((b) => b.getAttribute('aria-expanded') === 'true');
    const items = LIMPIAR.faq(datos.faq);
    el.innerHTML = items.length ? faqHtml(items) : sinContenido('Sin preguntas, la sección de preguntas frecuentes queda vacía.');
    if (abierta >= 0) $$('[data-faq]', el)[abierta]?.click();
  },
  garantia_envios() {
    const el = $('[data-vista="envios"]', raiz);
    if (!el) return;
    const ge = LIMPIAR.garantia_envios(datos.garantia_envios);
    const c = tienda();
    el.innerHTML = `<div class="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2" aria-hidden="true">
        ${['Descripción', 'Especificaciones', 'Garantía & Envíos'].map((t, i) => `<span class="px-4 py-2 rounded-full font-label-lg text-label-lg shrink-0 ${i === 2 ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface-container text-on-surface-variant'}">${t}</span>`).join('')}</div>
      <div class="p-space-md rounded-xl bg-surface-container-low shadow-sm flex flex-col gap-space-sm text-on-surface">
        ${ge.length ? ge.map((x, i) => `<div class="flex items-start gap-3 ${i ? 'mt-2' : ''}">${ico(x.icono || 'verified', `text-[24px] shrink-0 ${claseColor(x.color).split(' ').find((k) => k.startsWith('text-'))}`)}
          <div><span class="font-label-lg text-label-lg font-bold block">${esc(x.titulo)}</span><p class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">${esc(x.texto)}</p></div></div>`).join('')
        : '<p class="font-body-sm text-body-sm text-outline italic">Sin puntos: la pestaña sólo mostrará el aviso de envío gratis (si está configurado).</p>'}
        ${c.envio_gratis_desde != null ? `<p class="font-body-sm text-body-sm text-primary font-semibold flex items-center gap-1 mt-1">${ico('local_shipping', 'text-[16px]')} Envío gratis en pedidos desde ${esc(dineroPanel(c.envio_gratis_desde))}</p>` : ''}
      </div>`;
  },
  pie() {
    const el = $('[data-vista="pie"]', raiz);
    if (!el) return;
    const c = tienda();
    const redes = Object.entries(c.redes || {}).filter(([, v]) => v);
    const iconosRed = { instagram: 'photo_camera', facebook: 'thumb_up', tiktok: 'music_note' };
    el.innerHTML = `<div class="p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-xs">
      <div class="flex items-center gap-2">${ico('storefront', 'text-primary text-[26px]')}<span class="font-headline-sm text-headline-sm text-on-surface">${esc(c.nombre || 'MI TIENDA')} Oficial</span></div>
      <p class="font-body-sm text-body-sm text-on-surface-variant">${esc(limpio(datos.pie.texto)) || '<span class="italic text-outline">Sin texto</span>'}</p>
      ${redes.length ? `<div class="flex gap-2 pt-1">${redes.map(([red]) => `<span class="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-primary" title="${esc(red)}">${ico(iconosRed[red] || 'public', 'text-[18px]')}</span>`).join('')}</div>` : ''}
    </div>`;
  },
  soporte() {
    const el = $('[data-vista="soporte"]', raiz);
    if (!el) return;
    el.innerHTML = `<div class="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary via-primary-container to-inverse-surface text-on-primary p-space-md sm:p-space-lg shadow-lg">
      <div class="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-secondary-fixed/20 blur-2xl"></div>
      <div class="relative flex flex-col gap-space-sm">
        <div class="inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-full bg-surface-container-lowest/20 backdrop-blur-md">${ico('support_agent', 'text-secondary-fixed text-[16px]', true)}<span class="font-label-sm text-label-sm tracking-wide uppercase text-surface-bright">Centro de soporte</span></div>
        <h3 class="font-headline-md text-headline-md">${esc(limpio(datos.soporte.titulo) || '¿En qué te ayudamos?')}</h3>
        <p class="font-body-md text-body-md text-on-primary-container/90">${esc(limpio(datos.soporte.texto))}</p>
      </div></div>`;
  },
  legal() {
    const nav = $('[data-legal-nav]', raiz);
    if (nav) nav.innerHTML = LEGALES.map(botonLegal).join('');
    const previa = $(`[data-previa="${legalActual}"]`, raiz);
    if (previa && !previa.classList.contains('hidden')) previa.innerHTML = htmlPrevia(legalActual);
  },
};

// ---------------- Pestaña: ¿Por qué comprar? ----------------
function pintarBeneficios() {
  const b = datos.beneficios;
  panel('beneficios').innerHTML = `${barra('beneficios')}
    <div class="grid grid-cols-1 xl:grid-cols-12 gap-space-lg items-start">
      <div class="xl:col-span-7 flex flex-col gap-space-lg">
        ${tarjeta({ numero: 1, icono: 'edit_note', titulo: 'Encabezado de la sección', texto: 'Bloque «¿Por qué comprar?» de la página de inicio.', cuerpo: `<div class="grid grid-cols-1 gap-space-md">
          <div><div class="flex items-center justify-between gap-2 mb-1.5"><label class="etiqueta mb-0" for="benEtiqueta">Rótulo pequeño</label>
              <button type="button" data-insertar="{tienda}" data-en="benEtiqueta" class="px-2 py-0.5 rounded-md bg-surface-container text-primary font-label-md text-label-md hover:bg-surface-container-high" title="Insertar el nombre de la tienda">+ {tienda}</button></div>
            <input id="benEtiqueta" class="campo" data-ruta="beneficios.etiqueta" maxlength="80" value="${esc(b.etiqueta)}" placeholder="¿Por qué comprar en {tienda}?">
            <p class="ayuda">{tienda} se reemplaza por «${esc(tienda().nombre || 'MI TIENDA')}».</p></div>
          <div><label class="etiqueta" for="benTitulo">Título</label>
            <input id="benTitulo" class="campo" data-ruta="beneficios.titulo" maxlength="80" value="${esc(b.titulo)}" placeholder="Ej: Comercio transparente y seguro"></div>
        </div>` })}
        ${tarjeta({ numero: 2, icono: 'interests', titulo: 'Puntos destacados', texto: 'Razones para comprarte. Se muestran en 2 columnas: lo ideal son 4. Toca el icono para cambiarlo.', extra: contadorLista('beneficios'), cuerpo: cuerpoLista('beneficios', 'Agregar punto') })}
      </div>
      <aside class="xl:col-span-5 xl:sticky xl:top-36">${tarjetaVista('Inicio', 'Así lo ven tus clientes en la página de inicio:', '<div data-vista="beneficios"></div>')}</aside>
    </div>`;
  pintarLista('beneficios');
  VISTAS.beneficios();
  actualizarSucio('beneficios');
}

// ---------------- Pestaña: Reseñas ----------------
const ordenResenas = (a, b) => num(a.orden) - num(b.orden) || String(b.creado_en || '').localeCompare(String(a.creado_en || ''));
const corto = (nombre) => {
  const n = txt(nombre).trim();
  if (n.length <= 32) return n;
  const cortado = n.slice(0, 33);
  return (cortado.includes(' ') ? cortado.slice(0, cortado.lastIndexOf(' ')) : n.slice(0, 32)).trim();
};

function avisoHonestidad(ejemplos) {
  return `<div class="flex items-start gap-3 p-3.5 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E]">
    ${ico('verified_user', 'text-[22px] shrink-0')}
    <div class="font-body-sm text-body-sm"><p class="font-label-lg text-label-lg">Publica sólo reseñas reales</p>
      <p>Registra opiniones que tus clientes te dieron de verdad (con su permiso) y marca «Compra verificada» sólo si la compra está en tus pedidos o chats. Inventar reseñas engaña a tus clientes y puede ir contra las leyes de protección al consumidor.${ejemplos ? ' Las reseñas marcadas como <strong>Ejemplo</strong> se muestran en la tienda con la etiqueta «Reseña de ejemplo» hasta que las borres.' : ''}</p></div></div>`;
}

function tarjetaResena(t, i, total) {
  const prod = t.producto_id ? productosPorId.get(t.producto_id) : null;
  const detalle = [t.ciudad, t.producto_texto ? `Compró ${t.producto_texto}` : prod?.nombre].filter(Boolean).join(' • ');
  return `<article data-resena="${esc(t.id)}" class="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-2.5 ${t.publicado ? '' : 'opacity-75'}">
    <div class="flex items-start justify-between gap-2">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-10 h-10 rounded-full bg-surface-container-high text-primary flex items-center justify-center font-headline-sm text-headline-sm shrink-0">${esc(iniciales(t.nombre).slice(0, 1))}</div>
        <div class="min-w-0"><p class="font-label-lg text-label-lg text-on-surface truncate">${esc(t.nombre)}</p>
          <p class="font-body-sm text-body-sm text-on-surface-variant truncate">${esc(detalle || 'Sin ciudad ni producto')}</p></div></div>
      <div class="flex text-amber-500 shrink-0" role="img" aria-label="${num(t.estrellas)} de 5 estrellas">${estrellas(num(t.estrellas), 'text-[16px]')}</div>
    </div>
    <p class="font-body-md text-body-md text-on-surface-variant italic line-clamp-4">“${esc(t.texto)}”</p>
    <div class="flex flex-wrap items-center gap-1.5">
      ${t.verificado ? `<span class="chip-wa">${ico('check_circle', 'text-[13px]', true)}Verificada</span>` : ''}
      ${t.ejemplo ? '<span class="chip-ambar" title="Se muestra como «Reseña de ejemplo» en la tienda">Ejemplo</span>' : ''}
      ${!t.publicado ? '<span class="chip-gris">Oculta</span>' : ''}
      ${prod && prod.estado !== 'publicado' ? '<span class="chip-gris" title="La reseña no aparece en una ficha porque el producto no está publicado">Producto no publicado</span>' : ''}
      <span class="chip-gris tnum" title="Orden en la tienda">#${num(t.orden)}</span>
    </div>
    <div class="mt-auto flex items-center justify-between gap-2 pt-2.5 border-t border-surface-container">
      <label class="flex items-center gap-2 cursor-pointer select-none"><input type="checkbox" class="interruptor" data-publicar ${t.publicado ? 'checked' : ''} aria-label="Publicar reseña de ${esc(t.nombre)}">
        <span class="font-label-md text-label-md ${t.publicado ? 'text-primary' : 'text-outline'}">${t.publicado ? 'Publicada' : 'Oculta'}</span></label>
      <div class="flex items-center gap-0.5">
        <button type="button" data-orden="-1" class="btn-icono w-8 h-8" ${i === 0 ? 'disabled' : ''} aria-label="Mostrar antes">${ico('arrow_upward', 'text-[18px]')}</button>
        <button type="button" data-orden="1" class="btn-icono w-8 h-8" ${i === total - 1 ? 'disabled' : ''} aria-label="Mostrar después">${ico('arrow_downward', 'text-[18px]')}</button>
        <button type="button" data-editar-resena class="btn-icono w-8 h-8" aria-label="Editar reseña de ${esc(t.nombre)}">${ico('edit', 'text-[18px]')}</button>
        <button type="button" data-eliminar-resena class="btn-icono w-8 h-8 hover:text-error hover:bg-error-container" aria-label="Eliminar reseña de ${esc(t.nombre)}">${ico('delete', 'text-[18px]')}</button>
      </div></div></article>`;
}

function pintarResenas() {
  const lista = [...resenas].sort(ordenResenas);
  const pub = lista.filter((t) => t.publicado);
  const ejemplos = lista.filter((t) => t.ejemplo).length;
  const promedio = pub.length ? pub.reduce((s, t) => s + num(t.estrellas), 0) / pub.length : 0;
  panel('resenas').innerHTML = `
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-space-sm bg-surface-container-lowest rounded-xl p-space-md shadow-sm">
      <div class="flex items-start gap-space-sm min-w-0">
        <div class="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">${ico('rate_review', 'text-[18px]')}</div>
        <div class="min-w-0"><h2 class="font-headline-sm text-headline-sm text-on-surface">Reseñas de clientes</h2>
          <p class="font-body-sm text-body-sm text-on-surface-variant">${lista.length} ${lista.length === 1 ? 'reseña' : 'reseñas'} · ${pub.length} ${pub.length === 1 ? 'publicada' : 'publicadas'}${pub.length ? ` · promedio ${promedio.toFixed(1).replace('.', ',')} de 5` : ''}. En el inicio se ven las 3 primeras; en cada ficha, las de ese producto.</p></div></div>
      <div class="flex flex-wrap items-center gap-2 shrink-0">
        <a href="${esc(ruta('index.html#resenas'))}" target="_blank" rel="noopener" class="btn-secundario btn-sm">${ico('open_in_new', 'text-[16px]')}<span>Ver en la tienda</span></a>
        ${ejemplos ? `<button type="button" data-borrar-ejemplos class="btn-peligro-suave btn-sm">${ico('delete_sweep', 'text-[16px]')}<span>Borrar ${ejemplos} de ejemplo</span></button>` : ''}
        <button type="button" data-nueva-resena class="btn-primario btn-sm">${ico('add', 'text-[16px]')}<span>Nueva reseña</span></button>
      </div></div>
    ${avisoHonestidad(ejemplos)}
    ${lista.length ? `<div class="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-space-md">${lista.map((t, i) => tarjetaResena(t, i, lista.length)).join('')}</div>`
    : `<div class="bg-surface-container-lowest rounded-xl shadow-sm">${vacio({ icono: 'rate_review', titulo: 'Aún no hay reseñas', texto: 'Cuando un cliente te deje su opinión por WhatsApp, pídele permiso y regístrala aquí.', accion: `<button type="button" data-nueva-resena class="btn-primario">${ico('add', 'text-[18px]')} Agregar la primera</button>` })}</div>`}`;
}

function opcionesProducto(sel) {
  const actual = sel ? productosPorId.get(sel) : null;
  const lista = actual && actual.estado !== 'publicado' ? [actual, ...publicados] : publicados;
  return `<option value="">Sin producto específico</option>
    ${sel && !actual ? `<option value="${esc(sel)}" selected>Producto eliminado</option>` : ''}
    ${lista.map((p) => `<option value="${esc(p.id)}" ${p.id === sel ? 'selected' : ''}>${esc(p.nombre)}${p.estado !== 'publicado' ? ` (${esc(p.estado)})` : ''}</option>`).join('')}`;
}

const selectorEstrellas = (n) => `<fieldset><legend class="etiqueta">Calificación</legend>
  <div class="flex flex-wrap items-center gap-0.5">${[1, 2, 3, 4, 5].map((k) => `<label class="cursor-pointer p-0.5 rounded-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary">
      <input type="radio" name="estrellas" value="${k}" class="sr-only" ${k === n ? 'checked' : ''} aria-label="${k} ${k === 1 ? 'estrella' : 'estrellas'}">
      <span data-estrella="${k}" class="${k <= n ? 'text-amber-500' : 'text-outline-variant'}">${ico('star', 'text-[30px]', true)}</span></label>`).join('')}
    <span data-estrellas-texto class="ml-2 font-label-md text-label-md text-on-surface-variant">${TEXTO_ESTRELLAS[n]}</span></div></fieldset>`;

const interruptorFila = (nombre, titulo, ayuda, activo) => `<label class="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] cursor-pointer">
  <span class="min-w-0"><span class="block font-label-lg text-label-lg text-[#0F172A]">${titulo}</span><span class="block font-body-sm text-body-sm text-[#64748B]">${ayuda}</span></span>
  <input type="checkbox" name="${nombre}" class="interruptor" ${activo ? 'checked' : ''}></label>`;

function formularioResena(t) {
  const n = Math.min(5, Math.max(1, num(t.estrellas) || 5));
  return `<div class="flex flex-col gap-3">
    ${t.ejemplo ? `<div class="flex items-start gap-2 p-3 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] font-body-sm text-body-sm">${ico('info', 'text-[18px] shrink-0')}<span>Es una reseña de <strong>ejemplo</strong>: en la tienda se muestra con la etiqueta «Reseña de ejemplo» hasta que la borres. Para una opinión real, crea una reseña nueva.</span></div>` : ''}
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div><label class="etiqueta" for="rNombre">Nombre del cliente <span class="text-error">*</span></label>
        <input id="rNombre" name="nombre" class="campo" maxlength="60" required value="${esc(t.nombre)}" placeholder="Ej: Mariana C." autocomplete="off"></div>
      <div><label class="etiqueta" for="rCiudad">Ciudad</label>
        <input id="rCiudad" name="ciudad" class="campo" maxlength="60" value="${esc(t.ciudad || '')}" placeholder="Ej: Miami" autocomplete="off"></div>
    </div>
    ${selectorEstrellas(n)}
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div><label class="etiqueta" for="rProducto">Producto comprado</label>
        <select id="rProducto" name="producto_id" class="campo">${opcionesProducto(t.producto_id)}</select>
        <p class="ayuda">Si eliges uno, la reseña también aparece en su ficha.</p></div>
      <div><label class="etiqueta" for="rProductoTexto">Nombre corto del producto</label>
        <input id="rProductoTexto" name="producto_texto" class="campo" maxlength="80" value="${esc(t.producto_texto || '')}" placeholder="Ej: Auriculares Pro" autocomplete="off">
        <p class="ayuda">Se muestra como «Compró …».</p></div>
    </div>
    <div><div class="flex items-center justify-between gap-2 mb-1.5"><label class="etiqueta mb-0" for="rTexto">Opinión del cliente <span class="text-error">*</span></label>
        <span data-cuenta="rTexto" class="font-label-sm text-label-sm text-outline tnum"></span></div>
      <textarea id="rTexto" name="texto" class="campo" rows="4" maxlength="600" data-contar="600" required placeholder="Copia sus palabras tal como te las dio.">${esc(t.texto)}</textarea></div>
    <div class="grid grid-cols-1 sm:grid-cols-[1fr_1fr_110px] gap-2">
      ${interruptorFila('verificado', 'Compra verificada', 'Sólo si la compra está en tus pedidos o chats.', t.verificado)}
      ${interruptorFila('publicado', 'Publicada', 'Visible en la tienda.', t.publicado)}
      <div><label class="etiqueta" for="rOrden">Orden</label><input id="rOrden" name="orden" type="number" step="1" class="campo tnum" value="${num(t.orden)}"></div>
    </div></div>`;
}

async function editarResena(t = null) {
  const nueva = !t;
  const base = t || { nombre: '', ciudad: '', producto_id: null, producto_texto: '', texto: '', estrellas: 5, verificado: false, publicado: true, orden: resenas.reduce((m, x) => Math.max(m, num(x.orden)), 0) + 1, ejemplo: false };
  const r = await modal({
    titulo: nueva ? 'Nueva reseña' : 'Editar reseña', icono: 'rate_review', ancho: 'lg',
    subtitulo: nueva ? 'Registra la opinión real de un cliente (con su permiso).' : esc(`Reseña de ${t.nombre}`),
    textoEnviar: nueva ? 'Agregar reseña' : 'Guardar cambios',
    contenido: formularioResena(base),
    alAbrir: (capa) => {
      const pintarEstrellas = () => {
        const n = Number($('[name="estrellas"]:checked', capa)?.value || 5);
        $$('[data-estrella]', capa).forEach((s) => { s.className = Number(s.dataset.estrella) <= n ? 'text-amber-500' : 'text-outline-variant'; });
        $('[data-estrellas-texto]', capa).textContent = TEXTO_ESTRELLAS[n];
      };
      capa.addEventListener('change', (e) => { if (e.target.name === 'estrellas') pintarEstrellas(); });
      const sel = $('#rProducto', capa);
      const texto = $('#rProductoTexto', capa);
      let sugerido = corto(productosPorId.get(sel.value)?.nombre);
      sel.addEventListener('change', () => {
        const nuevo = corto(productosPorId.get(sel.value)?.nombre);
        if (!texto.value.trim() || texto.value.trim() === sugerido) texto.value = nuevo;
        sugerido = nuevo;
      });
      const ta = $('#rTexto', capa);
      contar(ta, capa);
      ta.addEventListener('input', () => contar(ta, capa));
    },
    alEnviar: async (form) => {
      const d = leerFormulario(form);
      if (!d.nombre) throw new Error('Escribe el nombre del cliente.');
      if ((d.texto || '').length < 5) throw new Error('La opinión debe tener al menos 5 caracteres.');
      const fila = {
        nombre: d.nombre, ciudad: d.ciudad || null, producto_id: d.producto_id || null, producto_texto: d.producto_texto || null, texto: d.texto,
        estrellas: Math.min(5, Math.max(1, Number(d.estrellas) || 5)), verificado: !!d.verificado, publicado: !!d.publicado,
        orden: Number.isFinite(d.orden) ? Math.round(d.orden) : 0,
      };
      if (nueva) {
        const [creada] = await db.crear('mt_testimonios', [fila]);
        resenas.push(creada || { ...fila, id: crypto.randomUUID(), ejemplo: false, creado_en: new Date().toISOString() });
      } else {
        const [act] = await db.actualizar('mt_testimonios', `id=eq.${t.id}`, fila);
        Object.assign(t, act || fila);
      }
      return true;
    },
  });
  if (r) { pintarResenas(); toast(nueva ? 'Reseña agregada' : 'Reseña actualizada'); }
}

async function publicarResena(t, casilla) {
  const valor = casilla.checked;
  casilla.disabled = true;
  try {
    await db.actualizar('mt_testimonios', `id=eq.${t.id}`, { publicado: valor });
    t.publicado = valor;
    pintarResenas();
    toast(valor ? 'Reseña publicada en la tienda' : 'Reseña oculta de la tienda', { tipo: valor ? 'ok' : 'info' });
  } catch (e) { casilla.checked = !valor; casilla.disabled = false; toastError(e); }
}

async function moverResena(id, dir) {
  const lista = [...resenas].sort(ordenResenas);
  const i = lista.findIndex((t) => t.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  const antes = new Map(lista.map((t) => [t.id, t.orden]));
  const cambios = lista.map((t, k) => ({ t, orden: k + 1 })).filter(({ t, orden }) => num(t.orden) !== orden);
  cambios.forEach(({ t, orden }) => { t.orden = orden; });
  pintarResenas();
  $(`[data-resena="${id}"] [data-orden="${dir}"]:not([disabled])`, raiz)?.focus();
  try {
    await Promise.all(cambios.map(({ t, orden }) => db.actualizar('mt_testimonios', `id=eq.${t.id}`, { orden })));
  } catch (e) {
    lista.forEach((t) => { t.orden = antes.get(t.id); });
    pintarResenas();
    toastError(e);
  }
}

async function eliminarResena(t) {
  const ok = await confirmar({ titulo: 'Eliminar reseña', mensaje: `Se borrará la reseña de <strong>${esc(t.nombre)}</strong>. No se puede deshacer.`, boton: 'Eliminar', peligro: true });
  if (!ok) return;
  try {
    await db.borrar('mt_testimonios', `id=eq.${t.id}`);
    resenas = resenas.filter((x) => x.id !== t.id);
    pintarResenas();
    toast('Reseña eliminada');
  } catch (e) { toastError(e); }
}

async function borrarEjemplos() {
  const n = resenas.filter((t) => t.ejemplo).length;
  const ok = await confirmar({ titulo: 'Borrar reseñas de ejemplo', mensaje: `Se eliminarán las ${n} reseñas de muestra que trae la tienda. Tus reseñas reales no se tocan.`, boton: 'Borrar ejemplos', peligro: true });
  if (!ok) return;
  try {
    await db.borrar('mt_testimonios', 'ejemplo=eq.true');
    resenas = resenas.filter((t) => !t.ejemplo);
    pintarResenas();
    toast('Reseñas de ejemplo eliminadas');
  } catch (e) { toastError(e); }
}

// ---------------- Pestaña: Preguntas frecuentes ----------------
function pintarFaq() {
  panel('faq').innerHTML = `${barra('faq')}
    <div class="grid grid-cols-1 xl:grid-cols-12 gap-space-lg items-start">
      <div class="xl:col-span-7">${tarjeta({ numero: 1, icono: 'help', titulo: 'Preguntas frecuentes', texto: 'Se ven completas en Soporte y las 3 primeras en la página de inicio.', extra: contadorLista('faq'), cuerpo: cuerpoLista('faq', 'Agregar pregunta', AYUDA_MD) })}</div>
      <aside class="xl:col-span-5 xl:sticky xl:top-36">${tarjetaVista('Soporte', 'Así se ven en el centro de soporte (toca una pregunta para abrirla):', '<div data-vista="faq" class="flex flex-col gap-space-xs"></div>')}</aside>
    </div>`;
  pintarLista('faq');
  conectarFaq($('[data-vista="faq"]', raiz));
  VISTAS.faq();
  actualizarSucio('faq');
}

// ---------------- Pestaña: Garantía & envíos ----------------
function pintarEnvios() {
  panel('envios').innerHTML = `${barra('envios')}
    <div class="grid grid-cols-1 xl:grid-cols-12 gap-space-lg items-start">
      <div class="xl:col-span-7 flex flex-col gap-space-lg">
        ${tarjeta({ numero: 1, icono: 'local_shipping', titulo: 'Garantía y envíos', texto: 'Puntos de la pestaña «Garantía & Envíos» en la ficha de cada producto.', extra: contadorLista('envios'), cuerpo: cuerpoLista('envios', 'Agregar punto') })}
        <div class="flex items-start gap-2 p-3.5 rounded-xl bg-surface-container-low font-body-sm text-body-sm text-on-surface-variant">${ico('info', 'text-[18px] text-primary shrink-0')}
          <span>El aviso «Envío gratis en pedidos desde …» se agrega solo según el monto configurado${puede('config') ? ' en <a class="text-primary font-semibold hover:underline" href="configuracion.html#envios">Configuración → Envíos y precios</a>' : ' en Configuración'}.</span></div>
      </div>
      <aside class="xl:col-span-5 xl:sticky xl:top-36">${tarjetaVista('Producto', 'Así se ve la pestaña en la ficha de producto:', '<div data-vista="envios"></div>')}</aside>
    </div>`;
  pintarLista('envios');
  VISTAS.garantia_envios();
  actualizarSucio('envios');
}

// ---------------- Pestaña: Pie y soporte ----------------
function pintarPie() {
  panel('pie').innerHTML = `${barra('pie')}
    <div class="grid grid-cols-1 xl:grid-cols-12 gap-space-lg items-start">
      <div class="xl:col-span-7 flex flex-col gap-space-lg">
        ${tarjeta({ numero: 1, icono: 'storefront', titulo: 'Pie de página', texto: 'Texto bajo el nombre de la tienda, al final de todas las páginas.', cuerpo: `
          <div class="flex items-center justify-between gap-2 mb-1.5"><label class="etiqueta mb-0" for="pieTexto">Descripción corta</label><span data-cuenta="pieTexto" class="font-label-sm text-label-sm text-outline tnum"></span></div>
          <textarea id="pieTexto" class="campo" rows="3" maxlength="300" data-contar="300" data-ruta="pie.texto" placeholder="Cuenta en una o dos frases qué vendes y por qué confiar en ti">${esc(datos.pie.texto)}</textarea>
          ${puede('config') ? `<p class="mt-space-sm font-body-sm text-body-sm text-on-surface-variant flex items-start gap-1.5">${ico('info', 'text-[16px] text-primary shrink-0')}<span>El horario, el WhatsApp y las redes sociales del pie se editan en <a class="text-primary font-semibold hover:underline" href="configuracion.html#contacto">Configuración → Contacto y redes</a>.</span></p>` : ''}` })}
        ${tarjeta({ numero: 2, icono: 'support_agent', titulo: 'Centro de soporte', texto: 'Encabezado de la página Soporte.', cuerpo: `<div class="grid grid-cols-1 gap-space-md">
          <div><label class="etiqueta" for="sopTitulo">Título</label>
            <input id="sopTitulo" class="campo" maxlength="80" data-ruta="soporte.titulo" value="${esc(datos.soporte.titulo)}" placeholder="¿En qué te ayudamos?"></div>
          <div><div class="flex items-center justify-between gap-2 mb-1.5"><label class="etiqueta mb-0" for="sopTexto">Texto</label><span data-cuenta="sopTexto" class="font-label-sm text-label-sm text-outline tnum"></span></div>
            <textarea id="sopTexto" class="campo" rows="3" maxlength="400" data-contar="400" data-ruta="soporte.texto" placeholder="Cuándo respondes y qué datos tener a mano">${esc(datos.soporte.texto)}</textarea>
            <p class="ayuda">Ej.: indica tu horario de respuesta y pide el número de pedido (WA-1024).</p></div>
        </div>` })}
      </div>
      <aside class="xl:col-span-5 xl:sticky xl:top-36 flex flex-col gap-space-md">
        ${tarjetaVista('Soporte', 'Encabezado del centro de soporte:', '<div data-vista="soporte"></div>')}
        ${tarjetaVista('Pie', 'Primera columna del pie de página:', '<div data-vista="pie"></div>')}
      </aside>
    </div>`;
  $$('[data-contar]', panel('pie')).forEach((el) => contar(el));
  VISTAS.pie();
  VISTAS.soporte();
  actualizarSucio('pie');
}

// ---------------- Pestaña: Legales ----------------
const palabras = (t) => (limpio(t) ? limpio(t).split(/\s+/).length : 0);
const claseModo = (on) => `px-2.5 py-1.5 rounded-lg font-label-md text-label-md flex items-center gap-1 transition-all ${on ? 'bg-surface-container-lowest text-primary shadow-sm font-bold' : 'text-on-surface-variant hover:text-on-surface'}`;
const htmlPrevia = (id) => markdown(datos.legal[id]) || '<p class="italic text-outline">Sin contenido: la tienda mostrará «Contenido en preparación».</p>';

function botonLegal(l) {
  const on = l.id === legalActual;
  const n = palabras(datos.legal[l.id]);
  return `<button type="button" data-legal="${l.id}" aria-pressed="${on}" class="shrink-0 lg:w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left shadow-sm transition-all ${on ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'}">
    ${ico(l.icono, 'text-[20px]')}<span class="flex-1 font-label-lg text-label-lg">${l.texto}</span>
    <span class="hidden lg:inline font-label-sm text-label-sm ${on ? 'text-on-primary-container/80' : n ? 'text-outline' : 'text-error'}">${n ? `${n} palabras` : 'Vacío'}</span></button>`;
}

const editorLegal = (l) => `<section data-doc="${l.id}" class="${l.id === legalActual ? '' : 'hidden'} bg-surface-container-lowest rounded-xl p-space-md sm:p-space-lg shadow-[0_1px_3px_rgba(15,23,42,0.04)] flex flex-col gap-space-sm">
    <div class="flex flex-wrap items-start justify-between gap-space-sm">
      <div class="flex items-start gap-space-sm min-w-0">
        <div class="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">${ico(l.icono, 'text-[18px]')}</div>
        <div class="min-w-0"><h2 class="font-headline-sm text-headline-sm text-on-surface">${l.titulo}</h2>
          <p class="font-body-sm text-body-sm text-outline">Página «Garantía & Legal», enlazada desde el pie y Soporte.</p></div></div>
      <div class="flex items-center bg-surface-container-low p-1 rounded-xl" role="group" aria-label="Modo de edición">
        <button type="button" data-doc-modo="${l.id}" data-modo="editar" aria-pressed="true" class="${claseModo(true)}">${ico('edit', 'text-[16px]')}<span>Editar</span></button>
        <button type="button" data-doc-modo="${l.id}" data-modo="previa" aria-pressed="false" class="${claseModo(false)}">${ico('visibility', 'text-[16px]')}<span>Vista previa</span></button>
      </div>
    </div>
    <div data-editor-md="${l.id}" class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-1 p-1.5 rounded-lg bg-surface-container-low" role="toolbar" aria-label="Formato del texto">
        ${HERRAMIENTAS_MD.map((h) => `<button type="button" data-md="${h.id}" data-md-en="legal-${l.id}" class="btn-icono w-8 h-8" title="${h.texto}" aria-label="${h.texto}">${ico(h.icono, 'text-[18px]')}</button>`).join('')}
        <span class="ml-auto pr-2 font-label-sm text-label-sm text-outline hidden sm:inline">Markdown</span></div>
      <label class="sr-only" for="legal-${l.id}">${l.titulo}</label>
      <textarea id="legal-${l.id}" class="campo min-h-[320px]" rows="16" maxlength="20000" data-ruta="legal.${l.id}" placeholder="Escribe aquí ${l.titulo.toLowerCase()}…">${esc(datos.legal[l.id])}</textarea>
      <p class="ayuda mt-0">${AYUDA_MD} Empieza una línea con «## » para un subtítulo.</p>
    </div>
    <div data-previa="${l.id}" class="hidden prosa p-space-md sm:p-space-lg rounded-xl bg-surface min-h-[320px]"></div>
    <a href="${esc(ruta(`legal.html#${l.id}`))}" target="_blank" rel="noopener" class="self-start font-label-md text-label-md text-primary hover:underline flex items-center gap-1">${ico('open_in_new', 'text-[16px]')}Ver «${l.texto}» en la tienda</a>
  </section>`;

function pintarLegal() {
  panel('legal').innerHTML = `${barra('legal')}
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
      <nav data-legal-nav class="lg:col-span-3 lg:sticky lg:top-36 flex lg:flex-col gap-2 overflow-x-auto no-scrollbar pb-1 lg:pb-0" aria-label="Documentos legales">${LEGALES.map(botonLegal).join('')}</nav>
      <div class="lg:col-span-9">${LEGALES.map(editorLegal).join('')}</div>
    </div>`;
  actualizarSucio('legal');
}

function elegirLegal(id) {
  legalActual = id;
  $$('[data-doc]', raiz).forEach((s) => s.classList.toggle('hidden', s.dataset.doc !== id));
  $('[data-legal-nav]', raiz).innerHTML = LEGALES.map(botonLegal).join('');
  const ver = $('[data-ver="legal"]', raiz);
  if (ver) ver.href = ENLACES.legal();
}

function modoLegal(id, modo) {
  const sec = $(`[data-doc="${id}"]`, raiz);
  if (!sec) return;
  const previa = modo === 'previa';
  $(`[data-editor-md="${id}"]`, sec).classList.toggle('hidden', previa);
  const caja = $(`[data-previa="${id}"]`, sec);
  caja.classList.toggle('hidden', !previa);
  if (previa) caja.innerHTML = htmlPrevia(id);
  $$('[data-doc-modo]', sec).forEach((b) => { const on = b.dataset.modo === modo; b.setAttribute('aria-pressed', String(on)); b.className = claseModo(on); });
  if (!previa) $(`#legal-${id}`, sec)?.focus();
}

// ---------------- Guardar / descartar ----------------
const VALIDAR = {
  beneficios() {
    const b = datos.beneficios;
    const i = b.items.findIndex((x) => !limpio(x.titulo) && limpio(x.texto));
    if (i >= 0) return [`Falta el título del punto ${i + 1}.`, `#beneficios-${i}-titulo`];
    if (LIMPIAR.beneficios(b).items.length && !limpio(b.titulo)) return ['Escribe el título de la sección.', '#benTitulo'];
    return null;
  },
  envios() {
    const i = datos.garantia_envios.findIndex((x) => !limpio(x.titulo) && limpio(x.texto));
    return i >= 0 ? [`Falta el título del punto ${i + 1}.`, `#envios-${i}-titulo`] : null;
  },
  faq() {
    const i = datos.faq.findIndex((f) => !limpio(f.pregunta) !== !limpio(f.respuesta));
    if (i < 0) return null;
    return !limpio(datos.faq[i].pregunta) ? [`Falta la pregunta ${i + 1}.`, `#pf-${i}-p`] : [`Falta la respuesta de la pregunta ${i + 1}.`, `#pf-${i}-r`];
  },
};

async function guardar(pid, boton) {
  const p = PESTANAS.find((x) => x.id === pid);
  const error = VALIDAR[pid]?.();
  if (error) {
    toast(error[0], { tipo: 'error' });
    const el = $(error[1], raiz);
    el?.classList.add('campo-error');
    el?.focus();
    return;
  }
  const nuevas = p.claves.map((clave) => ({ clave, valor: LIMPIAR[clave](datos[clave]) }));
  const antes = boton.innerHTML;
  boton.disabled = true;
  boton.innerHTML = `${spinner()}<span>Guardando</span>`;
  try {
    const r = await db.upsert('mt_contenido', nuevas, 'clave');
    for (const { clave, valor } of nuevas) {
      datos[clave] = NORMALIZAR[clave](valor);
      guardado[clave] = JSON.stringify(datos[clave]);
      editado[clave] = (Array.isArray(r) ? r : []).find((f) => f.clave === clave)?.actualizado_en || new Date().toISOString();
    }
    PINTAR[pid]();
    toast('Cambios guardados. Ya se ven en la tienda.');
  } catch (e) {
    toastError(e);
    boton.innerHTML = antes;
    boton.disabled = false;
  }
}

async function descartar(pid) {
  const ok = await confirmar({ titulo: 'Descartar cambios', mensaje: 'Se perderán los cambios que no guardaste en esta pestaña.', boton: 'Descartar', icono: 'undo' });
  if (!ok) return;
  PESTANAS.find((x) => x.id === pid).claves.forEach((k) => { datos[k] = NORMALIZAR[k](JSON.parse(guardado[k])); });
  PINTAR[pid]();
  toast('Cambios descartados', { tipo: 'info' });
}

// ---------------- Pestañas ----------------
const PINTAR = { beneficios: pintarBeneficios, resenas: pintarResenas, faq: pintarFaq, envios: pintarEnvios, pie: pintarPie, legal: pintarLegal };

function activar(pid) {
  if (!PESTANAS.some((p) => p.id === pid)) pid = 'beneficios';
  $$('[data-pestana]', raiz).forEach((a) => { const on = a.dataset.pestana === pid; a.setAttribute('aria-selected', String(on)); a.className = claseTab(on); });
  $$('[data-panel]', raiz).forEach((s) => s.classList.toggle('hidden', s.dataset.panel !== pid));
  if (location.hash !== `#${pid}`) history.replaceState(null, '', `#${pid}`);
  $(`[data-pestana="${pid}"]`, raiz)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// ---------------- Eventos ----------------
function alEscribir(e) {
  const el = e.target;
  if (!raiz.contains(el)) return;
  el.classList?.remove('campo-error');
  if (el.dataset?.contar) contar(el);
  if (el.dataset?.ruta) {
    const [clave, campo] = el.dataset.ruta.split('.');
    datos[clave][campo] = el.value;
    cambio(clave);
    return;
  }
  const fila = el.closest?.('[data-lista]');
  if (fila && el.dataset.campo) {
    const def = LISTAS[fila.dataset.lista];
    const x = def.arreglo()[Number(fila.dataset.i)];
    if (!x) return;
    x[el.dataset.campo] = el.value;
    if (el.dataset.campo === 'color') {
      const b = $('[data-icono]', fila);
      b.className = claseIcono(x.color);
      b.innerHTML = ico(x.icono || 'verified', 'text-[24px]', x.color === 'whatsapp');
    }
    cambio(def.clave);
  }
}

raiz.innerHTML = `${htmlCabecera()}${PESTANAS.map((p) => `<section id="panel-${p.id}" data-panel="${p.id}" role="tabpanel" aria-labelledby="tab-${p.id}" class="hidden space-y-space-md"></section>`).join('')}`;
Object.values(PINTAR).forEach((pintar) => pintar());
activar(location.hash.slice(1));

raiz.addEventListener('input', alEscribir);
raiz.addEventListener('change', (e) => {
  if (e.target.tagName === 'SELECT') { alEscribir(e); return; }
  if (e.target.matches('[data-publicar]')) {
    const t = resenas.find((x) => x.id === e.target.closest('[data-resena]')?.dataset.resena);
    if (t) publicarResena(t, e.target);
  }
});
// Los chips de inserción y los botones de formato no le quitan el foco (ni el cursor) al campo.
raiz.addEventListener('mousedown', (e) => { if (e.target.closest('[data-insertar],[data-md]')) e.preventDefault(); });
raiz.addEventListener('click', async (e) => {
  const t = e.target;
  const tab = t.closest('[data-pestana]');
  if (tab) { e.preventDefault(); activar(tab.dataset.pestana); return; }
  const ins = t.closest('[data-insertar]');
  if (ins) { insertar($(`#${ins.dataset.en}`, raiz), ins.dataset.insertar); return; }
  const md = t.closest('[data-md]');
  if (md) { aplicarMd($(`#${md.dataset.mdEn}`, raiz), md.dataset.md); return; }
  const fila = t.closest('[data-lista]');
  if (fila && t.closest('[data-icono],[data-mover],[data-quitar]')) { await accionFila(fila, t); return; }
  const agregar = t.closest('[data-agregar]');
  if (agregar) { agregarElemento(agregar.dataset.agregar); return; }
  const g = t.closest('[data-guardar]');
  if (g) { guardar(g.dataset.guardar, g); return; }
  const d = t.closest('[data-descartar]');
  if (d) { descartar(d.dataset.descartar); return; }
  const lg = t.closest('[data-legal]');
  if (lg) { elegirLegal(lg.dataset.legal); return; }
  const modo = t.closest('[data-doc-modo]');
  if (modo) { modoLegal(modo.dataset.docModo, modo.dataset.modo); return; }
  if (t.closest('[data-nueva-resena]')) { editarResena(); return; }
  if (t.closest('[data-borrar-ejemplos]')) { borrarEjemplos(); return; }
  const tarjetaR = t.closest('[data-resena]');
  if (tarjetaR) {
    const r = resenas.find((x) => x.id === tarjetaR.dataset.resena);
    if (!r) return;
    if (t.closest('[data-editar-resena]')) editarResena(r);
    else if (t.closest('[data-eliminar-resena]')) eliminarResena(r);
    else { const o = t.closest('[data-orden]'); if (o) moverResena(r.id, Number(o.dataset.orden)); }
  }
});
window.addEventListener('hashchange', () => activar(location.hash.slice(1)));
window.addEventListener('beforeunload', (e) => {
  if (PESTANAS.some((p) => sucia(p.id))) { e.preventDefault(); e.returnValue = ''; }
});
