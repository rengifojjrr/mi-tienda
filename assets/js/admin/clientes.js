// Clientes CRM: fichas de clientes (se crean solas con cada pedido de la tienda), etiquetas, historial de pedidos
// y acceso directo a WhatsApp. Se cargan hasta 1000 clientes y la búsqueda, el filtro y el orden van en el navegador.
import {
  $, esc, ico, numero, num, hace, fecha, fechaHora, iniciales, urlWhatsApp, aCsv, descargar, telefonoBonito, debounce,
  soloDigitos, normalizar,
} from '../util.js';
import { db } from '../api.js';
import { iniciarPanel, dineroPanel, tienda } from './base.js';
import { modal, confirmar, toast, toastError, chipPedido, panelLateral, paginacion, vacio, esqueletoFilas, spinner } from './ui.js';

await iniciarPanel({ seccion: 'clientes', migas: [{ texto: 'Ventas' }, { texto: 'Clientes CRM' }], area: 'ventas' });
const contenido = $('#contenido');

// ---------------- Constantes ----------------
const LIMITE = 1000;
const POR_PAGINA = 25;
const MAX_ETIQUETAS = 12;
const ORDENES = [['ultimo', 'Último pedido'], ['gasto', 'Mayor gasto'], ['pedidos', 'Más pedidos'], ['nombre', 'Nombre (A-Z)']];
const SUGERIDAS = ['VIP', 'Recurrente', 'Mayorista'];
const COLOR_ETIQUETA = { vip: 'chip-ambar', recurrente: 'chip-verde', mayorista: 'chip-azul' };
const VENDIDOS = ['confirmado', 'enviado', 'entregado']; // los que cuentan en total_gastado
const AVATARES = ['bg-secondary-fixed text-on-secondary-fixed', 'bg-tertiary-fixed text-on-tertiary-fixed', 'bg-primary-fixed text-on-primary-fixed', 'bg-surface-container-high text-primary'];
// En estilos.css .btn-sm queda antes que las variantes (btn-primario, btn-wa…), así que se refuerza con utilidades.
const CHICO = 'btn-sm h-8 px-3 font-label-md text-label-md';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------- Estado ----------------
let clientes = [];
let totalServidor = 0;
let cargado = false;
const filtro = { q: '', etiqueta: '', orden: 'ultimo', pagina: 1 };
let detalle = null; // panel abierto: { api, cliente, pedidos, etiquetas: { lista }, guardando }
let altaAbierta = false;

// ---------------- Utilidades ----------------
const fechaNum = (d) => (d ? new Date(d).getTime() || 0 : 0);
const plural = (n, uno, varios) => `${numero(n)} ${n === 1 ? uno : varios}`;
const ponerHash = (h) => history.replaceState(history.state, '', `${location.pathname}${location.search}${h ? `#${h}` : ''}`);
// Evita que Excel interprete como fórmula un texto escrito por un cliente (inyección CSV).
const celdaSegura = (v) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
const telefonoCsv = (t) => (t ? telefonoBonito(t).replace(/^\+/, '') : '');
const tituloSeccion = (texto, icono, margen = 'mb-2') => `<h3 class="flex items-center gap-1.5 font-label-sm text-label-sm uppercase tracking-wider text-outline ${margen}">${ico(icono, 'text-[16px]')}${texto}</h3>`;
const primerNombre = (c) => String(c.nombre || '').trim().split(/\s+/)[0] || '';
const mensajeHola = (c) => `Hola${primerNombre(c) ? ` ${primerNombre(c)}` : ''}, te escribimos de ${tienda().nombre || 'nuestra tienda'}.`;
const claseEtiqueta = (t) => COLOR_ETIQUETA[normalizar(t)] || 'chip-gris';
const chipsEtiquetas = (lista = []) => lista.map((t) => `<span class="${claseEtiqueta(t)}">${esc(t)}</span>`).join('');

function avatar(nombre, tam = 'w-9 h-9 font-label-md text-label-md') {
  const texto = String(nombre || '');
  let h = 0;
  for (const c of texto) h = (h * 31 + c.codePointAt(0)) % 9973;
  return `<span class="${tam} rounded-full ${AVATARES[h % AVATARES.length]} flex items-center justify-center font-bold shrink-0" aria-hidden="true">${esc(iniciales(texto))}</span>`;
}

/** Avisa cuando el panel lateral se cierra (Escape, clic afuera o botón cerrar). */
function vigilarCierre(api, alCerrar) {
  const obs = new MutationObserver(() => { if (!api.el.isConnected) { obs.disconnect(); alCerrar(); } });
  obs.observe(document.body, { childList: true });
}

// ---------------- Etiquetas ----------------
function etiquetasExistentes() {
  const mapa = new Map();
  for (const c of clientes) {
    for (const t of c.etiquetas || []) {
      const k = normalizar(t);
      if (!k) continue;
      const e = mapa.get(k) || { texto: t, n: 0 };
      e.n += 1;
      mapa.set(k, e);
    }
  }
  return [...mapa.values()].sort((a, b) => b.n - a.n || a.texto.localeCompare(b.texto, 'es'));
}

/** Normaliza una etiqueta y reutiliza la forma ya usada en otros clientes ("vip" → "VIP"). */
function limpiarEtiqueta(texto) {
  const t = String(texto || '').replace(/[,;]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);
  if (!t) return '';
  const k = normalizar(t);
  return [...etiquetasExistentes().map((e) => e.texto), ...SUGERIDAS].find((x) => normalizar(x) === k) || t;
}

const chipQuitable = (t) => `<span class="${claseEtiqueta(t)} pr-1">${esc(t)}<button type="button" data-quitar-etiqueta="${esc(t)}" class="w-4 h-4 rounded-full hover:bg-black/10 flex items-center justify-center" aria-label="Quitar etiqueta ${esc(t)}">${ico('close', 'text-[12px]')}</button></span>`;

function htmlEditor(lista, id) {
  return `<div data-bloque-etiquetas>
    <div class="flex flex-wrap items-center gap-1.5 min-h-12 lg:min-h-[42px] px-2 py-1.5 rounded-lg bg-white border border-[#E2E8F0] focus-within:border-[#059669] focus-within:ring-[3px] focus-within:ring-[#059669]/15 transition-shadow">
      <span data-lista-etiquetas class="contents">${lista.map(chipQuitable).join('')}</span>
      <input type="text" data-nueva-etiqueta list="${id}Sugeridas" maxlength="30" autocomplete="off" aria-label="Agregar etiqueta" placeholder="Agregar etiqueta…"
        class="flex-1 min-w-[120px] h-8 px-1 bg-transparent outline-none font-body-md text-body-md text-[#0F172A] placeholder:text-[#94A3B8]">
    </div>
    <datalist id="${id}Sugeridas"></datalist>
    <div data-sugeridas class="flex flex-wrap gap-1.5 mt-2"></div>
    <p class="ayuda">Escribe y pulsa Enter (o coma) para agregarla.</p>
  </div>`;
}

/** Activa el editor de etiquetas. `estado.lista` guarda las etiquetas; `estado.confirmarPendiente()` agrega lo escrito. */
function conectarEditor(bloque, estado) {
  if (!bloque) return;
  const input = bloque.querySelector('[data-nueva-etiqueta]');
  const tiene = (t) => estado.lista.some((x) => normalizar(x) === normalizar(t));
  const pintar = () => {
    bloque.querySelector('[data-lista-etiquetas]').innerHTML = estado.lista.map(chipQuitable).join('');
    const opciones = [...new Map([...SUGERIDAS, ...etiquetasExistentes().map((e) => e.texto)].map((t) => [normalizar(t), t])).values()].filter((t) => !tiene(t));
    bloque.querySelector('datalist').innerHTML = opciones.map((t) => `<option value="${esc(t)}"></option>`).join('');
    bloque.querySelector('[data-sugeridas]').innerHTML = opciones.slice(0, 6).map((t) => `<button type="button" data-sugerir="${esc(t)}" class="px-2 py-0.5 rounded-full border border-dashed border-[#CBD5E1] text-[#475569] hover:border-primary hover:text-primary font-label-md text-label-md transition-colors">+ ${esc(t)}</button>`).join('');
  };
  const agregar = (texto) => {
    const t = limpiarEtiqueta(texto);
    if (!t || tiene(t)) return;
    if (estado.lista.length >= MAX_ETIQUETAS) { toast(`Máximo ${MAX_ETIQUETAS} etiquetas por cliente`, { tipo: 'info' }); return; }
    estado.lista.push(t);
    pintar();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); agregar(input.value); input.value = ''; } // Enter no envía el formulario
    else if (e.key === 'Backspace' && !input.value && estado.lista.length) { estado.lista.pop(); pintar(); }
  });
  input.addEventListener('input', (e) => {
    if (e.inputType === 'insertReplacementText') { agregar(input.value); input.value = ''; return; } // elegida de la lista
    if (!/[,;]/.test(input.value)) return; // teclados móviles: la coma llega como texto
    const partes = input.value.split(/[,;]/);
    const resto = partes.pop();
    partes.forEach(agregar);
    input.value = resto;
  });
  bloque.addEventListener('click', (e) => {
    const quitar = e.target.closest('[data-quitar-etiqueta]');
    if (quitar) { estado.lista = estado.lista.filter((x) => x !== quitar.dataset.quitarEtiqueta); pintar(); input.focus(); return; }
    const sugerida = e.target.closest('[data-sugerir]');
    if (sugerida) agregar(sugerida.dataset.sugerir);
  });
  estado.confirmarPendiente = () => { if (input.value.trim()) { agregar(input.value); input.value = ''; } };
  pintar();
}

// ---------------- Formulario (ficha y alta) ----------------
function camposCliente(c, id, etiquetas) {
  return `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <div class="sm:col-span-2"><label class="etiqueta" for="${id}Nombre">Nombre *</label><input id="${id}Nombre" name="nombre" class="campo" maxlength="80" autocomplete="off" value="${esc(c.nombre || '')}" placeholder="Nombre y apellido"></div>
    <div><label class="etiqueta" for="${id}Telefono">WhatsApp / teléfono</label><input id="${id}Telefono" name="telefono" type="tel" inputmode="tel" class="campo tnum" maxlength="22" autocomplete="off" value="${esc(c.telefono || '')}" placeholder="Ej: 13055550118">
      <p class="ayuda">Con código de país, de 7 a 15 dígitos.</p></div>
    <div><label class="etiqueta" for="${id}Ciudad">Ciudad</label><input id="${id}Ciudad" name="ciudad" class="campo" maxlength="80" autocomplete="off" value="${esc(c.ciudad || '')}"></div>
    <div class="sm:col-span-2"><label class="etiqueta" for="${id}Email">Email</label><input id="${id}Email" name="email" type="email" inputmode="email" class="campo" maxlength="120" autocomplete="off" value="${esc(c.email || '')}" placeholder="cliente@correo.com"></div>
    <div class="sm:col-span-2"><span class="etiqueta">Etiquetas</span>${htmlEditor(etiquetas, id)}</div>
    <div class="sm:col-span-2"><label class="etiqueta" for="${id}Notas">Notas</label><textarea id="${id}Notas" name="notas" class="campo" rows="3" maxlength="2000" placeholder="Preferencias, tallas, dirección, acuerdos…">${esc(c.notas || '')}</textarea></div>
  </div>`;
}

/** Lee y valida el formulario. Lanza Error con un mensaje claro si algo no cuadra. */
function leerDatos(form, etiquetas, idActual = null) {
  const campo = (n) => String(form.elements.namedItem(n)?.value ?? '').trim();
  const nombre = campo('nombre').replace(/\s+/g, ' ');
  const telCrudo = campo('telefono');
  const telefono = soloDigitos(telCrudo);
  const email = campo('email');
  if (!nombre) throw new Error('Escribe el nombre del cliente.');
  if (telCrudo && (telefono.length < 7 || telefono.length > 15)) throw new Error('El teléfono debe tener de 7 a 15 dígitos, con código de país (sólo números).');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Revisa el email: parece incompleto.');
  const repetido = telefono && clientes.find((x) => x.telefono === telefono && x.id !== idActual);
  if (repetido) throw new Error(`Ya existe un cliente con ese teléfono: ${repetido.nombre}.`);
  return { nombre, telefono: telefono || null, ciudad: campo('ciudad') || null, email: email || null, notas: campo('notas') || null, etiquetas: [...etiquetas] };
}

// ---------------- Filtros ----------------
function coincide(c, q) {
  if (!q) return true;
  const n = normalizar(q);
  const dig = soloDigitos(q);
  return normalizar(c.nombre).includes(n) || normalizar(c.ciudad).includes(n) || normalizar(c.email).includes(n)
    || (dig.length >= 3 && String(c.telefono || '').includes(dig));
}

const ORDEN = {
  ultimo: (a, b) => fechaNum(b.ultimo_pedido_en) - fechaNum(a.ultimo_pedido_en) || fechaNum(b.creado_en) - fechaNum(a.creado_en),
  gasto: (a, b) => num(b.total_gastado) - num(a.total_gastado) || num(b.total_pedidos) - num(a.total_pedidos),
  pedidos: (a, b) => num(b.total_pedidos) - num(a.total_pedidos) || num(b.total_gastado) - num(a.total_gastado),
  nombre: (a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' }),
};

const tieneEtiqueta = (c, etiqueta) => (c.etiquetas || []).some((t) => normalizar(t) === normalizar(etiqueta));
const filtrados = () => clientes
  .filter((c) => coincide(c, filtro.q) && (!filtro.etiqueta || tieneEtiqueta(c, filtro.etiqueta)))
  .sort(ORDEN[filtro.orden] || ORDEN.ultimo);

// ---------------- Página ----------------
function pintarBase() {
  contenido.innerHTML = `
    <div class="flex flex-col xl:flex-row xl:items-end justify-between gap-space-md">
      <div class="min-w-0">
        <span class="block mb-1 font-label-sm text-label-sm uppercase tracking-wider text-secondary font-bold">Ventas &amp; Leads</span>
        <h1 class="font-headline-lg-mobile text-headline-lg-mobile lg:font-headline-lg lg:text-headline-lg text-on-surface tracking-tight">Clientes CRM</h1>
        <p class="font-body-md text-body-md text-on-surface-variant">Tus clientes se registran solos con cada pedido de WhatsApp. Organízalos con etiquetas y retoma la conversación con un clic.</p>
      </div>
      <div class="flex flex-wrap items-center gap-space-xs">
        <button type="button" id="exportar" class="flex items-center gap-space-xs px-3.5 py-2 rounded-xl bg-surface-container-lowest hover:bg-surface-container-low text-on-surface font-label-md text-label-md shadow-sm transition-all">${ico('download', 'text-[18px] text-on-surface-variant')}<span>Exportar CSV</span></button>
        <button type="button" id="nuevoCliente" class="flex items-center gap-space-xs px-3.5 py-2 rounded-xl bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md shadow-sm transition-all">${ico('person_add', 'text-[18px]')}<span>Nuevo cliente</span></button>
      </div>
    </div>
    <div id="kpis"><div class="grid grid-cols-2 xl:grid-cols-4 gap-space-sm sm:gap-space-md">${'<div class="h-32 esqueleto"></div>'.repeat(4)}</div></div>
    <div class="bg-surface-container-lowest rounded-xl shadow-sm p-space-md space-y-space-sm">
      <div class="flex flex-col md:flex-row md:items-center gap-space-sm">
        <div class="relative flex-1 min-w-0">${ico('search', 'absolute left-3.5 top-1/2 -translate-y-1/2 text-outline text-[20px] pointer-events-none')}
          <input id="buscar" type="search" maxlength="80" autocomplete="off" aria-label="Buscar clientes" placeholder="Buscar por nombre, teléfono, ciudad o email…"
            class="w-full pl-11 pr-3 py-2.5 bg-surface-container-low rounded-xl font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container focus:ring-2 focus:ring-primary/20 transition-all"></div>
        <div class="relative shrink-0">
          <select id="orden" aria-label="Ordenar clientes" class="w-full md:w-auto appearance-none pl-3 pr-9 py-2.5 bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer">
            ${ORDENES.map(([v, t]) => `<option value="${v}" ${filtro.orden === v ? 'selected' : ''}>Orden: ${t}</option>`).join('')}</select>
          ${ico('expand_more', 'absolute right-2.5 top-1/2 -translate-y-1/2 text-outline text-[18px] pointer-events-none')}
        </div>
      </div>
      <div id="etiquetas" class="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5 lg:flex-wrap" role="toolbar" aria-label="Filtrar por etiqueta"></div>
    </div>
    <div id="lista" class="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden transition-opacity scroll-mt-20">
      <div class="hidden lg:block"><table class="tabla"><tbody>${esqueletoFilas(6, 7)}</tbody></table></div>
      <div class="lg:hidden p-space-md space-y-3">${'<div class="h-24 esqueleto"></div>'.repeat(4)}</div>
    </div>`;
}

function pintarKpis() {
  const total = Math.max(totalServidor, clientes.length);
  const compradores = clientes.filter((c) => num(c.total_gastado) > 0);
  const recurrentes = clientes.filter((c) => num(c.total_pedidos) >= 2).length;
  const gastado = compradores.reduce((s, c) => s + num(c.total_gastado), 0);
  const pedidosCompradores = compradores.reduce((s, c) => s + num(c.total_pedidos), 0);
  const ticket = pedidosCompradores > 0 ? gastado / pedidosCompradores : 0;
  const nuevos = clientes.filter((c) => Date.now() - fechaNum(c.creado_en) < 30 * 86400000).length;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  const [entero, decimales] = dineroPanel(ticket).split(/(?=[.,]\d{2}$)/);
  const tarjeta = (titulo, icono, color, valor, pie) => `<div class="bg-surface-container-lowest rounded-xl p-space-md shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between min-w-0">
      <div class="flex items-start justify-between gap-2"><span class="font-label-sm text-label-sm uppercase tracking-wider text-outline">${titulo}</span>
        <div class="w-8 h-8 rounded-lg ${color} flex items-center justify-center shrink-0">${ico(icono, 'text-[18px]')}</div></div>
      <div class="my-space-sm font-headline-md text-headline-md sm:font-headline-lg sm:text-headline-lg text-on-surface tnum break-words">${valor}</div>
      <span class="font-label-sm text-label-sm ${pie[1] || 'text-outline'}">${pie[0]}</span></div>`;
  $('#kpis').innerHTML = `<div class="grid grid-cols-2 xl:grid-cols-4 gap-space-sm sm:gap-space-md">
    ${tarjeta('Total clientes', 'group', 'bg-surface-container text-primary', numero(total), nuevos ? [`+${numero(nuevos)} en los últimos 30 días`, 'text-secondary font-semibold'] : ['Sin altas en 30 días'])}
    ${tarjeta('Con compras', 'shopping_bag', 'bg-secondary-container text-on-secondary-container', numero(compradores.length), [`${pct(compradores.length)}% del total`])}
    ${tarjeta('Recurrentes', 'repeat', 'bg-tertiary-fixed text-on-tertiary-fixed-variant', numero(recurrentes), [`${pct(recurrentes)}% con 2 o más pedidos`])}
    ${tarjeta('Ticket promedio', 'sell', 'bg-surface-container-high text-primary', pedidosCompradores ? `${esc(entero)}<span class="text-body-sm text-outline">${esc(decimales || '')}</span>` : '—',
      pedidosCompradores ? [`Vendido: ${dineroPanel(gastado)}`] : ['Aún sin compras confirmadas'])}
  </div>`;
}

function pintarEtiquetas() {
  const lista = etiquetasExistentes();
  if (filtro.etiqueta && !lista.some((e) => normalizar(e.texto) === normalizar(filtro.etiqueta))) filtro.etiqueta = '';
  const base = clientes.filter((c) => coincide(c, filtro.q)); // los conteos respetan la búsqueda
  const chip = (valor, texto, n) => {
    const activo = normalizar(filtro.etiqueta) === normalizar(valor);
    return `<button type="button" data-etiqueta="${esc(valor)}" aria-pressed="${activo}" class="shrink-0 px-3.5 py-1.5 rounded-lg font-label-md text-label-md whitespace-nowrap transition-all ${activo ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}">
      ${texto} <span class="ml-0.5 tnum ${activo ? 'opacity-80' : 'text-outline font-semibold'}">(${numero(n)})</span></button>`;
  };
  $('#etiquetas').innerHTML = [chip('', 'Todos', base.length), ...lista.map((e) => chip(e.texto, esc(e.texto), base.filter((c) => tieneEtiqueta(c, e.texto)).length))].join('')
    + (lista.length ? '' : '<span class="font-body-sm text-body-sm text-outline px-1 whitespace-nowrap lg:whitespace-normal">Agrega etiquetas (VIP, Recurrente, Mayorista…) en la ficha de cada cliente para filtrarlos aquí.</span>');
}

function botonWa(c, tam = 'w-8 h-8') {
  if (!c.telefono) return '';
  return `<a href="${esc(urlWhatsApp(c.telefono, mensajeHola(c)))}" target="_blank" rel="noopener" title="Abrir WhatsApp" aria-label="Escribir a ${esc(c.nombre)} por WhatsApp"
    class="${tam} rounded-lg bg-wa text-white hover:bg-wa-hover flex items-center justify-center shadow-sm transition-transform active:scale-95 shrink-0">${ico('chat', 'text-[16px]', true)}</a>`;
}

function filaTabla(c) {
  return `<tr data-abrir="${esc(c.id)}" class="cursor-pointer">
    <td><div class="flex items-center gap-2.5 min-w-[200px]">${avatar(c.nombre)}
      <div class="min-w-0"><p class="flex items-center gap-1.5 min-w-0"><span class="font-label-lg text-label-lg text-on-surface truncate max-w-[220px]">${esc(c.nombre)}</span>${c.ejemplo ? '<span class="chip-gris">Ejemplo</span>' : ''}</p>
        <p class="font-body-sm text-body-sm text-outline truncate max-w-[240px]">${c.ciudad ? esc(c.ciudad) : 'Sin ciudad'}</p></div></div></td>
    <td class="whitespace-nowrap">${c.telefono ? `<div class="flex items-center gap-2"><span class="font-body-sm text-body-sm text-on-surface-variant tnum">${esc(telefonoBonito(c.telefono))}</span>${botonWa(c)}</div>` : '<span class="font-body-sm text-body-sm text-outline">Sin teléfono</span>'}</td>
    <td class="text-center tnum font-label-lg text-label-lg text-on-surface">${numero(c.total_pedidos)}</td>
    <td class="text-right tnum whitespace-nowrap font-label-lg text-label-lg ${num(c.total_gastado) > 0 ? 'text-on-surface' : 'text-outline'}">${dineroPanel(c.total_gastado)}</td>
    <td class="whitespace-nowrap font-body-sm text-body-sm ${c.ultimo_pedido_en ? 'text-on-surface-variant' : 'text-outline'}" ${c.ultimo_pedido_en ? `title="${esc(fechaHora(c.ultimo_pedido_en))}"` : ''}>${c.ultimo_pedido_en ? esc(hace(c.ultimo_pedido_en)) : 'Sin pedidos'}</td>
    <td><div class="flex flex-wrap gap-1 max-w-[220px]">${chipsEtiquetas(c.etiquetas) || '<span class="font-body-sm text-body-sm text-outline">—</span>'}</div></td>
    <td class="text-right"><button type="button" data-abrir="${esc(c.id)}" class="btn-secundario ${CHICO}">Ver</button></td>
  </tr>`;
}

function tarjetaMovil(c) {
  const contacto = [c.ciudad, c.telefono ? telefonoBonito(c.telefono) : ''].filter(Boolean).map(esc).join(' · ') || 'Sin datos de contacto';
  const chips = chipsEtiquetas(c.etiquetas);
  return `<div data-abrir="${esc(c.id)}" class="p-space-md flex gap-3 cursor-pointer active:bg-surface-container-low transition-colors">
    ${avatar(c.nombre, 'w-10 h-10 font-label-md text-label-md')}
    <div class="flex-1 min-w-0 space-y-1.5">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0"><p class="flex items-center gap-1.5 min-w-0"><span class="font-label-lg text-label-lg text-on-surface truncate">${esc(c.nombre)}</span>${c.ejemplo ? '<span class="chip-gris">Ejemplo</span>' : ''}</p>
          <p class="font-body-sm text-body-sm text-on-surface-variant truncate tnum">${contacto}</p></div>
        ${botonWa(c, 'w-9 h-9')}
      </div>
      ${chips ? `<div class="flex flex-wrap gap-1">${chips}</div>` : ''}
      <div class="flex items-center gap-x-3 gap-y-1 flex-wrap font-body-sm text-body-sm text-on-surface-variant">
        <span><strong class="text-on-surface tnum">${numero(c.total_pedidos)}</strong> ${num(c.total_pedidos) === 1 ? 'pedido' : 'pedidos'}</span>
        <span><strong class="text-on-surface tnum">${dineroPanel(c.total_gastado)}</strong> gastado</span>
        <span>${c.ultimo_pedido_en ? `Último: ${esc(hace(c.ultimo_pedido_en))}` : 'Sin pedidos'}</span>
      </div>
    </div></div>`;
}

function pintarLista() {
  const lista = $('#lista');
  const filas = filtrados();
  if (!filas.length) {
    lista.innerHTML = clientes.length
      ? vacio({ icono: 'search_off', titulo: 'Ningún cliente coincide', texto: 'Prueba con otra búsqueda o etiqueta.', accion: '<button type="button" data-limpiar class="btn-secundario">Limpiar filtros</button>' })
      : vacio({ icono: 'group', titulo: 'Todavía no hay clientes', texto: 'Se crean solos cuando alguien envía un pedido por WhatsApp desde la tienda. También puedes agregarlos a mano.', accion: '<button type="button" data-nuevo class="btn-primario">Nuevo cliente</button>' });
    return;
  }
  const paginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
  filtro.pagina = Math.min(Math.max(1, filtro.pagina), paginas);
  const pagina = filas.slice((filtro.pagina - 1) * POR_PAGINA, filtro.pagina * POR_PAGINA);
  const aviso = totalServidor > clientes.length
    ? `<div class="px-4 py-2.5 bg-[#FFFBEB] text-[#92400E] font-body-sm text-body-sm border-b border-[#FDE68A]">Se muestran los ${numero(clientes.length)} clientes con actividad más reciente de ${numero(totalServidor)}. Para los demás usa el buscador general del panel (Ctrl K).</div>`
    : '';
  lista.innerHTML = `${aviso}
    <div class="hidden lg:block overflow-x-auto"><table class="tabla">
      <thead><tr><th>Cliente</th><th>WhatsApp</th><th class="text-center">Pedidos</th><th class="text-right">Total gastado</th><th>Último pedido</th><th>Etiquetas</th><th class="text-right">Acciones</th></tr></thead>
      <tbody>${pagina.map(filaTabla).join('')}</tbody></table></div>
    <div class="lg:hidden divide-y divide-[#F1F5F9]">${pagina.map(tarjetaMovil).join('')}</div>
    <div class="border-t border-[#F1F5F9]">${paginacion({ total: filas.length, pagina: filtro.pagina, porPagina: POR_PAGINA })}</div>`;
}

function pintarTodo() {
  pintarKpis();
  pintarEtiquetas();
  pintarLista();
}

async function cargar() {
  const lista = $('#lista');
  lista.classList.add('opacity-60');
  try {
    const { filas, total } = await db.leerConTotal('mt_clientes', `select=*&order=ultimo_pedido_en.desc.nullslast,creado_en.desc&limit=${LIMITE}`);
    clientes = filas;
    totalServidor = total;
    cargado = true;
    pintarTodo();
  } catch (e) {
    toastError(e);
    if (!cargado) {
      $('#kpis').innerHTML = '';
      lista.innerHTML = vacio({ icono: 'cloud_off', titulo: 'No se pudieron cargar los clientes', texto: esc(e.message), accion: '<button type="button" data-reintentar class="btn-secundario">Reintentar</button>' });
    }
  } finally {
    lista.classList.remove('opacity-60');
  }
}

/** Reemplaza un cliente en la lista local con su versión más reciente. */
function sincronizarLocal(fila) {
  if (!fila) return;
  const i = clientes.findIndex((x) => x.id === fila.id);
  if (i < 0 || JSON.stringify(clientes[i]) === JSON.stringify(fila)) return;
  clientes[i] = fila;
  pintarTodo();
}

// ---------------- Ficha del cliente (panel lateral) ----------------
function htmlPedido(p) {
  const items = Array.isArray(p.items) ? p.items : [];
  const resumen = items.length ? `${num(items[0].cantidad)}x ${items[0].nombre}${items.length > 1 ? ` +${items.length - 1} más` : ''}` : '';
  return `<li><a href="pedidos.html#${esc(p.numero)}" class="flex items-center gap-3 p-3 hover:bg-[#F8FAFC] transition-colors">
    <span class="w-9 h-9 rounded-lg bg-surface-container-low text-primary flex items-center justify-center shrink-0">${ico('receipt_long', 'text-[18px]')}</span>
    <span class="flex-1 min-w-0"><span class="flex items-center gap-2 flex-wrap"><span class="font-label-lg text-label-lg text-on-surface tnum">${esc(p.numero)}</span>${chipPedido(p.estado)}</span>
      <span class="block font-body-sm text-body-sm text-on-surface-variant truncate" title="${esc(fechaHora(p.creado_en))}">${esc(hace(p.creado_en))}${resumen ? ` · ${esc(resumen)}` : ''}</span></span>
    <span class="font-label-lg text-label-lg tnum shrink-0 ${p.estado === 'cancelado' ? 'text-outline line-through' : 'text-on-surface'}">${dineroPanel(p.total)}</span></a></li>`;
}

function htmlDetalle(c, pedidos, etiquetas) {
  const comprados = pedidos.filter((p) => VENDIDOS.includes(p.estado)).length;
  const stat = (titulo, valor, icono) => `<div class="rounded-xl bg-surface-container-low p-3 min-w-0">
    <p class="flex items-center gap-1 font-label-sm text-label-sm uppercase tracking-wider text-outline">${ico(icono, 'text-[14px]')}${titulo}</p>
    <p class="mt-1 font-headline-sm text-headline-sm text-on-surface tnum truncate">${valor}</p></div>`;
  const desde = fecha(c.creado_en, { month: 'long', year: 'numeric' });
  return `<form data-form-cliente novalidate class="p-5 space-y-6">
    <div class="flex items-start gap-4">${avatar(c.nombre, 'w-14 h-14 font-headline-sm text-headline-sm')}
      <div class="min-w-0 flex-1">
        <p class="font-headline-sm text-headline-sm text-on-surface break-words">${esc(c.nombre)}</p>
        <p class="font-body-sm text-body-sm text-on-surface-variant">${[c.ciudad ? esc(c.ciudad) : '', desde ? `Cliente desde ${esc(desde)}` : ''].filter(Boolean).join(' · ')}</p>
        ${etiquetas.length || c.ejemplo ? `<div class="flex flex-wrap gap-1 mt-2">${chipsEtiquetas(etiquetas)}${c.ejemplo ? '<span class="chip-gris">Ejemplo</span>' : ''}</div>` : ''}
      </div>
    </div>
    ${c.telefono
      ? `<a href="${esc(urlWhatsApp(c.telefono, mensajeHola(c)))}" target="_blank" rel="noopener" class="btn-wa w-full">${ico('chat', 'text-[18px]', true)}Escribir por WhatsApp<span class="tnum font-normal opacity-90">· ${esc(telefonoBonito(c.telefono))}</span></a>`
      : '<p class="p-3 rounded-xl bg-surface-container-low font-body-sm text-body-sm text-on-surface-variant">Sin teléfono: agrega su WhatsApp abajo para escribirle desde aquí.</p>'}
    <div class="grid grid-cols-2 gap-2">
      ${stat('Pedidos', numero(c.total_pedidos), 'receipt_long')}
      ${stat('Total gastado', dineroPanel(c.total_gastado), 'payments')}
      ${stat('Ticket promedio', comprados ? dineroPanel(num(c.total_gastado) / comprados) : '—', 'sell')}
      ${stat('Último pedido', c.ultimo_pedido_en ? esc(hace(c.ultimo_pedido_en)) : 'Sin pedidos', 'schedule')}
    </div>
    <section class="space-y-3">
      ${tituloSeccion('Datos del cliente', 'person', '')}
      ${camposCliente(c, 'cl', etiquetas)}
      <div class="flex justify-end"><button type="submit" data-guardar class="btn-primario">${ico('save', 'text-[18px]')}Guardar cambios</button></div>
    </section>
    <section>
      <div class="flex items-center justify-between gap-2 mb-2">${tituloSeccion(`Historial de pedidos (${numero(pedidos.length)})`, 'history', '')}
        ${pedidos.length ? `<a href="pedidos.html?q=${encodeURIComponent(c.telefono || c.nombre)}" class="font-label-md text-label-md text-primary font-semibold hover:underline whitespace-nowrap">Ver en Pedidos</a>` : ''}</div>
      ${pedidos.length
        ? `<ul class="divide-y divide-[#F1F5F9] rounded-2xl border border-[#E2E8F0] overflow-hidden">${pedidos.map(htmlPedido).join('')}</ul>`
        : '<p class="p-3 rounded-xl bg-surface-container-low font-body-sm text-body-sm text-on-surface-variant">Todavía no tiene pedidos registrados.</p>'}
    </section>
    <section class="pt-4 border-t border-[#F1F5F9] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <p class="font-body-sm text-body-sm text-on-surface-variant">Si lo eliminas, sus pedidos se conservan con sus datos, pero sin vínculo a esta ficha.</p>
      <button type="button" data-eliminar class="btn-peligro-suave ${CHICO} self-start sm:self-auto">${ico('delete', 'text-[16px]')}Eliminar cliente</button>
    </section>
  </form>`;
}

function pintarDetalle(actual) {
  actual.api.cuerpo.innerHTML = htmlDetalle(actual.cliente, actual.pedidos, actual.etiquetas.lista);
  conectarEditor(actual.api.cuerpo.querySelector('[data-bloque-etiquetas]'), actual.etiquetas);
}

async function abrirDetalle(id) {
  if (!UUID.test(id)) return;
  detalle?.api.cerrar();
  const previo = clientes.find((c) => c.id === id);
  const api = panelLateral({
    titulo: previo?.nombre || 'Cliente',
    contenido: '<div class="p-5 space-y-4"><div class="flex gap-4"><div class="w-14 h-14 rounded-full esqueleto"></div><div class="flex-1 space-y-2"><div class="h-6 esqueleto w-2/3"></div><div class="h-4 esqueleto w-1/2"></div></div></div><div class="h-10 esqueleto"></div><div class="grid grid-cols-2 gap-2"><div class="h-16 esqueleto"></div><div class="h-16 esqueleto"></div></div><div class="h-64 esqueleto"></div></div>',
  });
  const actual = { api, cliente: previo || null, pedidos: [], etiquetas: { lista: [] }, guardando: false };
  detalle = actual;
  vigilarCierre(api, () => { if (detalle === actual) { detalle = null; if (location.hash) ponerHash(''); } });
  ponerHash(id);
  api.el.addEventListener('submit', (e) => { e.preventDefault(); guardarCliente(actual, e.target); });
  api.el.addEventListener('click', (e) => { if (e.target.closest('[data-eliminar]')) eliminarCliente(actual); });
  try {
    const [filas, pedidos] = await Promise.all([
      db.leer('mt_clientes', `select=*&id=eq.${id}&limit=1`),
      db.leer('mt_pedidos', `select=id,numero,creado_en,total,estado,unidades,items&cliente_id=eq.${id}&order=creado_en.desc&limit=100`),
    ]);
    if (detalle !== actual) return;
    if (!filas[0]) {
      api.cuerpo.innerHTML = vacio({ icono: 'search_off', titulo: 'No encontramos este cliente', texto: 'Puede que haya sido eliminado.' });
      return;
    }
    actual.cliente = filas[0];
    actual.pedidos = pedidos;
    actual.etiquetas.lista = [...(filas[0].etiquetas || [])];
    api.titulo(filas[0].nombre);
    pintarDetalle(actual);
    sincronizarLocal(filas[0]);
  } catch (e) {
    if (detalle !== actual) return;
    api.cuerpo.innerHTML = vacio({ icono: 'cloud_off', titulo: 'No se pudo cargar el cliente', texto: esc(e.message) });
  }
}

async function guardarCliente(actual, form) {
  const c = actual.cliente;
  if (!c || actual.guardando) return;
  actual.etiquetas.confirmarPendiente?.();
  let cambios;
  try { cambios = leerDatos(form, actual.etiquetas.lista, c.id); } catch (e) { toastError(e); return; }
  const boton = form.querySelector('[data-guardar]');
  const antes = boton?.innerHTML;
  actual.guardando = true;
  if (boton) { boton.disabled = true; boton.innerHTML = `${spinner()} Guardando…`; }
  try {
    const [fila] = await db.actualizar('mt_clientes', `id=eq.${c.id}`, cambios);
    const nuevo = fila || { ...c, ...cambios };
    sincronizarLocal(nuevo);
    toast('Cliente actualizado');
    if (detalle !== actual) return;
    actual.cliente = nuevo;
    actual.etiquetas.lista = [...(nuevo.etiquetas || [])];
    actual.api.titulo(nuevo.nombre);
    pintarDetalle(actual);
  } catch (e) {
    toastError(e);
  } finally {
    actual.guardando = false;
    if (boton?.isConnected) { boton.disabled = false; boton.innerHTML = antes; }
  }
}

async function eliminarCliente(actual) {
  const c = actual.cliente;
  if (!c) return;
  let n = actual.pedidos.length;
  try { n = await db.contar('mt_pedidos', `cliente_id=eq.${c.id}`); } catch { /* se usa el historial cargado */ }
  const ok = await confirmar({
    titulo: `¿Eliminar a ${c.nombre}?`, boton: 'Eliminar cliente', peligro: true,
    mensaje: n
      ? `Tiene ${plural(n, 'pedido', 'pedidos')}. Los pedidos se conservan con sus datos (nombre, teléfono y productos), pero dejarán de estar vinculados a esta ficha. Esta acción no se puede deshacer.`
      : 'Se borrará su ficha. Esta acción no se puede deshacer.',
  });
  if (!ok) return;
  try {
    const borrados = await db.borrar('mt_clientes', `id=eq.${c.id}`);
    if (!borrados?.length) throw new Error('No se pudo eliminar: el cliente no existe o no tienes permiso.');
    clientes = clientes.filter((x) => x.id !== c.id);
    totalServidor = Math.max(0, totalServidor - 1);
    actual.api.cerrar();
    pintarTodo();
    toast('Cliente eliminado');
  } catch (e) { toastError(e); }
}

// ---------------- Alta ----------------
async function nuevoCliente() {
  if (altaAbierta) return;
  altaAbierta = true;
  const estado = { lista: [] };
  try {
    const creado = await modal({
      titulo: 'Nuevo cliente', icono: 'person_add', ancho: 'lg', textoEnviar: 'Crear cliente',
      subtitulo: 'Los clientes también se crean solos cuando envían un pedido desde la tienda.',
      contenido: camposCliente({}, 'nc', []),
      alAbrir: (capa) => conectarEditor(capa.querySelector('[data-bloque-etiquetas]'), estado),
      alEnviar: async (form) => {
        estado.confirmarPendiente?.();
        const [fila] = await db.crear('mt_clientes', [leerDatos(form, estado.lista)]);
        return fila || true;
      },
    });
    if (!creado) return;
    if (creado === true) { await cargar(); return; }
    clientes.unshift(creado);
    totalServidor += 1;
    pintarTodo();
    toast('Cliente creado');
    abrirDetalle(creado.id);
  } finally {
    altaAbierta = false;
  }
}

// ---------------- Exportar ----------------
function exportar() {
  const filas = filtrados();
  if (!filas.length) { toast('No hay clientes para exportar con estos filtros', { tipo: 'info' }); return; }
  const csv = aCsv(filas, [
    { titulo: 'Nombre', valor: (c) => celdaSegura(c.nombre) },
    { titulo: 'Teléfono', valor: (c) => telefonoCsv(c.telefono) },
    { titulo: 'Ciudad', valor: (c) => celdaSegura(c.ciudad || '') },
    { titulo: 'Email', valor: (c) => celdaSegura(c.email || '') },
    { titulo: 'Etiquetas', valor: (c) => celdaSegura((c.etiquetas || []).join(' | ')) },
    { clave: 'total_pedidos', titulo: 'Pedidos' },
    { clave: 'total_gastado', titulo: 'Total gastado' },
    { titulo: 'Último pedido', valor: (c) => (c.ultimo_pedido_en ? new Date(c.ultimo_pedido_en).toLocaleString('es') : '') },
    { titulo: 'Cliente desde', valor: (c) => (c.creado_en ? new Date(c.creado_en).toLocaleDateString('es') : '') },
    { titulo: 'Notas', valor: (c) => celdaSegura(c.notas || '') },
    { titulo: 'Ejemplo', valor: (c) => (c.ejemplo ? 'Sí' : 'No') },
  ]);
  descargar(`clientes-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
  toast(plural(filas.length, 'cliente exportado', 'clientes exportados'));
}

// ---------------- Enlaces por hash (#nuevo, #<id>) ----------------
function manejarHash() {
  let h = '';
  try { h = decodeURIComponent(location.hash.slice(1)).trim(); } catch { return; }
  if (!h) return;
  if (h.toLowerCase() === 'nuevo') { ponerHash(''); nuevoCliente(); return; }
  if (UUID.test(h) && detalle?.cliente?.id !== h) abrirDetalle(h);
}

// ---------------- Eventos ----------------
pintarBase();

contenido.addEventListener('click', (e) => {
  const t = e.target;
  const et = t.closest('[data-etiqueta]');
  if (et) {
    const valor = et.dataset.etiqueta;
    filtro.etiqueta = valor && normalizar(valor) !== normalizar(filtro.etiqueta) ? valor : '';
    filtro.pagina = 1;
    pintarEtiquetas();
    pintarLista();
    return;
  }
  const pag = t.closest('[data-pagina]');
  if (pag) {
    if (!pag.disabled) { filtro.pagina = Number(pag.dataset.pagina); pintarLista(); $('#lista').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    return;
  }
  if (t.closest('#nuevoCliente,[data-nuevo]')) { nuevoCliente(); return; }
  if (t.closest('#exportar')) { exportar(); return; }
  if (t.closest('[data-limpiar]')) {
    $('#buscar').value = '';
    Object.assign(filtro, { q: '', etiqueta: '', pagina: 1 });
    pintarEtiquetas();
    pintarLista();
    return;
  }
  if (t.closest('[data-reintentar]')) { cargar(); return; }
  if (t.closest('a')) return; // los enlaces (WhatsApp) siguen su curso
  const fila = t.closest('[data-abrir]');
  if (fila) abrirDetalle(fila.dataset.abrir);
});

$('#buscar').addEventListener('input', debounce(() => {
  filtro.q = $('#buscar').value.trim().slice(0, 80);
  filtro.pagina = 1;
  pintarEtiquetas();
  pintarLista();
}, 200));
$('#orden').addEventListener('change', (e) => {
  filtro.orden = e.target.value;
  filtro.pagina = 1;
  pintarLista();
});
window.addEventListener('hashchange', manejarHash);

await cargar();
manejarHash();
