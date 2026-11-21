// Pedidos & Chats: bandeja de los pedidos que llegan por WhatsApp desde la tienda (y de los registrados a mano).
// Lista paginada en el servidor (filtros por estado, periodo y búsqueda), detalle lateral con cambio de estado
// (mt_cambiar_estado_pedido descuenta o devuelve stock), plantillas de WhatsApp, notas internas y exportación CSV.
import {
  $, esc, ico, numero, num, hace, fechaHora, iniciales, urlWhatsApp, aCsv, descargar, telefonoBonito, copiar, debounce,
  soloDigitos, precioVigente, disponibilidad, maximoPedido,
} from '../util.js';
import { db, urlImagen } from '../api.js';
import { iniciarPanel, dineroPanel, tienda, puede } from './base.js';
import {
  modal, confirmar, toast, toastError, chipPedido, chipProducto, ESTADOS_PEDIDO, panelLateral, paginacion, vacio,
  esqueletoFilas, spinner,
} from './ui.js';

await iniciarPanel({ seccion: 'pedidos', migas: [{ texto: 'Ventas' }, { texto: 'Pedidos & Chats' }], area: 'ventas' });
const contenido = $('#contenido');

// ---------------- Constantes ----------------
const POR_PAGINA = 20;
const ESTADOS = Object.keys(ESTADOS_PEDIDO); // nuevo … cancelado
const ABIERTOS = ['nuevo', 'contactado', 'negociacion'];
const DESCUENTAN = ['confirmado', 'enviado', 'entregado']; // al pasar a estos estados el servidor descuenta el stock
const FLUJO = ['nuevo', 'contactado', 'negociacion', 'confirmado', 'enviado', 'entregado'];
const CHIPS = [['todos', 'Todos'], ['nuevo', 'Nuevos'], ['contactado', 'Contactados'], ['negociacion', 'En negociación'],
  ['confirmado', 'Confirmados'], ['enviado', 'Enviados'], ['entregado', 'Entregados'], ['cancelado', 'Cancelados']];
const COLOR_CONTEO = { nuevo: 'text-[#136633] font-bold', cancelado: 'text-error font-semibold' };
const PERIODOS = [['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['90', 'Últimos 90 días'], ['todo', 'Todo el historial']];
const CANALES = {
  carrito: { texto: 'Carrito de la tienda', icono: 'shopping_bag' },
  producto: { texto: 'Ficha de producto', icono: 'touch_app' },
  manual: { texto: 'Registrado en el panel', icono: 'support_agent' },
};
const ACCIONES = [
  { estado: 'contactado', texto: 'Contactado', icono: 'forum' },
  { estado: 'negociacion', texto: 'En negociación', icono: 'handshake' },
  { estado: 'confirmado', texto: 'Confirmado', icono: 'task_alt' },
  { estado: 'enviado', texto: 'Enviado', icono: 'local_shipping' },
  { estado: 'entregado', texto: 'Entregado', icono: 'inventory' },
];
const PLANTILLAS = [
  { id: 'disponibilidad', texto: 'Confirmar disponibilidad', icono: 'inventory_2' },
  { id: 'pago', texto: 'Enviar datos de pago', icono: 'payments' },
  { id: 'envio', texto: 'Avisar envío', icono: 'local_shipping' },
  { id: 'gracias', texto: 'Agradecer compra', icono: 'favorite' },
];
const AVATARES = ['bg-secondary-fixed text-on-secondary-fixed', 'bg-tertiary-fixed text-on-tertiary-fixed', 'bg-primary-fixed text-on-primary-fixed', 'bg-surface-container-high text-primary'];
// En estilos.css .btn-sm queda antes que las variantes (btn-primario, btn-wa…), así que se refuerza con utilidades.
const CHICO = 'btn-sm h-8 px-3 font-label-md text-label-md';
const COLUMNAS_LISTA = 'id,numero,creado_en,cliente_id,cliente_nombre,cliente_telefono,cliente_ciudad,items,unidades,total,estado,canal,ejemplo';
const COLUMNAS_PRODUCTO = 'id,nombre,sku,marca,precio,precio_oferta,oferta_activa,oferta_inicio,oferta_fin,stock,rastrear_stock,al_agotarse,variantes,garantias,imagenes,estado';

// ---------------- Estado de la página ----------------
const parametros = new URLSearchParams(location.search);
const filtro = {
  estado: ['todos', 'abiertos', ...ESTADOS].includes(parametros.get('estado')) ? parametros.get('estado') : 'todos',
  periodo: PERIODOS.some(([v]) => v === parametros.get('periodo')) ? parametros.get('periodo') : 'todo',
  q: (parametros.get('q') || '').trim().slice(0, 80),
  pagina: Math.max(1, Number.parseInt(parametros.get('pagina'), 10) || 1),
};
let conteosGlobales = null; // promesa {estado: n} sin filtros (KPIs, y chips cuando no hay búsqueda ni periodo)
let turnoLista = 0; // descarta respuestas viejas si el usuario cambia de filtro rápido
let detalle = null; // panel abierto: { api, pedido, notasGuardadas, ocupado }
let registroAbierto = false;
let marcaNuevos = null; // creado_en del pedido más reciente ya visto (para avisar de los nuevos)
const avisados = new Set(); // números ya notificados o creados desde esta página
let ultimaCarga = 0;
let enCiclo = false;

// ---------------- Utilidades ----------------
const itemsDe = (p) => (Array.isArray(p?.items) ? p.items : []);
const unidadesDe = (p) => num(p.unidades) || itemsDe(p).reduce((s, it) => s + num(it.cantidad), 0);
const plural = (n, uno, varios) => `${numero(n)} ${n === 1 ? uno : varios}`;
const primerNombre = (p) => String(p.cliente_nombre || '').trim().split(/\s+/)[0] || '';
const saludo = (p) => (primerNombre(p) ? `Hola ${primerNombre(p)}` : 'Hola');
const nombreTienda = () => tienda().nombre || 'nuestra tienda';
const textoEnvio = (envio) => (envio == null ? 'A coordinar' : num(envio) === 0 ? 'Bonificado' : dineroPanel(envio));
const lineaItem = (it) => `${num(it.cantidad)}x ${it.nombre}${it.variante ? ` (${it.variante})` : ''}${it.garantia ? ` + ${it.garantia}` : ''}`;
const ponerHash = (h) => history.replaceState(history.state, '', `${location.pathname}${location.search}${h ? `#${h}` : ''}`);
// Evita que Excel interprete como fórmula un texto escrito por un cliente (inyección CSV).
const celdaSegura = (v) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
const telefonoCsv = (t) => (t ? telefonoBonito(t).replace(/^\+/, '') : '');
const tituloSeccion = (texto, icono) => `<h3 class="flex items-center gap-1.5 font-label-sm text-label-sm uppercase tracking-wider text-outline mb-2">${ico(icono, 'text-[16px]')}${texto}</h3>`;

function avatar(nombre, tam = 'w-9 h-9') {
  const texto = String(nombre || '');
  let h = 0;
  for (const c of texto) h = (h * 31 + c.codePointAt(0)) % 9973;
  return `<span class="${tam} rounded-full ${AVATARES[h % AVATARES.length]} flex items-center justify-center font-label-md text-label-md font-bold shrink-0" aria-hidden="true">${esc(iniciales(texto))}</span>`;
}

function miniaturas(items, tam = 'w-9 h-9') {
  const lista = items.slice(0, 3);
  if (!lista.length) return '';
  return `<div class="flex -space-x-2 shrink-0">${lista.map((it) => (it.imagen
    ? `<img src="${esc(urlImagen(it.imagen))}" alt="" loading="lazy" class="${tam} rounded-lg object-cover bg-surface-container ring-2 ring-white">`
    : `<span class="${tam} rounded-lg bg-surface-container ring-2 ring-white flex items-center justify-center">${ico('inventory_2', 'text-[16px] text-outline')}</span>`)).join('')}</div>`;
}

function resumenItems(items) {
  if (!items.length) return { linea: 'Sin productos', extra: '' };
  const [a] = items;
  const resto = items.length - 1;
  return { linea: `${num(a.cantidad)}x ${a.nombre}${a.variante ? ` (${a.variante})` : ''}`, extra: resto ? `+${resto} ${resto === 1 ? 'producto más' : 'productos más'}` : '' };
}

/** Patrón ilike seguro para PostgREST: los caracteres reservados (, . : ( ) " …) se vuelven comodines. */
function patron(q) {
  const t = String(q || '').trim().replace(/[,.:()"'\\%*]+/g, '*').replace(/\s+/g, ' ');
  return t.replace(/\*/g, '').trim() ? encodeURIComponent(`*${t}*`) : '';
}

function filtroBusqueda(q) {
  const limpio = String(q || '').trim();
  if (!limpio) return '';
  const n = limpio.match(/^#?wa[-\s]?(\d+)$/i); // "WA-1024", "wa 1024"
  if (n) return `numero=ilike.*${n[1]}*`;
  const t = patron(limpio);
  const partes = t ? [`numero.ilike.${t}`, `cliente_nombre.ilike.${t}`, `cliente_ciudad.ilike.${t}`] : [];
  const dig = soloDigitos(limpio);
  if (dig.length >= 3) partes.push(`cliente_telefono.ilike.*${dig}*`);
  return partes.length ? `or=(${partes.join(',')})` : '';
}

function filtroPeriodo() {
  if (filtro.periodo === 'todo') return '';
  const desde = new Date(Date.now() - Number(filtro.periodo) * 86400000);
  return `creado_en=gte.${encodeURIComponent(desde.toISOString())}`;
}
const filtrosBase = () => [filtroPeriodo(), filtroBusqueda(filtro.q)].filter(Boolean).join('&');
function filtroEstado(clave = filtro.estado) {
  if (clave === 'todos') return '';
  if (clave === 'abiertos') return `estado=in.(${ABIERTOS.join(',')})`;
  return `estado=eq.${clave}`;
}

async function contarPorEstado(base) {
  const n = await Promise.all(ESTADOS.map((e) => db.contar('mt_pedidos', [base, `estado=eq.${e}`].filter(Boolean).join('&'))));
  return Object.fromEntries(ESTADOS.map((e, i) => [e, n[i]]));
}
function refrescarGlobales() {
  const promesa = contarPorEstado('');
  conteosGlobales = promesa;
  promesa.catch(() => { if (conteosGlobales === promesa) conteosGlobales = null; });
  return promesa;
}
const sumar = (c, lista) => lista.reduce((s, e) => s + (c[e] || 0), 0);
const conteoDe = (c, clave) => (clave === 'todos' ? sumar(c, ESTADOS) : clave === 'abiertos' ? sumar(c, ABIERTOS) : c[clave] || 0);

function guardarUrl() {
  const p = new URLSearchParams();
  if (filtro.estado !== 'todos') p.set('estado', filtro.estado);
  if (filtro.periodo !== 'todo') p.set('periodo', filtro.periodo);
  if (filtro.q) p.set('q', filtro.q);
  if (filtro.pagina > 1) p.set('pagina', String(filtro.pagina));
  const qs = p.toString();
  history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
}

/** Lee todas las filas de una consulta en lotes (respeta el máximo de filas por respuesta del servidor). */
async function leerTodo(tabla, consulta) {
  const primera = await db.leerConTotal(tabla, `${consulta}&limit=1000&offset=0`);
  const filas = [...primera.filas];
  while (filas.length < primera.total && filas.length < 50000) {
    const parte = await db.leer(tabla, `${consulta}&limit=1000&offset=${filas.length}`);
    if (!parte.length) break;
    filas.push(...parte);
  }
  return filas;
}

// ---------------- Mensajes de WhatsApp ----------------
function mensajeRapido(p) {
  return p.estado === 'nuevo'
    ? `${saludo(p)}, te escribimos de ${nombreTienda()} por tu pedido ${p.numero}. ¿Te ayudamos a confirmarlo?`
    : `${saludo(p)}, te escribimos de ${nombreTienda()} sobre tu pedido ${p.numero}.`;
}

function textoPlantilla(id, p, extra = {}) {
  const local = nombreTienda();
  const lista = itemsDe(p).map((it) => `• ${lineaItem(it)}`).join('\n');
  const total = dineroPanel(p.total);
  if (id === 'disponibilidad') {
    return `${saludo(p)}, te escribimos de ${local}. Recibimos tu pedido ${p.numero}:\n${lista}\n\n¡Buenas noticias! Tenemos disponibilidad de todo. Total: ${total}${p.envio == null ? ' (el envío lo coordinamos contigo)' : ''}.\n¿Te enviamos los datos de pago para reservarlo?`;
  }
  if (id === 'pago') {
    return `${saludo(p)}, para completar tu pedido ${p.numero} en ${local} el total a pagar es ${total}${p.envio == null ? ' más el envío, que coordinamos contigo' : ''}.\n\nDatos de pago:\n[escribe aquí los datos de pago]\n\nCuando realices el pago, envíanos el comprobante por este chat y preparamos tu pedido.`;
  }
  if (id === 'envio') {
    const empresa = extra.empresa ? `\nEmpresa de envío: ${extra.empresa}` : '';
    const guia = extra.guia ? `\nNúmero de guía: ${extra.guia}` : '';
    return `${saludo(p)}, ¡tu pedido ${p.numero} de ${local} ya va en camino!${empresa}${guia}\n\nTe avisamos cualquier novedad. ¡Gracias por tu compra!`;
  }
  return `¡Muchas gracias por tu compra${primerNombre(p) ? `, ${primerNombre(p)}` : ''}! Esperamos que disfrutes tu pedido ${p.numero}. En ${local} estamos para ayudarte en lo que necesites y, si te gustó, nos encantaría conocer tu opinión.`;
}

function resumenTexto(p) {
  return [
    `Pedido ${p.numero} · ${fechaHora(p.creado_en)}`,
    `Estado: ${ESTADOS_PEDIDO[p.estado]?.texto || p.estado}`,
    `Cliente: ${p.cliente_nombre}${p.cliente_ciudad ? ` (${p.cliente_ciudad})` : ''}${p.cliente_telefono ? ` · ${telefonoBonito(p.cliente_telefono)}` : ''}`,
    '',
    ...itemsDe(p).map((it) => `• ${lineaItem(it)} — ${dineroPanel(it.subtotal)}`),
    '',
    `Subtotal: ${dineroPanel(p.subtotal)}`,
    num(p.descuento) > 0 ? `Descuento${p.descuento_nombre ? ` (${p.descuento_nombre})` : ''}: -${dineroPanel(p.descuento)}` : null,
    `Envío: ${textoEnvio(p.envio)}`,
    `Total: ${dineroPanel(p.total)}`,
    p.nota ? `Nota del cliente: ${p.nota}` : null,
  ].filter((x) => x !== null).join('\n');
}

// ---------------- Estructura de la página ----------------
function pintarBase() {
  contenido.innerHTML = `
    <div class="flex flex-col xl:flex-row xl:items-end justify-between gap-space-md">
      <div class="min-w-0">
        <div class="flex items-center gap-space-xs mb-1"><span class="inline-flex w-2.5 h-2.5 rounded-full bg-secondary-fixed animate-pulse"></span>
          <span class="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-bold">Ventas &amp; Leads • WhatsApp</span></div>
        <h1 class="font-headline-lg-mobile text-headline-lg-mobile lg:font-headline-lg lg:text-headline-lg text-on-surface tracking-tight">Pedidos &amp; Chats</h1>
        <p class="font-body-md text-body-md text-on-surface-variant">Responde los pedidos que llegan por WhatsApp, avanza su estado y mantén el stock al día.</p>
      </div>
      <div class="flex flex-wrap items-center gap-space-xs">
        <button type="button" id="exportar" class="flex items-center gap-space-xs px-3.5 py-2 rounded-xl bg-surface-container-lowest hover:bg-surface-container-low text-on-surface font-label-md text-label-md shadow-sm transition-all disabled:opacity-60">${ico('download', 'text-[18px] text-on-surface-variant')}<span>Exportar CSV</span></button>
        <button type="button" id="registrar" class="flex items-center gap-space-xs px-3.5 py-2 rounded-xl bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md shadow-sm transition-all">${ico('add', 'text-[18px]')}<span>Registrar pedido</span></button>
      </div>
    </div>
    <div id="kpis"><div data-esqueleto class="grid grid-cols-2 xl:grid-cols-4 gap-space-sm sm:gap-space-md">${'<div class="h-32 esqueleto"></div>'.repeat(4)}</div></div>
    <div class="bg-surface-container-lowest rounded-xl shadow-sm p-space-md space-y-space-sm">
      <div class="flex flex-col md:flex-row md:items-center gap-space-sm">
        <div class="relative flex-1 min-w-0">${ico('search', 'absolute left-3.5 top-1/2 -translate-y-1/2 text-outline text-[20px] pointer-events-none')}
          <input id="buscar" type="search" value="${esc(filtro.q)}" maxlength="80" autocomplete="off" aria-label="Buscar pedidos" placeholder="Buscar por número, cliente, teléfono o ciudad…"
            class="w-full pl-11 pr-3 py-2.5 bg-surface-container-low rounded-xl font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container focus:ring-2 focus:ring-primary/20 transition-all"></div>
        <div class="relative shrink-0">
          <select id="periodo" aria-label="Periodo" class="w-full md:w-auto appearance-none pl-3 pr-9 py-2.5 bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer">
            ${PERIODOS.map(([v, t]) => `<option value="${v}" ${filtro.periodo === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
          ${ico('expand_more', 'absolute right-2.5 top-1/2 -translate-y-1/2 text-outline text-[18px] pointer-events-none')}
        </div>
      </div>
      <div id="chips" class="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5 lg:flex-wrap" role="toolbar" aria-label="Filtrar por estado"></div>
    </div>
    <div id="lista" class="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden transition-opacity scroll-mt-20">
      <div class="hidden lg:block"><table class="tabla"><tbody>${esqueletoFilas(6, 6)}</tbody></table></div>
      <div class="lg:hidden p-space-md space-y-3">${'<div class="h-28 esqueleto"></div>'.repeat(4)}</div>
    </div>`;
}

// ---------------- KPIs ----------------
async function cargarKpis() {
  const desde = new Date(Date.now() - 30 * 86400000).toISOString();
  try {
    const [g, ventas] = await Promise.all([
      conteosGlobales || refrescarGlobales(),
      db.leer('mt_pedidos', `select=total&estado=in.(${DESCUENTAN.join(',')})&creado_en=gte.${encodeURIComponent(desde)}&limit=10000`),
    ]);
    pintarKpis(g, { monto: ventas.reduce((s, v) => s + num(v.total), 0), n: ventas.length });
  } catch {
    // El error ya lo informa la lista; sólo se quita el esqueleto si no había datos.
    const caja = $('#kpis');
    if (caja.querySelector('[data-esqueleto]')) caja.innerHTML = '<p class="font-body-sm text-body-sm text-outline">No se pudieron cargar los indicadores.</p>';
  }
}

function pintarKpis(g, ventas) {
  const proceso = g.contactado + g.negociacion;
  const [entero, decimales] = dineroPanel(ventas.monto).split(/(?=[.,]\d{2}$)/);
  const tarjeta = (titulo, icono, color, valor, pie) => `<div class="bg-surface-container-lowest rounded-xl p-space-md shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between min-w-0">
      <div class="flex items-start justify-between gap-2"><span class="font-label-sm text-label-sm uppercase tracking-wider text-outline">${titulo}</span>
        <div class="w-8 h-8 rounded-lg ${color} flex items-center justify-center shrink-0">${ico(icono, 'text-[18px]')}</div></div>
      <div class="my-space-sm font-headline-md text-headline-md sm:font-headline-lg sm:text-headline-lg text-on-surface tnum break-words">${valor}</div>${pie}</div>`;
  const ir = (estado, texto) => `<button type="button" data-ir-estado="${estado}" class="self-start font-label-sm text-label-sm text-primary font-semibold hover:underline flex items-center gap-1 text-left">${texto}${ico('arrow_forward', 'text-[14px]')}</button>`;
  const nota = (texto, clase = 'text-outline') => `<span class="font-label-sm text-label-sm ${clase}">${texto}</span>`;
  $('#kpis').innerHTML = `<div class="grid grid-cols-2 xl:grid-cols-4 gap-space-sm sm:gap-space-md">
    ${tarjeta('Nuevos', 'fiber_new', 'bg-wa/15 text-wa-tinta', numero(g.nuevo), g.nuevo ? ir('nuevo', 'Responder ahora') : nota('Todo respondido', 'text-secondary font-semibold'))}
    ${tarjeta('En proceso', 'forum', 'bg-tertiary-fixed text-on-tertiary-fixed-variant', numero(proceso), nota(`${numero(g.contactado)} contactados • ${numero(g.negociacion)} en negociación`))}
    ${tarjeta('Por despachar', 'local_shipping', 'bg-secondary-container text-on-secondary-container', numero(g.confirmado), g.confirmado ? ir('confirmado', 'Ver confirmados') : nota('Nada pendiente de envío'))}
    ${tarjeta('Vendido 30 días', 'payments', 'bg-surface-container-high text-primary', `${esc(entero)}<span class="text-body-sm text-outline">${esc(decimales || '')}</span>`, nota(`${plural(ventas.n, 'venta cerrada', 'ventas cerradas')}`))}
  </div>`;
}

// ---------------- Lista ----------------
async function cargarLista({ silencioso = false } = {}) {
  const turno = ++turnoLista;
  const lista = $('#lista');
  lista.classList.add('opacity-60');
  const base = filtrosBase();
  const consulta = [`select=${COLUMNAS_LISTA}`, base, filtroEstado(), 'order=creado_en.desc,id.desc',
    `limit=${POR_PAGINA}`, `offset=${(filtro.pagina - 1) * POR_PAGINA}`].filter(Boolean).join('&');
  try {
    const [conteos, { filas, total }] = await Promise.all([
      base ? contarPorEstado(base) : conteosGlobales || refrescarGlobales(),
      db.leerConTotal('mt_pedidos', consulta),
    ]);
    if (turno !== turnoLista) return;
    const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    if (filtro.pagina > paginas) { filtro.pagina = paginas; guardarUrl(); await cargarLista({ silencioso }); return; }
    pintarChips(conteos);
    pintarLista(filas, total);
  } catch (e) {
    if (turno !== turnoLista || silencioso) return;
    toastError(e);
    if (!lista.querySelector('[data-abrir]')) {
      lista.innerHTML = vacio({ icono: 'cloud_off', titulo: 'No se pudieron cargar los pedidos', texto: esc(e.message), accion: '<button type="button" data-reintentar class="btn-secundario">Reintentar</button>' });
    }
  } finally {
    if (turno === turnoLista) lista.classList.remove('opacity-60');
  }
}

function pintarChips(c) {
  const lista = filtro.estado === 'abiertos' ? [CHIPS[0], ['abiertos', 'Abiertos'], ...CHIPS.slice(1)] : CHIPS;
  $('#chips').innerHTML = lista.map(([clave, texto]) => {
    const activo = filtro.estado === clave;
    return `<button type="button" data-filtro-estado="${clave}" aria-pressed="${activo}" class="shrink-0 px-3.5 py-1.5 rounded-lg font-label-md text-label-md whitespace-nowrap transition-all ${activo ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}">
      ${texto} <span class="ml-0.5 tnum ${activo ? 'opacity-80' : COLOR_CONTEO[clave] || 'text-outline font-semibold'}">(${numero(conteoDe(c, clave))})</span></button>`;
  }).join('');
}

function botonWa(p, clase = `btn-wa ${CHICO}`, textoVisible = 'hidden xl:inline') {
  if (!p.cliente_telefono) return '';
  return `<a href="${esc(urlWhatsApp(p.cliente_telefono, mensajeRapido(p)))}" target="_blank" rel="noopener" class="${clase}" aria-label="Escribir por WhatsApp a ${esc(p.cliente_nombre)}">${ico('chat', 'text-[16px]', true)}<span class="${textoVisible}">WhatsApp</span></a>`;
}

function filaTabla(p) {
  const tel = p.cliente_telefono;
  const { linea, extra } = resumenItems(itemsDe(p));
  return `<tr data-abrir="${esc(p.numero)}" class="cursor-pointer">
    <td class="whitespace-nowrap"><div class="flex flex-col gap-0.5">
      <span class="flex items-center gap-1.5"><span class="font-label-lg text-label-lg text-on-surface font-bold tnum">${esc(p.numero)}</span>${p.ejemplo ? '<span class="chip-gris">Ejemplo</span>' : ''}</span>
      <span class="font-body-sm text-body-sm text-outline" title="${esc(fechaHora(p.creado_en))}">${esc(hace(p.creado_en))}${p.canal === 'manual' ? ' · Manual' : ''}</span></div></td>
    <td><div class="flex items-center gap-2.5 min-w-[170px]">${avatar(p.cliente_nombre)}
      <div class="min-w-0"><p class="font-label-lg text-label-lg text-on-surface truncate max-w-[200px]">${esc(p.cliente_nombre)}</p>
        <p class="font-body-sm text-body-sm tnum whitespace-nowrap ${tel ? 'text-on-surface-variant' : 'text-outline'}">${tel ? esc(telefonoBonito(tel)) : 'Sin teléfono'}</p>
        ${p.cliente_ciudad ? `<p class="font-body-sm text-body-sm text-outline flex items-center gap-0.5 max-w-[200px]">${ico('location_on', 'text-[14px]')}<span class="truncate">${esc(p.cliente_ciudad)}</span></p>` : ''}</div></div></td>
    <td><div class="flex items-center gap-2.5 min-w-[200px] max-w-[320px]">${miniaturas(itemsDe(p))}
      <div class="min-w-0"><p class="font-body-sm text-body-sm text-on-surface truncate">${esc(linea)}</p>${extra ? `<p class="font-body-sm text-body-sm text-outline">${extra}</p>` : ''}</div></div></td>
    <td class="text-right whitespace-nowrap"><span class="font-label-lg text-label-lg text-on-surface font-bold tnum">${dineroPanel(p.total)}</span>
      <p class="font-body-sm text-body-sm text-outline tnum">${plural(unidadesDe(p), 'unidad', 'unidades')}</p></td>
    <td class="whitespace-nowrap">${chipPedido(p.estado)}</td>
    <td class="text-right whitespace-nowrap"><div class="flex items-center justify-end gap-1.5">${botonWa(p)}
      <button type="button" data-abrir="${esc(p.numero)}" class="btn-secundario ${CHICO}">Ver</button></div></td>
  </tr>`;
}

function tarjetaMovil(p) {
  const { linea, extra } = resumenItems(itemsDe(p));
  const contacto = [p.cliente_telefono ? telefonoBonito(p.cliente_telefono) : 'Sin teléfono', p.cliente_ciudad].filter(Boolean).map(esc).join(' · ');
  return `<div data-abrir="${esc(p.numero)}" class="p-space-md flex flex-col gap-2.5 cursor-pointer active:bg-surface-container-low transition-colors">
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0"><div class="flex items-center gap-1.5 flex-wrap"><span class="font-label-lg text-label-lg text-on-surface font-bold tnum">${esc(p.numero)}</span>${p.ejemplo ? '<span class="chip-gris">Ejemplo</span>' : ''}</div>
        <p class="font-body-sm text-body-sm text-outline">${esc(hace(p.creado_en))}${p.canal === 'manual' ? ' · Manual' : ''}</p></div>
      ${chipPedido(p.estado)}</div>
    <div class="flex items-center gap-2.5 min-w-0">${avatar(p.cliente_nombre)}
      <div class="min-w-0"><p class="font-label-lg text-label-lg text-on-surface truncate">${esc(p.cliente_nombre)}</p>
        <p class="font-body-sm text-body-sm text-on-surface-variant truncate tnum">${contacto}</p></div></div>
    <div class="flex items-center gap-2.5 min-w-0">${miniaturas(itemsDe(p), 'w-8 h-8')}
      <p class="font-body-sm text-body-sm text-on-surface-variant truncate min-w-0">${esc(linea)}${extra ? ` <span class="text-outline">${extra}</span>` : ''}</p></div>
    <div class="flex items-center justify-between gap-2 flex-wrap pt-0.5">
      <span class="font-headline-sm text-headline-sm text-on-surface tnum">${dineroPanel(p.total)}</span>
      <div class="flex items-center gap-2">${botonWa(p, `btn-wa ${CHICO}`, '')}<button type="button" data-abrir="${esc(p.numero)}" class="btn-secundario ${CHICO}">Ver</button></div>
    </div></div>`;
}

function pintarLista(filas, total) {
  const lista = $('#lista');
  if (!filas.length) {
    const hayFiltros = filtro.estado !== 'todos' || filtro.periodo !== 'todo' || filtro.q;
    lista.innerHTML = hayFiltros
      ? vacio({ icono: 'search_off', titulo: 'No hay pedidos con estos filtros', texto: 'Prueba con otro estado, periodo o búsqueda.', accion: '<button type="button" data-limpiar class="btn-secundario">Limpiar filtros</button>' })
      : vacio({ icono: 'chat', titulo: 'Todavía no hay pedidos', texto: 'Cuando un cliente envíe su pedido por WhatsApp desde la tienda aparecerá aquí. También puedes registrar los pedidos que tomes por teléfono.', accion: '<button type="button" data-registrar class="btn-primario">Registrar pedido</button>' });
    return;
  }
  lista.innerHTML = `
    <div class="hidden lg:block overflow-x-auto"><table class="tabla">
      <thead><tr><th>Pedido</th><th>Cliente</th><th>Productos</th><th class="text-right">Total</th><th>Estado</th><th class="text-right">Acciones</th></tr></thead>
      <tbody>${filas.map(filaTabla).join('')}</tbody></table></div>
    <div class="lg:hidden divide-y divide-[#F1F5F9]">${filas.map(tarjetaMovil).join('')}</div>
    <div class="border-t border-[#F1F5F9]">${paginacion({ total, pagina: filtro.pagina, porPagina: POR_PAGINA })}</div>`;
}

async function refrescarTodo({ silencioso = false } = {}) {
  refrescarGlobales();
  await Promise.all([cargarKpis(), cargarLista({ silencioso })]);
  ultimaCarga = Date.now();
}

function cambiarFiltro(cambios) {
  Object.assign(filtro, cambios, { pagina: 1 });
  guardarUrl();
  cargarLista();
}

function limpiarFiltros() {
  $('#buscar').value = '';
  $('#periodo').value = 'todo';
  cambiarFiltro({ estado: 'todos', periodo: 'todo', q: '' });
}

// ---------------- Detalle (panel lateral) ----------------
async function leerPedido(clave) {
  const f = clave.id ? `id=eq.${encodeURIComponent(clave.id)}` : `numero=eq.${encodeURIComponent(clave.numero)}`;
  const [p] = await db.leer('mt_pedidos', `select=*&${f}&limit=1`);
  return p || null;
}

/** Avisa cuando el panel se cierra (Escape, clic afuera o botón cerrar). */
function vigilarCierre(api, alCerrar) {
  const obs = new MutationObserver(() => { if (!api.el.isConnected) { obs.disconnect(); alCerrar(); } });
  obs.observe(document.body, { childList: true });
}

async function abrirDetalle(clave) {
  detalle?.api.cerrar();
  const api = panelLateral({
    titulo: clave.numero ? `Pedido ${clave.numero}` : 'Pedido',
    contenido: '<div class="p-5 space-y-4"><div class="h-6 esqueleto w-1/2"></div><div class="h-28 esqueleto"></div><div class="h-36 esqueleto"></div><div class="h-56 esqueleto"></div></div>',
  });
  const actual = { api, pedido: null, notasGuardadas: '', ocupado: false };
  detalle = actual;
  vigilarCierre(api, () => { if (detalle === actual) { detalle = null; if (location.hash) ponerHash(''); } });
  api.el.addEventListener('click', (e) => clicDetalle(e, actual));
  api.el.addEventListener('input', (e) => { if (e.target.matches('[data-notas]')) notasCambiadas(actual); });
  try {
    const p = await leerPedido(clave);
    if (detalle !== actual) return;
    if (!p) {
      api.cuerpo.innerHTML = vacio({ icono: 'search_off', titulo: 'No encontramos este pedido', texto: 'Puede que haya sido eliminado o que el número no exista.' });
      return;
    }
    actual.pedido = p;
    api.titulo(`Pedido ${p.numero}`);
    ponerHash(p.numero);
    pintarDetalle(actual);
  } catch (e) {
    if (detalle !== actual) return;
    api.cuerpo.innerHTML = vacio({ icono: 'cloud_off', titulo: 'No se pudo cargar el pedido', texto: esc(e.message) });
  }
}

async function recargarDetalle(actual) {
  const p = await leerPedido({ id: actual.pedido.id });
  if (detalle !== actual) return;
  if (!p) { actual.api.cerrar(); return; }
  actual.pedido = p;
  pintarDetalle(actual);
}

function pintarDetalle(actual) {
  // Si había notas internas sin guardar, se conservan al volver a dibujar.
  const area = actual.api.cuerpo.querySelector('[data-notas]');
  const borrador = area && area.value !== actual.notasGuardadas ? area.value : null;
  actual.notasGuardadas = actual.pedido.notas_internas || '';
  actual.api.cuerpo.innerHTML = htmlDetalle(actual.pedido);
  if (borrador !== null) {
    actual.api.cuerpo.querySelector('[data-notas]').value = borrador;
    notasCambiadas(actual);
  }
}

function htmlEstado(p) {
  const cancelado = p.estado === 'cancelado';
  const i = FLUJO.indexOf(p.estado);
  const boton = (a) => {
    const esActual = a.estado === p.estado;
    const pasado = !cancelado && i >= 0 && FLUJO.indexOf(a.estado) < i;
    const clase = esActual ? 'bg-primary text-on-primary shadow-sm' : pasado ? 'bg-secondary-fixed/30 text-on-surface hover:bg-secondary-fixed/50' : 'bg-surface-container-low text-on-surface hover:bg-surface-container';
    return `<button type="button" data-a-estado="${a.estado}" ${esActual ? 'disabled aria-current="step"' : ''} class="flex items-center gap-2 px-3 py-2.5 rounded-xl font-label-md text-label-md text-left transition-all disabled:opacity-100 disabled:cursor-default ${clase}">
      ${ico(pasado ? 'check_circle' : a.icono, `text-[18px] ${pasado ? 'text-secondary' : ''}`, esActual || pasado)}<span class="min-w-0">${a.texto}${esActual ? '<span class="block font-label-sm text-label-sm opacity-80">Estado actual</span>' : ''}</span></button>`;
  };
  const progreso = cancelado
    ? `<div class="flex items-start gap-2 p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] font-body-sm text-body-sm mb-3">${ico('cancel', 'text-[18px]', true)}<span><strong>Pedido cancelado.</strong> Si el cliente retoma la compra, elige el estado al que vuelve.</span></div>`
    : `<div class="mb-3"><div class="flex items-center justify-between gap-2 font-label-sm text-label-sm text-outline mb-1.5"><span>Paso ${i + 1} de ${FLUJO.length}</span><span class="text-on-surface font-bold">${esc(ESTADOS_PEDIDO[p.estado]?.texto || p.estado)}</span></div>
        <div class="h-1.5 rounded-full bg-surface-container overflow-hidden"><div class="h-full rounded-full bg-primary transition-all" style="width:${Math.round(((i + 1) / FLUJO.length) * 100)}%"></div></div></div>`;
  return `<section>
    ${tituloSeccion('Estado del pedido', 'sync')}
    ${progreso}
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2" data-acciones-estado>
      ${ACCIONES.map(boton).join('')}
      ${cancelado ? '' : `<button type="button" data-a-estado="cancelado" class="flex items-center gap-2 px-3 py-2.5 rounded-xl font-label-md text-label-md text-left text-error bg-white border border-[#FECACA] hover:bg-[#FEF2F2] transition-all">${ico('cancel', 'text-[18px]')}<span>Cancelar</span></button>`}
    </div>
    <p class="ayuda mt-2 flex items-start gap-1.5">${ico(p.stock_descontado ? 'inventory' : 'info', 'text-[15px] mt-px')}<span>${p.stock_descontado
      ? 'El stock de este pedido ya se descontó del inventario. Si lo cancelas o lo regresas a un estado anterior, se devuelve.'
      : 'El stock se descuenta al marcarlo como Confirmado, Enviado o Entregado.'}</span></p>
  </section>`;
}

function htmlPlantillas(p) {
  const tel = p.cliente_telefono;
  const clase = 'flex items-center gap-2.5 p-2.5 rounded-xl border border-[#E2E8F0] bg-white hover:border-wa/60 hover:bg-wa/5 text-left font-label-md text-label-md text-on-surface transition-colors';
  const icono = (pl) => `<span class="w-8 h-8 rounded-lg bg-wa/15 text-wa-tinta flex items-center justify-center shrink-0">${ico(pl.icono, 'text-[18px]')}</span>`;
  const opciones = PLANTILLAS.map((pl) => (pl.id === 'envio'
    ? `<button type="button" data-plantilla="envio" class="${clase}">${icono(pl)}<span class="flex-1 min-w-0">${pl.texto}</span>${ico('edit', 'text-[16px] text-outline')}</button>`
    : `<a href="${esc(urlWhatsApp(tel, textoPlantilla(pl.id, p)))}" target="_blank" rel="noopener" class="${clase}">${icono(pl)}<span class="flex-1 min-w-0">${pl.texto}</span>${ico('open_in_new', 'text-[16px] text-outline')}</a>`)).join('');
  return `<section>
    ${tituloSeccion('Mensajes rápidos por WhatsApp', 'bolt')}
    ${tel ? `<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${opciones}</div>`
      : '<p class="font-body-sm text-body-sm text-on-surface-variant p-3 rounded-xl bg-surface-container-low">Este pedido no tiene teléfono. Copia el resumen para enviarlo por otro medio.</p>'}
    <button type="button" data-copiar class="btn-fantasma ${CHICO} mt-2 -ml-2">${ico('content_copy', 'text-[16px]')}Copiar resumen</button>
  </section>`;
}

function htmlItemDetalle(it) {
  const partes = [it.variante, it.garantia ? `Garantía: ${it.garantia}` : '', it.sku ? `SKU ${it.sku}` : ''].filter(Boolean);
  const nombre = esc(it.nombre || 'Producto');
  const titulo = puede('catalogo') && it.producto_id ? `<a href="producto.html?id=${esc(it.producto_id)}" class="hover:text-primary hover:underline">${nombre}</a>` : nombre;
  return `<li class="flex gap-3 p-3">
    <span class="w-14 h-14 rounded-xl bg-surface-container overflow-hidden shrink-0 flex items-center justify-center">${it.imagen ? `<img src="${esc(urlImagen(it.imagen))}" alt="" class="w-full h-full object-cover" loading="lazy">` : ico('inventory_2', 'text-[20px] text-outline')}</span>
    <div class="flex-1 min-w-0"><p class="font-label-lg text-label-lg text-on-surface line-clamp-2">${titulo}</p>
      ${partes.length ? `<p class="font-body-sm text-body-sm text-on-surface-variant">${partes.map(esc).join(' · ')}</p>` : ''}
      <p class="font-body-sm text-body-sm text-outline tnum mt-0.5">${numero(num(it.cantidad))} × ${dineroPanel(it.precio_unit)}</p></div>
    <span class="font-label-lg text-label-lg text-on-surface tnum shrink-0">${dineroPanel(it.subtotal ?? num(it.precio_unit) * num(it.cantidad))}</span></li>`;
}

function htmlTotales(p) {
  const fila = (etq, valor, clase = 'text-on-surface') => `<div class="flex items-start justify-between gap-3"><span class="text-on-surface-variant min-w-0">${etq}</span><span class="tnum text-right shrink-0 ${clase}">${valor}</span></div>`;
  const promo = [p.descuento_nombre ? esc(p.descuento_nombre) : '', p.codigo_promo ? `<span class="chip-verde ml-1">${esc(p.codigo_promo)}</span>` : ''].filter(Boolean).join(' ');
  return `<section class="rounded-2xl bg-surface-container-low p-4 space-y-2 font-body-md text-body-md">
    ${fila('Subtotal', dineroPanel(p.subtotal))}
    ${num(p.descuento) > 0 ? fila(`Descuento${promo ? ` · ${promo}` : ''}`, `−${dineroPanel(p.descuento)}`, 'text-secondary font-semibold') : ''}
    ${fila('Envío', textoEnvio(p.envio), p.envio == null ? 'text-[#92400E] font-semibold' : num(p.envio) === 0 ? 'text-secondary font-semibold' : 'text-on-surface')}
    <div class="flex items-center justify-between gap-3 pt-2 border-t border-outline-variant/40"><span class="font-label-lg text-label-lg text-on-surface">Total</span>
      <span class="font-headline-sm text-headline-sm text-on-surface tnum">${dineroPanel(p.total)}</span></div>
    ${p.envio == null ? '<p class="ayuda">El envío se coordina con el cliente y no está sumado al total.</p>' : ''}
  </section>`;
}

function htmlDetalle(p) {
  const tel = p.cliente_telefono;
  const canal = CANALES[p.canal] || CANALES.carrito;
  const items = itemsDe(p);
  return `<div class="p-5 space-y-6">
    <div class="flex flex-col gap-2">
      <div class="flex items-center gap-1.5 flex-wrap">${chipPedido(p.estado)}${p.stock_descontado ? `<span class="chip-verde">${ico('inventory', 'text-[14px]')}Stock descontado</span>` : ''}${p.ejemplo ? '<span class="chip-gris">Ejemplo</span>' : ''}</div>
      <p class="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-x-1.5 gap-y-1 flex-wrap">${ico('schedule', 'text-[16px]')}<span>${esc(fechaHora(p.creado_en))} (${esc(hace(p.creado_en))})</span>
        <span class="text-outline">•</span>${ico(canal.icono, 'text-[16px]')}<span>${canal.texto}</span></p>
    </div>
    <section class="rounded-2xl bg-surface-container-low p-4 flex flex-col gap-3">
      <div class="flex items-center gap-3 min-w-0">${avatar(p.cliente_nombre, 'w-11 h-11')}
        <div class="min-w-0 flex-1"><p class="font-subheading text-subheading text-on-surface break-words">${esc(p.cliente_nombre)}</p>
          <p class="font-body-sm text-body-sm text-on-surface-variant tnum">${tel ? esc(telefonoBonito(tel)) : 'Sin teléfono'}${p.cliente_ciudad ? ` · ${esc(p.cliente_ciudad)}` : ''}</p></div></div>
      ${tel || p.cliente_id ? `<div class="flex flex-wrap gap-2">
        ${tel ? `<a href="${esc(urlWhatsApp(tel, mensajeRapido(p)))}" target="_blank" rel="noopener" class="btn-wa ${CHICO}">${ico('chat', 'text-[16px]', true)}Abrir WhatsApp</a>` : ''}
        ${p.cliente_id ? `<a href="clientes.html#${esc(p.cliente_id)}" class="btn-secundario ${CHICO}">${ico('person', 'text-[16px]')}Ficha del cliente</a>` : ''}</div>` : ''}
    </section>
    ${htmlEstado(p)}
    ${htmlPlantillas(p)}
    <section>${tituloSeccion(`Productos · ${plural(unidadesDe(p), 'unidad', 'unidades')}`, 'shopping_bag')}
      <ul class="divide-y divide-[#F1F5F9] rounded-2xl border border-[#E2E8F0] overflow-hidden">${items.map(htmlItemDetalle).join('') || '<li class="p-4 font-body-sm text-body-sm text-outline">Sin productos.</li>'}</ul></section>
    ${htmlTotales(p)}
    ${p.nota ? `<section>${tituloSeccion('Nota del cliente', 'chat_bubble')}<p class="p-3 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] font-body-md text-body-md whitespace-pre-line break-words">${esc(p.nota)}</p></section>` : ''}
    <section>${tituloSeccion('Notas internas', 'edit_note')}
      <textarea data-notas class="campo" rows="3" maxlength="4000" aria-label="Notas internas" placeholder="Acuerdos de pago, dirección de entrega, seguimiento…">${esc(p.notas_internas || '')}</textarea>
      <div class="flex items-center justify-between gap-2 mt-2"><span data-estado-notas class="font-body-sm text-body-sm text-outline">Sólo las ve tu equipo.</span>
        <button type="button" data-guardar-notas class="btn-secundario ${CHICO}" disabled>${ico('save', 'text-[16px]')}Guardar notas</button></div></section>
    ${puede('config') ? `<section class="pt-4 border-t border-[#F1F5F9] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <p class="font-body-sm text-body-sm text-on-surface-variant">Eliminar lo borra del historial. Si el cliente desistió, mejor cancélalo.</p>
      <button type="button" data-eliminar class="btn-peligro-suave ${CHICO} self-start sm:self-auto">${ico('delete', 'text-[16px]')}Eliminar pedido</button></section>` : ''}
  </div>`;
}

async function clicDetalle(e, actual) {
  const b = e.target.closest('[data-a-estado],[data-plantilla],[data-copiar],[data-guardar-notas],[data-eliminar]');
  const p = actual.pedido;
  if (!b || !p || b.disabled) return;
  if (b.dataset.aEstado) cambiarEstado(actual, b.dataset.aEstado);
  else if (b.dataset.plantilla === 'envio') avisarEnvio(actual);
  else if (b.hasAttribute('data-copiar')) {
    const ok = await copiar(resumenTexto(p));
    toast(ok ? 'Resumen copiado al portapapeles' : 'No se pudo copiar el resumen', { tipo: ok ? 'ok' : 'error' });
  } else if (b.hasAttribute('data-guardar-notas')) guardarNotas(actual);
  else if (b.hasAttribute('data-eliminar')) eliminarPedido(actual);
}

async function cambiarEstado(actual, nuevo) {
  const p = actual.pedido;
  if (!p || actual.ocupado || p.estado === nuevo || !ESTADOS_PEDIDO[nuevo]) return;
  const texto = ESTADOS_PEDIDO[nuevo].texto;
  const unidades = plural(unidadesDe(p), 'unidad', 'unidades');
  const descuenta = DESCUENTAN.includes(nuevo) && !p.stock_descontado;
  const devuelve = !DESCUENTAN.includes(nuevo) && p.stock_descontado;
  let ok = true;
  if (nuevo === 'cancelado') {
    ok = await confirmar({
      titulo: `¿Cancelar el pedido ${p.numero}?`, boton: 'Sí, cancelar pedido', peligro: true,
      mensaje: `${devuelve ? `Se devolverán ${unidades} al inventario. ` : ''}Podrás reactivarlo después si el cliente retoma la compra.`,
    });
  } else if (descuenta) {
    ok = await confirmar({
      titulo: `¿Marcar como ${texto.toLowerCase()}?`, boton: `Sí, marcar ${texto.toLowerCase()}`, icono: 'inventory',
      mensaje: `Se descontarán ${unidades} del inventario (sólo en productos con control de stock).`,
    });
  } else if (devuelve) {
    ok = await confirmar({
      titulo: `¿Volver a "${texto}"?`, boton: 'Sí, cambiar estado', icono: 'replay',
      mensaje: `Este pedido ya había descontado stock: se devolverán ${unidades} al inventario.`,
    });
  }
  if (ok) await aplicarEstado(actual, nuevo);
}

async function aplicarEstado(actual, nuevo) {
  const p = actual.pedido;
  const acciones = () => actual.api.cuerpo.querySelector('[data-acciones-estado]');
  actual.ocupado = true;
  acciones()?.classList.add('opacity-60', 'pointer-events-none');
  const antes = !!p.stock_descontado;
  try {
    const r = await db.rpc('mt_cambiar_estado_pedido', { p_id: p.id, p_estado: nuevo });
    const despues = r?.stock_descontado ?? antes;
    toast(`${p.numero}: ${ESTADOS_PEDIDO[nuevo].texto}${!antes && despues ? ' · stock descontado' : antes && !despues ? ' · stock devuelto' : ''}`);
    refrescarTodo({ silencioso: true });
    await recargarDetalle(actual);
  } catch (e) {
    toastError(e);
    acciones()?.classList.remove('opacity-60', 'pointer-events-none');
  } finally {
    actual.ocupado = false;
  }
}

async function avisarEnvio(actual) {
  const p = actual.pedido;
  const puedeMarcar = !['enviado', 'entregado', 'cancelado'].includes(p.estado);
  const r = await modal({
    titulo: 'Avisar envío', icono: 'local_shipping', ancho: 'sm', textoEnviar: 'Abrir WhatsApp',
    subtitulo: `Se abrirá WhatsApp con el aviso para ${esc(p.cliente_nombre)}.`,
    contenido: `<div class="flex flex-col gap-3">
      <div><label class="etiqueta" for="envGuia">Número de guía</label><input id="envGuia" name="guia" class="campo tnum" maxlength="60" autocomplete="off" placeholder="Ej: 1Z999AA10123456784"><p class="ayuda">Déjalo vacío si lo entregas tú mismo.</p></div>
      <div><label class="etiqueta" for="envEmpresa">Empresa de envío <span class="font-normal text-[#94A3B8]">(opcional)</span></label><input id="envEmpresa" name="empresa" class="campo" maxlength="60" autocomplete="off" placeholder="Ej: FedEx, UPS, DHL"></div>
      ${puedeMarcar ? `<label class="flex items-start gap-3 p-3 rounded-xl bg-surface-container-low cursor-pointer">
        <input type="checkbox" name="marcar" class="interruptor mt-0.5" ${p.estado === 'confirmado' ? 'checked' : ''}>
        <span class="font-body-sm text-body-sm text-on-surface-variant"><strong class="block font-label-lg text-label-lg text-on-surface">Marcar el pedido como Enviado</strong>${p.stock_descontado ? 'El stock ya está descontado.' : 'También se descontará el stock.'}</span></label>` : ''}
    </div>`,
    alEnviar: (form) => {
      const valor = (n) => String(form.elements.namedItem(n)?.value || '').trim();
      // Se abre aquí mismo (gesto del usuario) para que el navegador no bloquee la ventana.
      window.open(urlWhatsApp(p.cliente_telefono, textoPlantilla('envio', p, { guia: valor('guia'), empresa: valor('empresa') })), '_blank', 'noopener');
      return { marcar: !!form.elements.namedItem('marcar')?.checked };
    },
  });
  if (r?.marcar && detalle === actual) await aplicarEstado(actual, 'enviado');
}

function notasCambiadas(actual) {
  const cuerpo = actual.api.cuerpo;
  const area = cuerpo.querySelector('[data-notas]');
  const boton = cuerpo.querySelector('[data-guardar-notas]');
  const aviso = cuerpo.querySelector('[data-estado-notas]');
  if (!area || !boton || !aviso) return;
  const sucio = area.value.trim() !== actual.notasGuardadas.trim();
  boton.disabled = !sucio;
  aviso.textContent = sucio ? 'Cambios sin guardar' : 'Sólo las ve tu equipo.';
  aviso.classList.toggle('text-outline', !sucio);
  aviso.classList.toggle('text-[#B45309]', sucio);
}

async function guardarNotas(actual) {
  const cuerpo = actual.api.cuerpo;
  const area = cuerpo.querySelector('[data-notas]');
  const boton = cuerpo.querySelector('[data-guardar-notas]');
  const valor = area.value.trim();
  const antes = boton.innerHTML;
  boton.disabled = true;
  boton.innerHTML = `${spinner()} Guardando…`;
  try {
    await db.actualizar('mt_pedidos', `id=eq.${actual.pedido.id}`, { notas_internas: valor || null });
    actual.pedido.notas_internas = valor || null;
    actual.notasGuardadas = valor;
    toast('Notas internas guardadas');
  } catch (e) {
    toastError(e);
  } finally {
    if (boton.isConnected) { boton.innerHTML = antes; notasCambiadas(actual); }
  }
}

async function eliminarPedido(actual) {
  const p = actual.pedido;
  const ok = await confirmar({
    titulo: `¿Eliminar el pedido ${p.numero}?`, boton: 'Eliminar pedido', peligro: true,
    mensaje: `${p.stock_descontado ? '<strong>Este pedido descontó stock y al eliminarlo no se devuelve</strong>; si quieres reponerlo, cancélalo primero. ' : ''}Se borrará del historial y de las estadísticas del cliente. Esta acción no se puede deshacer.`,
  });
  if (!ok) return;
  try {
    const borrados = await db.borrar('mt_pedidos', `id=eq.${p.id}`);
    if (!borrados?.length) throw new Error('No se pudo eliminar: el pedido no existe o no tienes permiso.');
    toast(`Pedido ${p.numero} eliminado`);
    actual.api.cerrar();
    refrescarTodo();
  } catch (e) { toastError(e); }
}

// ---------------- Registrar pedido manual ----------------
const varianteDe = (l) => (l.producto.variantes || []).find((v) => v.nombre === l.variante) || null;
// Igual que el servidor: precio vigente + extra de la opción + garantía por defecto (la primera) si tiene costo.
const precioLinea = (l) => precioVigente(l.producto) + num(varianteDe(l)?.precio_extra) + num(l.producto.garantias?.[0]?.precio_extra);
const topeLinea = (l) => Math.max(1, Math.min(99, maximoPedido(l.producto, varianteDe(l))));

async function buscarProductos(q) {
  const t = patron(q);
  const filtroTexto = t ? `&or=(nombre.ilike.${t},sku.ilike.${t},marca.ilike.${t})` : '';
  return db.leer('mt_productos', `select=${COLUMNAS_PRODUCTO}&estado=in.(publicado,borrador)${filtroTexto}&order=${t ? 'nombre' : 'ventas.desc.nullslast,nombre'}&limit=8`);
}

function htmlResultado(p, umbral) {
  const d = disponibilidad(p, null, umbral);
  const img = p.imagenes?.[0]?.mini || p.imagenes?.[0]?.url;
  const opciones = (p.variantes || []).length;
  const stock = d.stock == null ? 'Sin control de stock' : d.codigo === 'agotado' ? 'Agotado' : d.codigo === 'preventa' ? 'Preventa' : d.codigo === 'consulta' ? 'Bajo pedido' : `${numero(d.stock)} en stock`;
  return `<button type="button" data-agregar="${esc(p.id)}" ${d.comprable ? '' : 'disabled'} class="w-full flex items-center gap-3 p-2 rounded-xl text-left hover:bg-surface-container-low transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
    <span class="w-11 h-11 rounded-lg bg-surface-container overflow-hidden shrink-0 flex items-center justify-center">${img ? `<img src="${esc(urlImagen(img))}" alt="" class="w-full h-full object-cover" loading="lazy">` : ico('inventory_2', 'text-[18px] text-outline')}</span>
    <span class="flex-1 min-w-0"><span class="block font-label-lg text-label-lg text-on-surface truncate">${esc(p.nombre)}</span>
      <span class="flex items-center gap-x-2 gap-y-0.5 flex-wrap font-body-sm text-body-sm text-on-surface-variant">${p.sku ? `<span class="tnum">${esc(p.sku)}</span>` : ''}${p.estado !== 'publicado' ? chipProducto(p.estado) : ''}
        <span class="${d.codigo === 'agotado' ? 'text-error font-semibold' : d.codigo === 'pocas' ? 'text-[#B45309] font-semibold' : ''}">${stock}</span>${opciones ? `<span>${opciones} opciones</span>` : ''}</span></span>
    <span class="font-label-lg text-label-lg text-on-surface tnum shrink-0">${dineroPanel(precioVigente(p))}</span>
    <span class="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">${ico('add', 'text-[18px]')}</span></button>`;
}

/** Aviso de stock de una línea (vacío si alcanza). Sólo aplica a productos que bloquean la venta al agotarse. */
function avisoLinea(l) {
  const p = l.producto;
  if (!p.rastrear_stock || p.al_agotarse !== 'bloquear') return '';
  const v = varianteDe(l);
  const max = maximoPedido(p, v);
  if (l.cantidad <= max) return '';
  if (max <= 0) return `${v ? 'Esta opción está agotada' : 'Producto agotado'}: el pedido no se podrá registrar.`;
  return `Sólo quedan ${max} ${max === 1 ? 'unidad' : 'unidades'}${v ? ' de esta opción' : ''}.`;
}

/** Actualiza precio, subtotal, cantidad y aviso de una línea sin volver a dibujarla (no se pierde el foco). */
function actualizarLinea(fila, l, { cantidad = true } = {}) {
  if (!fila) return;
  const unit = precioLinea(l);
  fila.querySelector('[data-unit-linea]').textContent = `${dineroPanel(unit)} c/u`;
  fila.querySelector('[data-subtotal-linea]').textContent = dineroPanel(unit * l.cantidad);
  if (cantidad) fila.querySelector('[data-campo="cantidad"]').value = String(l.cantidad);
  fila.querySelector('[data-campo="variante"]')?.classList.toggle('campo-error', !l.variante);
  const aviso = avisoLinea(l);
  const caja = fila.querySelector('[data-aviso-linea]');
  caja.classList.toggle('hidden', !aviso);
  caja.lastElementChild.textContent = aviso;
}

function htmlLinea(l, i) {
  const p = l.producto;
  const variantes = p.variantes || [];
  const unit = precioLinea(l);
  const garantia = (p.garantias || [])[0];
  const img = p.imagenes?.[0]?.mini || p.imagenes?.[0]?.url;
  const bloquea = p.rastrear_stock && p.al_agotarse === 'bloquear';
  const aviso = avisoLinea(l);
  const opciones = variantes.map((x) => {
    const sinStock = bloquea && num(x.stock) <= 0;
    const detalleStock = p.rastrear_stock ? ` · ${sinStock || num(x.stock) <= 0 ? 'agotado' : `${numero(num(x.stock))} disp.`}` : '';
    return `<option value="${esc(x.nombre)}" ${x.nombre === l.variante ? 'selected' : ''} ${sinStock && x.nombre !== l.variante ? 'disabled' : ''}>${esc(x.nombre)}${num(x.precio_extra) ? ` (+${dineroPanel(x.precio_extra)})` : ''}${detalleStock}</option>`;
  }).join('');
  return `<div data-fila-linea="${i}" class="flex gap-3 p-3 rounded-xl border border-[#E2E8F0] bg-white">
    <span class="w-12 h-12 rounded-lg bg-surface-container overflow-hidden shrink-0 flex items-center justify-center">${img ? `<img src="${esc(urlImagen(img))}" alt="" class="w-full h-full object-cover" loading="lazy">` : ico('inventory_2', 'text-[18px] text-outline')}</span>
    <div class="flex-1 min-w-0 flex flex-col gap-2">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0"><p class="font-label-lg text-label-lg text-on-surface line-clamp-2">${esc(p.nombre)}</p>
          <p class="font-body-sm text-body-sm text-on-surface-variant tnum"><span data-unit-linea>${dineroPanel(unit)} c/u</span>${garantia && num(garantia.precio_extra) > 0 ? ` · incluye ${esc(garantia.nombre)}` : ''}</p></div>
        <button type="button" data-quitar-linea="${i}" class="btn-icono w-8 h-8 -mr-1 -mt-1 shrink-0" aria-label="Quitar ${esc(p.nombre)}">${ico('delete', 'text-[18px]')}</button>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        ${variantes.length ? `<select data-linea="${i}" data-campo="variante" class="campo h-10 lg:h-10 flex-1 min-w-[150px] ${l.variante ? '' : 'campo-error'}" aria-label="Opción de ${esc(p.nombre)}">
          <option value="">Elige una opción…</option>${opciones}</select>` : ''}
        <div class="flex items-center gap-1">
          <button type="button" data-menos="${i}" class="btn-icono border border-[#E2E8F0]" aria-label="Quitar una unidad">${ico('remove', 'text-[18px]')}</button>
          <input type="number" inputmode="numeric" data-linea="${i}" data-campo="cantidad" min="1" max="99" value="${l.cantidad}" class="campo h-9 lg:h-9 w-14 px-1 text-center tnum" aria-label="Cantidad de ${esc(p.nombre)}">
          <button type="button" data-mas="${i}" class="btn-icono border border-[#E2E8F0]" aria-label="Agregar una unidad">${ico('add', 'text-[18px]')}</button>
        </div>
        <span data-subtotal-linea class="ml-auto font-label-lg text-label-lg text-on-surface tnum">${dineroPanel(unit * l.cantidad)}</span>
      </div>
      <p data-aviso-linea class="font-body-sm text-body-sm text-error flex items-center gap-1 ${aviso ? '' : 'hidden'}">${ico('warning', 'text-[16px]')}<span>${esc(aviso)}</span></p>
    </div></div>`;
}

function htmlResumenRegistro(lineas) {
  if (!lineas.length) {
    return `<div class="p-4 rounded-xl border-2 border-dashed border-[#E2E8F0] text-center font-body-sm text-body-sm text-[#64748B]">${ico('add_shopping_cart', 'block mx-auto mb-1 text-[22px] text-outline')}Busca y agrega los productos del pedido.</div>`;
  }
  const unidades = lineas.reduce((s, l) => s + l.cantidad, 0);
  const subtotal = lineas.reduce((s, l) => s + precioLinea(l) * l.cantidad, 0);
  return `<div class="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-container-low">
    <span class="font-body-sm text-body-sm text-on-surface-variant">${plural(unidades, 'unidad', 'unidades')} · subtotal estimado<span class="block text-outline">Descuentos automáticos y envío se calculan al registrar.</span></span>
    <span class="font-headline-sm text-headline-sm text-on-surface tnum shrink-0">${dineroPanel(subtotal)}</span></div>`;
}

/** Une las líneas repetidas (mismo producto y opción) para que el servidor valide el stock del total. */
function agruparLineas(lineas) {
  const mapa = new Map();
  for (const l of lineas) {
    const clave = `${l.producto.id}|${l.variante || ''}`;
    const previa = mapa.get(clave);
    if (previa) previa.cantidad = Math.min(99, previa.cantidad + l.cantidad);
    else mapa.set(clave, { producto_id: l.producto.id, variante: l.variante || null, garantia: null, cantidad: l.cantidad });
  }
  return [...mapa.values()];
}

function modalRegistro() {
  const lineas = [];
  const encontrados = new Map();
  const umbral = num(tienda().stock_bajo_umbral, 10);
  return modal({
    titulo: 'Registrar pedido', icono: 'receipt_long', ancho: 'xl', textoEnviar: 'Registrar pedido',
    subtitulo: 'Para pedidos tomados por teléfono, WhatsApp o en persona. Los precios salen del catálogo actual.',
    contenido: `<div class="grid grid-cols-1 lg:grid-cols-5 gap-5">
      <div class="lg:col-span-2 flex flex-col gap-3">
        <p class="font-label-sm text-label-sm uppercase tracking-wider text-outline">Cliente</p>
        <div><label class="etiqueta" for="rpNombre">Nombre *</label><input id="rpNombre" name="nombre" class="campo" maxlength="80" autocomplete="off" placeholder="Nombre y apellido"></div>
        <div><label class="etiqueta" for="rpTelefono">WhatsApp / teléfono</label><input id="rpTelefono" name="telefono" type="tel" inputmode="tel" class="campo tnum" maxlength="22" autocomplete="off" placeholder="Ej: 13055550118">
          <p class="ayuda" data-ayuda-tel>Con código de país. Si ya es cliente, el pedido se suma a su ficha.</p></div>
        <div><label class="etiqueta" for="rpCiudad">Ciudad</label><input id="rpCiudad" name="ciudad" class="campo" maxlength="80" autocomplete="off"></div>
        <div><label class="etiqueta" for="rpNota">Nota del pedido</label><textarea id="rpNota" name="nota" class="campo" rows="2" maxlength="300" placeholder="Dirección, horario de entrega, forma de pago…"></textarea></div>
        <div><label class="etiqueta" for="rpEstado">Estado inicial</label><select id="rpEstado" name="estado" class="campo">
          <option value="contactado">Contactado (por confirmar)</option><option value="confirmado">Confirmado (descuenta stock)</option></select></div>
      </div>
      <div class="lg:col-span-3 flex flex-col gap-3 min-w-0">
        <p class="font-label-sm text-label-sm uppercase tracking-wider text-outline">Productos</p>
        <div class="relative">${ico('search', 'absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px] pointer-events-none')}
          <input type="search" data-buscar-producto class="campo pl-9" maxlength="80" autocomplete="off" aria-label="Buscar productos" placeholder="Buscar por nombre, SKU o marca…"></div>
        <div data-resultados class="flex flex-col gap-0.5 max-h-60 overflow-y-auto -mx-1 px-1"></div>
        <div data-lineas class="flex flex-col gap-2"></div>
        <div data-resumen></div>
      </div>
    </div>`,
    alAbrir: (capa) => {
      const buscador = $('[data-buscar-producto]', capa);
      const resultados = $('[data-resultados]', capa);
      const caja = $('[data-lineas]', capa);
      const pintarResumen = () => { $('[data-resumen]', capa).innerHTML = htmlResumenRegistro(lineas); };
      const pintarLineas = () => { caja.innerHTML = lineas.map(htmlLinea).join(''); pintarResumen(); };
      let turno = 0;
      const buscar = async (q) => {
        const t = ++turno;
        resultados.innerHTML = `<div class="flex items-center gap-2 p-3 font-body-sm text-body-sm text-on-surface-variant">${spinner()} Buscando…</div>`;
        try {
          const lista = await buscarProductos(q);
          if (t !== turno) return;
          lista.forEach((p) => encontrados.set(p.id, p));
          resultados.innerHTML = lista.length
            ? `${q ? '' : '<p class="px-2 pt-1 font-label-sm text-label-sm uppercase tracking-wider text-outline">Más vendidos</p>'}${lista.map((p) => htmlResultado(p, umbral)).join('')}`
            : `<p class="p-3 font-body-sm text-body-sm text-on-surface-variant">${q ? `Sin resultados para "${esc(q)}".` : 'Todavía no hay productos publicados o en borrador.'}</p>`;
        } catch (e) {
          if (t === turno) resultados.innerHTML = `<p class="p-3 font-body-sm text-body-sm text-error">${esc(e.message)}</p>`;
        }
      };
      const agregar = (id) => {
        const p = encontrados.get(id);
        if (!p) return;
        const conOpciones = (p.variantes || []).length > 0;
        const existente = !conOpciones && lineas.find((l) => l.producto.id === id);
        if (existente) existente.cantidad = Math.min(topeLinea(existente), existente.cantidad + 1);
        else lineas.push({ producto: p, variante: '', cantidad: 1 });
        pintarLineas();
        if (conOpciones) caja.querySelector(`[data-linea="${lineas.length - 1}"][data-campo="variante"]`)?.focus();
      };

      const buscarDiferido = debounce((q) => buscar(q), 280);
      buscador.addEventListener('input', () => buscarDiferido(buscador.value.trim()));
      buscador.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault(); // no enviar el formulario: Enter agrega el primer resultado
        const primero = resultados.querySelector('[data-agregar]:not([disabled])');
        if (primero) agregar(primero.dataset.agregar);
      });
      resultados.addEventListener('click', (e) => {
        const b = e.target.closest('[data-agregar]');
        if (b && !b.disabled) agregar(b.dataset.agregar);
      });

      // Las líneas se actualizan en su lugar (sin redibujar) para no perder el foco al editar.
      caja.addEventListener('click', (e) => {
        const b = e.target.closest('[data-menos],[data-mas],[data-quitar-linea]');
        if (!b) return;
        if (b.dataset.quitarLinea != null) { lineas.splice(Number(b.dataset.quitarLinea), 1); pintarLineas(); return; }
        const l = lineas[Number(b.dataset.menos ?? b.dataset.mas)];
        if (!l) return;
        l.cantidad = b.dataset.menos != null ? Math.max(1, l.cantidad - 1) : Math.min(topeLinea(l), l.cantidad + 1);
        actualizarLinea(b.closest('[data-fila-linea]'), l);
        pintarResumen();
      });
      caja.addEventListener('change', (e) => {
        const el = e.target.closest('[data-linea]');
        const l = el && lineas[Number(el.dataset.linea)];
        if (!l) return;
        if (el.dataset.campo === 'variante') l.variante = el.value;
        if (el.dataset.campo === 'cantidad') l.cantidad = Math.max(1, Math.min(99, Math.round(num(el.value, 1)) || 1));
        actualizarLinea(el.closest('[data-fila-linea]'), l);
        pintarResumen();
      });
      caja.addEventListener('input', (e) => {
        const el = e.target.closest('[data-campo="cantidad"]');
        const l = el && lineas[Number(el.dataset.linea)];
        const n = el ? Math.round(num(el.value, 0)) : 0;
        if (!l || n < 1) return;
        l.cantidad = Math.min(99, n);
        actualizarLinea(el.closest('[data-fila-linea]'), l, { cantidad: false });
        pintarResumen();
      });
      caja.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.matches('[data-campo="cantidad"]')) { e.preventDefault(); e.target.blur(); }
      });

      // Si el teléfono ya es de un cliente, se completa su nombre y ciudad.
      const tel = $('[name="telefono"]', capa);
      const ayudaTel = $('[data-ayuda-tel]', capa);
      const ayudaInicial = ayudaTel.textContent;
      const buscarCliente = debounce(async () => {
        const dig = soloDigitos(tel.value);
        if (dig.length < 7 || dig.length > 15) { ayudaTel.textContent = ayudaInicial; return; }
        try {
          const [c] = await db.leer('mt_clientes', `select=id,nombre,ciudad&telefono=eq.${dig}&limit=1`);
          if (soloDigitos(tel.value) !== dig) return;
          if (!c) { ayudaTel.textContent = 'Cliente nuevo: se creará su ficha en Clientes CRM.'; return; }
          ayudaTel.innerHTML = `<span class="text-primary font-semibold">Cliente registrado: ${esc(c.nombre)}${c.ciudad ? ` · ${esc(c.ciudad)}` : ''}</span>`;
          const nombre = $('[name="nombre"]', capa);
          const ciudad = $('[name="ciudad"]', capa);
          if (!nombre.value.trim()) nombre.value = c.nombre;
          if (!ciudad.value.trim() && c.ciudad) ciudad.value = c.ciudad;
        } catch { /* la sugerencia es opcional */ }
      }, 400);
      tel.addEventListener('input', buscarCliente);

      buscar('');
      pintarLineas();
    },
    alEnviar: async (form) => {
      const campo = (n) => String(form.elements.namedItem(n)?.value ?? '').trim();
      const nombre = campo('nombre').replace(/\s+/g, ' ');
      const telCrudo = campo('telefono');
      const telefono = soloDigitos(telCrudo);
      if (nombre.length < 2) throw new Error('Escribe el nombre del cliente (mínimo 2 caracteres).');
      if (telCrudo && (telefono.length < 7 || telefono.length > 15)) throw new Error('El teléfono debe tener de 7 a 15 dígitos, con código de país.');
      if (!lineas.length) throw new Error('Agrega al menos un producto al pedido.');
      const sinOpcion = lineas.find((l) => (l.producto.variantes || []).length && !l.variante);
      if (sinOpcion) throw new Error(`Elige la opción (talla, color…) de "${sinOpcion.producto.nombre}".`);
      const items = agruparLineas(lineas);
      if (items.length > 50) throw new Error('Un pedido puede tener como máximo 50 productos distintos.');
      const res = await db.rpc('mt_crear_pedido', {
        p: { items, cliente: { nombre, telefono, ciudad: campo('ciudad'), nota: campo('nota') }, canal: 'manual', estado: 'contactado' },
      });
      avisados.add(res.numero); // es nuestro: que la revisión automática no lo anuncie como nuevo
      let confirmado = false;
      if (campo('estado') === 'confirmado') {
        // Se crea como "contactado" y luego se confirma, así el servidor descuenta el stock.
        try {
          await db.rpc('mt_cambiar_estado_pedido', { p_id: res.id, p_estado: 'confirmado' });
          confirmado = true;
        } catch (e) {
          toastError(new Error(`El pedido ${res.numero} se registró, pero no se pudo confirmar: ${e.message}`));
        }
      }
      return { ...res, confirmado };
    },
  });
}

async function abrirRegistro() {
  if (registroAbierto) return;
  registroAbierto = true;
  try {
    const creado = await modalRegistro();
    if (!creado || creado === true) return;
    toast(`Pedido ${creado.numero} registrado${creado.confirmado ? ' y confirmado' : ''}`);
    refrescarTodo({ silencioso: true });
    abrirDetalle({ id: creado.id });
  } finally {
    registroAbierto = false;
  }
}

// ---------------- Exportar ----------------
const COLUMNAS_CSV = [
  { clave: 'numero', titulo: 'Pedido' },
  { titulo: 'Fecha', valor: (p) => new Date(p.creado_en).toLocaleString('es') },
  { titulo: 'Estado', valor: (p) => ESTADOS_PEDIDO[p.estado]?.texto || p.estado },
  { titulo: 'Canal', valor: (p) => CANALES[p.canal]?.texto || p.canal },
  { titulo: 'Cliente', valor: (p) => celdaSegura(p.cliente_nombre) },
  { titulo: 'Teléfono', valor: (p) => telefonoCsv(p.cliente_telefono) },
  { titulo: 'Ciudad', valor: (p) => celdaSegura(p.cliente_ciudad || '') },
  { titulo: 'Productos', valor: (p) => celdaSegura(itemsDe(p).map(lineaItem).join('; ')) },
  { clave: 'unidades', titulo: 'Unidades' },
  { clave: 'subtotal', titulo: 'Subtotal' },
  { clave: 'descuento', titulo: 'Descuento' },
  { titulo: 'Promoción', valor: (p) => celdaSegura([p.descuento_nombre, p.codigo_promo].filter(Boolean).join(' · ')) },
  { titulo: 'Envío', valor: (p) => (p.envio == null ? 'A coordinar' : p.envio) },
  { clave: 'total', titulo: 'Total' },
  { clave: 'moneda', titulo: 'Moneda' },
  { titulo: 'Stock descontado', valor: (p) => (p.stock_descontado ? 'Sí' : 'No') },
  { titulo: 'Nota del cliente', valor: (p) => celdaSegura(p.nota || '') },
  { titulo: 'Notas internas', valor: (p) => celdaSegura(p.notas_internas || '') },
  { titulo: 'Ejemplo', valor: (p) => (p.ejemplo ? 'Sí' : 'No') },
];

async function exportar(boton) {
  const antes = boton.innerHTML;
  boton.disabled = true;
  boton.innerHTML = `${spinner()}<span>Exportando…</span>`;
  try {
    const consulta = ['select=*', filtrosBase(), filtroEstado(), 'order=creado_en.desc,id.desc'].filter(Boolean).join('&');
    const filas = await leerTodo('mt_pedidos', consulta);
    if (!filas.length) { toast('No hay pedidos para exportar con estos filtros', { tipo: 'info' }); return; }
    descargar(`pedidos-${filtro.estado}-${new Date().toISOString().slice(0, 10)}.csv`, aCsv(filas, COLUMNAS_CSV), 'text/csv;charset=utf-8');
    toast(plural(filas.length, 'pedido exportado', 'pedidos exportados'));
  } catch (e) {
    toastError(e);
  } finally {
    boton.disabled = false;
    boton.innerHTML = antes;
  }
}

// ---------------- Pedidos nuevos y actualización automática ----------------
async function revisarNuevos() {
  const desde = marcaNuevos ? `&creado_en=gt.${encodeURIComponent(marcaNuevos)}` : '';
  const filas = await db.leer('mt_pedidos', `select=numero,cliente_nombre,creado_en&order=creado_en.desc&limit=10${desde}`);
  if (marcaNuevos === null) { marcaNuevos = filas[0]?.creado_en || new Date(0).toISOString(); return; }
  if (!filas.length) return;
  marcaNuevos = filas[0].creado_en;
  const nuevos = filas.filter((f) => !avisados.has(f.numero));
  nuevos.forEach((f) => avisados.add(f.numero));
  if (nuevos.length > 3) toast(`Llegaron ${nuevos.length} pedidos nuevos`, { tipo: 'info', duracion: 7000 });
  else nuevos.reverse().forEach((f) => toast(`Nuevo pedido ${f.numero} · ${f.cliente_nombre}`, { tipo: 'info', duracion: 7000 }));
}

async function ciclo() {
  if (document.hidden || enCiclo) return;
  enCiclo = true;
  try {
    await revisarNuevos().catch(() => { /* se reintenta en el próximo ciclo */ });
    await refrescarTodo({ silencioso: true });
  } finally {
    enCiclo = false;
  }
}

// ---------------- Enlaces por hash (#nuevo, #WA-1024, #<id>) ----------------
function manejarHash() {
  let h = '';
  try { h = decodeURIComponent(location.hash.slice(1)).trim(); } catch { return; }
  if (!h) return;
  if (h.toLowerCase() === 'nuevo') { ponerHash(''); abrirRegistro(); return; }
  const n = h.match(/^wa-?(\d+)$/i);
  if (n) { const clave = `WA-${n[1]}`; if (detalle?.pedido?.numero !== clave) abrirDetalle({ numero: clave }); return; }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(h) && detalle?.pedido?.id !== h) abrirDetalle({ id: h });
}

// ---------------- Eventos ----------------
pintarBase();

contenido.addEventListener('click', (e) => {
  const t = e.target;
  const chip = t.closest('[data-filtro-estado]');
  if (chip) { if (chip.dataset.filtroEstado !== filtro.estado) cambiarFiltro({ estado: chip.dataset.filtroEstado }); return; }
  const ir = t.closest('[data-ir-estado]');
  if (ir) { cambiarFiltro({ estado: ir.dataset.irEstado }); $('#lista').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const pag = t.closest('[data-pagina]');
  if (pag) {
    if (!pag.disabled) { filtro.pagina = Number(pag.dataset.pagina); guardarUrl(); cargarLista(); $('#lista').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    return;
  }
  if (t.closest('#registrar,[data-registrar]')) { abrirRegistro(); return; }
  const exp = t.closest('#exportar');
  if (exp) { exportar(exp); return; }
  if (t.closest('[data-limpiar]')) { limpiarFiltros(); return; }
  if (t.closest('[data-reintentar]')) { refrescarTodo(); return; }
  if (t.closest('a')) return; // los enlaces (WhatsApp) siguen su curso
  const fila = t.closest('[data-abrir]');
  if (fila) abrirDetalle({ numero: fila.dataset.abrir });
});

const buscarDiferido = debounce((q) => { if (q !== filtro.q) cambiarFiltro({ q }); }, 350);
$('#buscar').addEventListener('input', (e) => buscarDiferido(e.target.value.trim().slice(0, 80)));
$('#periodo').addEventListener('change', (e) => cambiarFiltro({ periodo: e.target.value }));
window.addEventListener('hashchange', manejarHash);

manejarHash();
revisarNuevos().catch(() => { /* la marca se toma en el próximo ciclo */ });
await refrescarTodo();
setInterval(ciclo, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - ultimaCarga > 60000) ciclo(); });
