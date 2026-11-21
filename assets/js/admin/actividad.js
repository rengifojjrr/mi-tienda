// Registro de Actividad (Sistema): auditoría de mt_actividad con filtros, paginación en el servidor
// (50 por página), línea de tiempo en móvil y tabla en escritorio, y exportación CSV (hasta 5000 filas).
import { $, $$, esc, ico, hace, fecha, fechaHora, hora, iniciales, debounce, aCsv, descargar, numero } from '../util.js';
import { db } from '../api.js';
import { iniciarPanel, puede } from './base.js';
import { toast, toastError, paginacion, vacio, spinner } from './ui.js';

await iniciarPanel({ seccion: 'actividad', migas: [{ texto: 'Sistema' }, { texto: 'Registro de Actividad' }], area: 'leer' });
const raiz = $('#contenido');
const POR_PAGINA = 50;
const MAX_EXPORTAR = 5000;
const COLUMNAS = 'id,creado_en,autor,accion,entidad,entidad_id,detalle,ejemplo';

// ---------------- Catálogos ----------------
const ACCIONES = {
  insert: { texto: 'Creó', icono: 'add_circle', chip: 'chip-verde', punto: 'bg-[#ECFDF5] text-[#047857]' },
  update: { texto: 'Editó', icono: 'edit', chip: 'chip-azul', punto: 'bg-[#EFF6FF] text-[#1D4ED8]' },
  delete: { texto: 'Eliminó', icono: 'delete', chip: 'chip-rojo', punto: 'bg-[#FEF2F2] text-[#B91C1C]' },
  estado: { texto: 'Cambio de estado', icono: 'sync', chip: 'chip-violeta', punto: 'bg-[#F5F3FF] text-[#6D28D9]' },
  stock: { texto: 'Inventario', icono: 'inventory', chip: 'chip-ambar', punto: 'bg-[#FFFBEB] text-[#B45309]' },
  login: { texto: 'Inicio de sesión', icono: 'login', chip: 'chip-gris', punto: 'bg-[#F1F5F9] text-[#475569]' },
  alerta: { texto: 'Alerta', icono: 'warning', chip: 'chip-rojo', punto: 'bg-error-container text-error' },
};
// mt_cambiar_clave registra la acción como "editar": se muestra y se filtra junto con "update".
const ALIAS = { editar: 'update' };
const accionDe = (a) => ACCIONES[ALIAS[a] || a] || { texto: a || '—', icono: 'history', chip: 'chip-gris', punto: 'bg-[#F1F5F9] text-[#475569]' };

const PESTANA_CONTENIDO = { beneficios: 'beneficios', faq: 'faq', garantia_envios: 'envios', pie: 'pie', soporte: 'pie', legal: 'legal' };
const ENTIDADES = {
  producto: { icono: 'inventory_2', area: 'catalogo', enlace: (id) => (id ? `producto.html?id=${encodeURIComponent(id)}` : 'productos.html') },
  'categoría': { icono: 'category', area: 'catalogo', enlace: () => 'categorias.html' },
  pedido: { icono: 'receipt_long', area: 'ventas', enlace: (id) => (id ? `pedidos.html#${encodeURIComponent(id)}` : 'pedidos.html') },
  cliente: { icono: 'person', area: 'ventas', enlace: (id) => (id ? `clientes.html#${encodeURIComponent(id)}` : 'clientes.html') },
  banner: { icono: 'view_carousel', area: 'catalogo', enlace: () => 'promos.html' },
  'promoción': { icono: 'sell', area: 'catalogo', enlace: () => 'promos.html' },
  'reseña': { icono: 'rate_review', area: 'catalogo', enlace: () => 'contenido.html#resenas' },
  contenido: { icono: 'desktop_windows', area: 'catalogo', enlace: (id) => `contenido.html#${PESTANA_CONTENIDO[id] || 'beneficios'}` },
  'configuración': { icono: 'settings', area: 'config', enlace: () => 'configuracion.html' },
  usuario: { icono: 'manage_accounts', area: 'leer', enlace: () => 'usuarios.html' },
  'sesión': { icono: 'login' },
  'datos de ejemplo': { icono: 'delete_sweep' },
};
const PERIODOS = [['7', '7 días'], ['30', '30 días'], ['90', '90 días'], ['todo', 'Todo']];
const AUTORES_ESPECIALES = { Sistema: 'settings', Tienda: 'storefront' };
const COLORES_AVATAR = ['bg-secondary-fixed text-on-secondary-fixed', 'bg-tertiary-fixed text-on-tertiary-fixed', 'bg-primary-fixed text-on-primary-fixed', 'bg-surface-container-high text-primary'];

// ---------------- Estado (filtros iniciales desde la URL, p. ej. ?entidad=producto) ----------------
const params = new URLSearchParams(location.search);
const filtros = {
  q: params.get('q') || '',
  autor: params.get('autor') || '',
  entidad: params.get('entidad') || '',
  accion: ACCIONES[params.get('accion')] ? params.get('accion') : '',
  periodo: PERIODOS.some(([p]) => p === params.get('periodo')) ? params.get('periodo') : '30',
};
let pagina = Math.max(1, parseInt(params.get('pagina'), 10) || 1);
let autores = [];
let entidades = Object.keys(ENTIDADES);
let solicitud = 0;
let ultimo = { filas: [], total: 0, error: null };

// ---------------- Utilidades ----------------
const mayus = (t) => { const s = String(t ?? ''); return s ? s[0].toUpperCase() + s.slice(1) : ''; };
const colorAvatar = (clave) => COLORES_AVATAR[[...String(clave || '')].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORES_AVATAR.length];
const hayFiltros = () => !!(filtros.q || filtros.autor || filtros.entidad || filtros.accion);
const textoPeriodo = () => (filtros.periodo === 'todo' ? 'en todo el historial' : `en los últimos ${filtros.periodo} días`);
const fechaLocal = (d) => {
  const t = new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`;
};

function consultaFiltros() {
  const p = [];
  const q = filtros.q.replace(/[*%,()]/g, ' ').replace(/\s+/g, ' ').trim();
  if (q) p.push(`detalle=ilike.${encodeURIComponent(`*${q}*`)}`);
  if (filtros.autor) p.push(`autor=eq.${encodeURIComponent(filtros.autor)}`);
  if (filtros.entidad) p.push(`entidad=eq.${encodeURIComponent(filtros.entidad)}`);
  if (filtros.accion) p.push(filtros.accion === 'update' ? 'accion=in.(update,editar)' : `accion=eq.${encodeURIComponent(filtros.accion)}`);
  if (filtros.periodo !== 'todo') {
    const desde = new Date();
    desde.setDate(desde.getDate() - Number(filtros.periodo));
    p.push(`creado_en=gte.${encodeURIComponent(desde.toISOString())}`);
  }
  return p.join('&');
}

/** Guarda en la URL sólo los filtros no sensibles (la búsqueda libre y el autor no se escriben). */
function sincronizarUrl() {
  const p = new URLSearchParams();
  if (filtros.entidad) p.set('entidad', filtros.entidad);
  if (filtros.accion) p.set('accion', filtros.accion);
  if (filtros.periodo !== '30') p.set('periodo', filtros.periodo);
  if (pagina > 1) p.set('pagina', String(pagina));
  const qs = p.toString();
  history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
}

function etiquetaDia(d) {
  const t = new Date(d);
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  if (t.toDateString() === hoy.toDateString()) return 'Hoy';
  if (t.toDateString() === ayer.toDateString()) return 'Ayer';
  return mayus(fecha(t, { weekday: 'long', day: 'numeric', month: 'long', ...(t.getFullYear() !== hoy.getFullYear() ? { year: 'numeric' } : {}) }));
}

// ---------------- Piezas ----------------
function avatar(autor) {
  const especial = AUTORES_ESPECIALES[autor];
  return `<span class="w-8 h-8 rounded-full ${especial ? 'bg-surface-container text-on-surface-variant' : colorAvatar(autor)} flex items-center justify-center font-label-md text-label-md shrink-0" aria-hidden="true">${especial ? ico(especial, 'text-[16px]') : esc(iniciales(autor))}</span>`;
}

function enlaceDe(a) {
  const e = ENTIDADES[a.entidad];
  if (!e?.enlace || !e.area || !puede(e.area) || (ALIAS[a.accion] || a.accion) === 'delete') return null;
  return e.enlace(a.entidad_id);
}

function entidadHtml(a) {
  const e = ENTIDADES[a.entidad] || {};
  const cuerpo = `${ico(e.icono || 'history', 'text-[16px] text-outline')}<span>${esc(mayus(a.entidad) || '—')}</span>`;
  const href = enlaceDe(a);
  return href
    ? `<a href="${esc(href)}" class="inline-flex items-center gap-1.5 text-primary hover:underline" title="Abrir">${cuerpo}</a>`
    : `<span class="inline-flex items-center gap-1.5">${cuerpo}</span>`;
}

const chipAccion = (a) => { const ac = accionDe(a.accion); return `<span class="${ac.chip}">${ico(ac.icono, 'text-[13px]')}${esc(ac.texto)}</span>`; };
const chipEjemplo = '<span class="chip-gris" title="Dato de muestra: se borra desde Configuración → Datos">Ejemplo</span>';

const filaTabla = (a) => `<tr>
    <td class="whitespace-nowrap align-top"><span class="block font-label-md text-label-md text-[#0F172A] tnum">${esc(fechaHora(a.creado_en))}</span>
      <span class="block font-body-sm text-body-sm text-[#64748B]">${esc(hace(a.creado_en))}</span></td>
    <td class="align-top"><div class="flex items-center gap-2 min-w-0">${avatar(a.autor)}<span class="font-label-md text-label-md text-[#0F172A] truncate max-w-[180px]">${esc(a.autor)}</span></div></td>
    <td class="whitespace-nowrap align-top">${chipAccion(a)}</td>
    <td class="whitespace-nowrap align-top text-[#334155]">${entidadHtml(a)}</td>
    <td class="align-top min-w-[260px]"><span class="text-[#334155] break-words">${esc(a.detalle || '—')}</span>${a.ejemplo ? ` <span class="align-middle ml-1">${chipEjemplo}</span>` : ''}</td>
  </tr>`;

const tabla = (filas) => `<table class="tabla"><thead><tr><th>Fecha</th><th>Autor</th><th>Acción</th><th>Entidad</th><th>Detalle</th></tr></thead>
  <tbody>${filas.map(filaTabla).join('')}</tbody></table>`;

function itemLinea(a) {
  const ac = accionDe(a.accion);
  return `<li class="ml-6">
    <span class="absolute -left-4 w-8 h-8 rounded-full ${ac.punto} flex items-center justify-center ring-4 ring-white" title="${esc(ac.texto)}">${ico(ac.icono, 'text-[16px]')}</span>
    <p class="font-body-md text-body-md text-on-surface break-words">${esc(a.detalle || ac.texto)}</p>
    <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-body-sm text-body-sm text-on-surface-variant">
      <span class="font-semibold text-on-surface">${esc(a.autor)}</span><span aria-hidden="true">·</span>${entidadHtml(a)}<span aria-hidden="true">·</span>
      <span class="tnum" title="${esc(fechaHora(a.creado_en))}">${esc(hora(a.creado_en))}</span>${a.ejemplo ? chipEjemplo : ''}</div>
  </li>`;
}

function lineaTiempo(filas) {
  const grupos = [];
  for (const a of filas) {
    const dia = etiquetaDia(a.creado_en);
    if (!grupos.length || grupos[grupos.length - 1].dia !== dia) grupos.push({ dia, filas: [] });
    grupos[grupos.length - 1].filas.push(a);
  }
  return `<div class="px-4 py-4 flex flex-col gap-space-lg">${grupos.map((g) => `<div>
      <p class="font-label-sm text-label-sm uppercase tracking-wider text-outline mb-3">${esc(g.dia)}</p>
      <ol class="relative border-l border-surface-container-high ml-4 flex flex-col gap-space-md">${g.filas.map(itemLinea).join('')}</ol></div>`).join('')}</div>`;
}

const clasePeriodo = (on) => `px-3 py-1.5 rounded-lg font-label-md text-label-md whitespace-nowrap transition-all ${on ? 'bg-surface-container-lowest text-primary font-bold shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`;
const opcionesAutor = () => `<option value="">Todos los autores</option>${autores.map((a) => `<option value="${esc(a)}" ${a === filtros.autor ? 'selected' : ''}>${esc(a)}</option>`).join('')}`;
const opcionesEntidad = () => `<option value="">Todas las entidades</option>${entidades.map((x) => `<option value="${esc(x)}" ${x === filtros.entidad ? 'selected' : ''}>${esc(mayus(x))}</option>`).join('')}`;
const opcionesAccion = () => `<option value="">Todas las acciones</option>${Object.entries(ACCIONES).map(([k, a]) => `<option value="${k}" ${k === filtros.accion ? 'selected' : ''}>${a.texto}</option>`).join('')}`;

// ---------------- Pintado ----------------
function pintarFiltrosActivos() {
  const activos = [];
  if (filtros.q) activos.push(['q', `“${filtros.q}”`]);
  if (filtros.autor) activos.push(['autor', filtros.autor]);
  if (filtros.entidad) activos.push(['entidad', mayus(filtros.entidad)]);
  if (filtros.accion) activos.push(['accion', accionDe(filtros.accion).texto]);
  const cont = $('[data-filtros-activos]', raiz);
  cont.innerHTML = activos.length
    ? `${activos.map(([k, t]) => `<button type="button" data-quitar-filtro="${k}" class="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-primary/10 text-primary font-label-md text-label-md hover:bg-primary/15 max-w-full" aria-label="Quitar filtro ${esc(t)}"><span class="truncate">${esc(t)}</span>${ico('close', 'text-[14px]')}</button>`).join('')}
      <button type="button" data-limpiar class="ml-1 font-label-md text-label-md text-on-surface-variant hover:text-on-surface underline underline-offset-2">Limpiar filtros</button>`
    : '';
  cont.classList.toggle('hidden', !activos.length);
}

function pintarResultados() {
  const { filas, total, error } = ultimo;
  const lista = $('[data-lista]', raiz);
  const pag = $('[data-paginacion]', raiz);
  const resumen = $('[data-resumen]', raiz);
  pintarFiltrosActivos();
  if (error) {
    resumen.textContent = 'No se pudo cargar la actividad';
    lista.innerHTML = vacio({ icono: 'cloud_off', titulo: 'No se pudo cargar el registro', texto: esc(error), accion: '<button type="button" data-actualizar class="btn-secundario">Reintentar</button>' });
    pag.innerHTML = '';
    pag.classList.add('hidden');
    return;
  }
  resumen.innerHTML = `${numero(total)} ${total === 1 ? 'evento' : 'eventos'} <span class="font-body-sm text-body-sm text-outline font-normal">${esc(textoPeriodo())}</span>`;
  if (!filas.length) {
    const acciones = [
      hayFiltros() ? '<button type="button" data-limpiar class="btn-secundario">Limpiar filtros</button>' : '',
      filtros.periodo !== 'todo' ? '<button type="button" data-periodo="todo" class="btn-secundario">Ver todo el historial</button>' : '',
    ].filter(Boolean).join('');
    lista.innerHTML = vacio({
      icono: 'history',
      titulo: hayFiltros() || filtros.periodo !== 'todo' ? 'Sin actividad para estos filtros' : 'Todavía no hay actividad',
      texto: hayFiltros() || filtros.periodo !== 'todo' ? 'Prueba con otro periodo o quita algún filtro.' : 'Aquí aparecerán los cambios que hagan tú y tu equipo en el panel.',
      accion: acciones ? `<div class="flex flex-wrap justify-center gap-2">${acciones}</div>` : '',
    });
  } else {
    lista.innerHTML = `<div class="hidden md:block overflow-x-auto">${tabla(filas)}</div><div class="md:hidden">${lineaTiempo(filas)}</div>`;
  }
  const conPaginas = total > POR_PAGINA;
  pag.innerHTML = conPaginas ? paginacion({ total, pagina, porPagina: POR_PAGINA }) : '';
  pag.classList.toggle('hidden', !conPaginas);
}

function marcarCargando(si) {
  $('[data-lista]', raiz)?.classList.toggle('opacity-60', si);
  $('[data-cargando]', raiz)?.classList.toggle('hidden', !si);
}

// ---------------- Datos ----------------
async function cargar({ desplazar = false } = {}) {
  const n = ++solicitud;
  marcarCargando(true);
  const f = consultaFiltros();
  const consulta = `select=${COLUMNAS}&order=creado_en.desc,id.desc&limit=${POR_PAGINA}&offset=${(pagina - 1) * POR_PAGINA}${f ? `&${f}` : ''}`;
  try {
    const { filas, total } = await db.leerConTotal('mt_actividad', consulta);
    if (n !== solicitud) return;
    const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    if (total && pagina > paginas) { pagina = paginas; cargar({ desplazar }); return; }
    ultimo = { filas, total, error: null };
    pintarResultados();
    sincronizarUrl();
    if (desplazar) $('#resultados', raiz)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    if (n !== solicitud) return;
    // Página fuera de rango (p. ej. ?pagina=99 tras borrar datos): volver a la primera
    if ((e.estado === 416 || e.codigo === 'PGRST103') && pagina > 1) { pagina = 1; cargar(); return; }
    ultimo = { filas: [], total: 0, error: e.message };
    pintarResultados();
  } finally {
    if (n === solicitud) marcarCargando(false);
  }
}

async function cargarOpciones() {
  try {
    const recientes = await db.leer('mt_actividad', 'select=autor,entidad&order=creado_en.desc&limit=500');
    autores = [...new Set([...recientes.map((r) => r.autor), filtros.autor].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    entidades = [...new Set([...Object.keys(ENTIDADES), ...recientes.map((r) => r.entidad), filtros.entidad].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  } catch {
    autores = filtros.autor ? [filtros.autor] : [];
  }
  $('[data-filtro="autor"]', raiz).innerHTML = opcionesAutor();
  $('[data-filtro="entidad"]', raiz).innerHTML = opcionesEntidad();
}

const COLUMNAS_CSV = [
  { titulo: 'Fecha', valor: (a) => fechaLocal(a.creado_en) },
  { titulo: 'Autor', clave: 'autor' },
  { titulo: 'Acción', valor: (a) => accionDe(a.accion).texto },
  { titulo: 'Entidad', clave: 'entidad' },
  { titulo: 'ID de la entidad', clave: 'entidad_id' },
  { titulo: 'Detalle', clave: 'detalle' },
  { titulo: 'Ejemplo', valor: (a) => (a.ejemplo ? 'Sí' : 'No') },
];

async function exportar(boton) {
  const f = consultaFiltros();
  const base = `select=${COLUMNAS}&order=creado_en.desc,id.desc${f ? `&${f}` : ''}`;
  const antes = boton.innerHTML;
  boton.disabled = true;
  boton.innerHTML = `${spinner()}<span>Exportando…</span>`;
  try {
    const { filas: primeras, total } = await db.leerConTotal('mt_actividad', `${base}&limit=1000`);
    const filas = [...primeras];
    const meta = Math.min(total, MAX_EXPORTAR);
    while (filas.length < meta) {
      const lote = await db.leer('mt_actividad', `${base}&limit=${Math.min(1000, meta - filas.length)}&offset=${filas.length}`);
      if (!lote.length) break;
      filas.push(...lote);
    }
    if (!filas.length) { toast('No hay eventos para exportar con estos filtros', { tipo: 'info' }); return; }
    const hoy = fechaLocal(new Date()).slice(0, 10);
    descargar(`actividad-${hoy}.csv`, aCsv(filas.slice(0, MAX_EXPORTAR), COLUMNAS_CSV), 'text/csv;charset=utf-8');
    if (total > MAX_EXPORTAR) toast(`Se exportaron los ${numero(MAX_EXPORTAR)} eventos más recientes de ${numero(total)}. Acota el periodo para el resto.`, { tipo: 'info', duracion: 6000 });
    else toast(`${numero(filas.length)} ${filas.length === 1 ? 'evento exportado' : 'eventos exportados'}`);
  } catch (e) { toastError(e); } finally { boton.disabled = false; boton.innerHTML = antes; }
}

// ---------------- Armado ----------------
raiz.innerHTML = `
  <div class="flex flex-col xl:flex-row xl:items-end justify-between gap-space-md">
    <div><span class="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-bold">Sistema • Auditoría</span>
      <h1 class="font-headline-lg-mobile text-headline-lg-mobile lg:font-headline-lg lg:text-headline-lg text-on-surface tracking-tight">Registro de Actividad</h1>
      <p class="font-body-md text-body-md text-on-surface-variant">Quién hizo qué y cuándo: cambios de catálogo, pedidos, inventario, contenido, configuración y accesos al panel.</p></div>
    <div class="flex flex-wrap items-center gap-space-xs">
      <button type="button" data-exportar class="flex items-center gap-space-xs px-3.5 py-2 rounded-xl bg-surface-container-lowest hover:bg-surface-container-low text-on-surface font-label-md text-label-md shadow-sm transition-all disabled:opacity-50">${ico('download', 'text-[18px] text-on-surface-variant')}<span>Exportar CSV</span></button>
      <button type="button" data-actualizar class="flex items-center gap-space-xs px-3.5 py-2 rounded-xl bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md shadow-sm transition-all">${ico('sync', 'text-[18px]')}<span>Actualizar</span></button>
    </div>
  </div>
  <section class="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-sm" aria-label="Filtros">
    <div class="flex flex-col lg:flex-row gap-space-sm lg:items-center">
      <div class="relative flex-1 min-w-0">
        <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline flex">${ico('search', 'text-[20px]')}</span>
        <label class="sr-only" for="actBuscar">Buscar en el detalle</label>
        <input id="actBuscar" type="search" data-filtro="q" class="campo pl-10" placeholder="Buscar en el detalle: producto, pedido WA-1024, cliente…" value="${esc(filtros.q)}" autocomplete="off" maxlength="80">
      </div>
      <div class="flex items-center bg-surface-container-low p-1 rounded-xl overflow-x-auto no-scrollbar shrink-0" role="group" aria-label="Periodo">
        ${PERIODOS.map(([id, t]) => `<button type="button" data-periodo="${id}" aria-pressed="${filtros.periodo === id}" class="${clasePeriodo(filtros.periodo === id)}">${t}</button>`).join('')}
      </div>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-space-sm">
      <select data-filtro="autor" class="campo" aria-label="Autor">${opcionesAutor()}</select>
      <select data-filtro="entidad" class="campo" aria-label="Entidad">${opcionesEntidad()}</select>
      <select data-filtro="accion" class="campo" aria-label="Acción">${opcionesAccion()}</select>
    </div>
    <div data-filtros-activos class="hidden flex flex-wrap items-center gap-2"></div>
  </section>
  <section id="resultados" class="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden scroll-mt-24" aria-live="polite">
    <div class="flex items-center justify-between gap-2 px-4 py-3 border-b border-[#F1F5F9]">
      <p data-resumen class="font-label-lg text-label-lg text-on-surface">Cargando…</p>
      <span data-cargando class="hidden text-primary">${spinner('h-5 w-5')}</span>
    </div>
    <div data-lista class="transition-opacity"><div class="p-4 flex flex-col gap-2">${'<div class="h-12 esqueleto"></div>'.repeat(6)}</div></div>
    <div data-paginacion class="hidden border-t border-[#F1F5F9]"></div>
  </section>`;

// ---------------- Eventos ----------------
const recargar = () => { pagina = 1; cargar(); };
const buscar = debounce((valor) => { filtros.q = valor.trim(); recargar(); }, 350);

raiz.addEventListener('input', (e) => {
  if (e.target.dataset.filtro === 'q') buscar(e.target.value);
});
raiz.addEventListener('change', (e) => {
  const k = e.target.dataset.filtro;
  if (!k || k === 'q') return;
  filtros[k] = e.target.value;
  recargar();
});
raiz.addEventListener('click', (e) => {
  const t = e.target;
  const per = t.closest('[data-periodo]');
  if (per) {
    filtros.periodo = per.dataset.periodo;
    $$('[role="group"] [data-periodo]', raiz).forEach((b) => { const on = b.dataset.periodo === filtros.periodo; b.className = clasePeriodo(on); b.setAttribute('aria-pressed', String(on)); });
    recargar();
    return;
  }
  const pag = t.closest('[data-pagina]');
  if (pag && !pag.disabled) { pagina = Number(pag.dataset.pagina) || 1; cargar({ desplazar: true }); return; }
  const quitar = t.closest('[data-quitar-filtro]');
  if (quitar) {
    const k = quitar.dataset.quitarFiltro;
    filtros[k] = '';
    const control = $(`[data-filtro="${k}"]`, raiz);
    if (control) control.value = '';
    recargar();
    return;
  }
  if (t.closest('[data-limpiar]')) {
    ['q', 'autor', 'entidad', 'accion'].forEach((k) => { filtros[k] = ''; const c = $(`[data-filtro="${k}"]`, raiz); if (c) c.value = ''; });
    recargar();
    return;
  }
  if (t.closest('[data-actualizar]')) { cargarOpciones(); cargar(); return; }
  const exp = t.closest('[data-exportar]');
  if (exp) exportar(exp);
});

await Promise.all([cargarOpciones(), cargar()]);
