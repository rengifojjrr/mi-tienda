// Dashboard principal (diseño "Panel de Control Comercial" de Stitch) con datos reales de mt_resumen_dashboard.
import { $, esc, ico, numero, hace, iniciales, urlWhatsApp, plantilla, aCsv, descargar, telefonoBonito } from '../util.js';
import { db, urlImagen } from '../api.js';
import { iniciarPanel, dineroPanel, tienda, puede } from './base.js';
import { modal, toast, toastError, chipPedido } from './ui.js';

await iniciarPanel({ seccion: 'dashboard', migas: [{ texto: 'Gestión General' }] });
const contenido = $('#contenido');
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const RANGOS = [['hoy', 'Hoy'], ['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['custom', 'Personalizado']];
let rango = (() => { try { return localStorage.getItem('mt_dash_rango') || '7'; } catch { return '7'; } })();
let personalizado = null;
let datos = null;

function periodo() {
  const hasta = new Date();
  const desde = new Date();
  if (rango === 'hoy') desde.setHours(0, 0, 0, 0);
  else if (rango === 'custom' && personalizado) return personalizado;
  else desde.setDate(desde.getDate() - Number(rango === 'custom' ? 30 : rango));
  return { desde, hasta };
}

const variacion = (actual, anterior, sufijo = '%') => {
  if (!anterior) return '';
  const v = sufijo === 'pp' ? actual - anterior : ((actual - anterior) / anterior) * 100;
  const sube = v >= 0;
  return `<span class="font-label-sm text-label-sm ${sube ? 'text-secondary' : 'text-error'} font-bold flex items-center">${ico(sube ? 'arrow_upward' : 'arrow_downward', 'text-[14px]')}${sube ? '+' : ''}${v.toFixed(1)}${sufijo === 'pp' ? '%' : '%'}</span>`;
};

function kpis(d) {
  const c = d.catalogo; const q = d.consultas; const co = d.cotizacion; const cv = d.conversion;
  const [entero, decimales] = dineroPanel(co.monto).split(/(?=[.,]\d{2}$)/);
  const tarjeta = (titulo, icono, colorIcono, cuerpo, pie) => `<div class="bg-surface-container-lowest rounded-xl p-space-md shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between">
      <div class="flex items-start justify-between gap-2"><span class="font-label-sm text-label-sm uppercase tracking-wider text-outline">${titulo}</span>
        <div class="w-8 h-8 rounded-lg ${colorIcono} flex items-center justify-center shrink-0">${ico(icono, 'text-[18px]')}</div></div>
      <div class="my-space-sm">${cuerpo}</div>${pie}</div>`;
  return `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-space-md">
    ${tarjeta('Catálogo Activo', 'inventory_2', 'bg-surface-container text-primary',
      `<div class="flex items-baseline gap-space-xs flex-wrap"><span class="font-headline-lg text-headline-lg text-on-surface tnum">${numero(c.publicados)}</span>
        ${c.nuevos ? `<span class="font-label-sm text-label-sm text-secondary font-bold flex items-center">${ico('arrow_upward', 'text-[14px]')}+${c.nuevos} en el periodo</span>` : ''}</div>
       <p class="font-body-sm text-body-sm text-on-surface-variant mt-1">${c.en_stock} en stock • ${c.agotados} agotados • ${c.variantes} variantes</p>`,
      `<div class="w-full bg-surface-container-low rounded-full h-1.5 overflow-hidden" title="Productos publicados con stock"><div class="bg-primary h-full rounded-full" style="width:${c.publicados ? Math.round((c.en_stock / c.publicados) * 100) : 0}%"></div></div>`)}
    ${tarjeta('Consultas WhatsApp', 'chat', 'bg-secondary-container text-on-secondary-container',
      `<div class="flex items-baseline gap-space-xs flex-wrap"><span class="font-headline-lg text-headline-lg text-on-surface tnum">${numero(q.total)}</span>${variacion(q.total, q.anterior)}</div>
       <p class="font-body-sm text-body-sm text-on-surface-variant mt-1">${numero(q.producto)} producto directo • ${numero(q.carrito)} carrito completo</p>`,
      `<span class="font-label-sm text-label-sm text-outline">${q.anterior ? `Vs. ${numero(q.anterior)} en el periodo anterior` : 'Sin datos del periodo anterior'}</span>`)}
    ${tarjeta('Pedidos en Cotización', 'request_quote', 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
      `<div class="flex items-baseline gap-space-xs"><span class="font-headline-lg text-headline-lg text-on-surface tnum">${esc(entero)}<span class="text-body-sm text-outline">${esc(decimales || '')}</span></span></div>
       <p class="font-body-sm text-body-sm text-on-surface-variant mt-1 line-clamp-2">Monto estimado en solicitudes iniciadas, pendiente de pago/cierre WhatsApp</p>`,
      `<a href="pedidos.html?estado=abiertos" class="font-label-sm text-label-sm text-tertiary font-semibold flex items-center gap-1 hover:underline">${ico('timer', 'text-[14px]')} ${co.activos} ${co.activos === 1 ? 'chat' : 'chats'} en proceso activo</a>`)}
    ${tarjeta('Conversión a Chat', 'trending_up', 'bg-surface-container-high text-primary',
      `<div class="flex items-baseline gap-space-xs flex-wrap"><span class="font-headline-lg text-headline-lg text-on-surface tnum">${String(cv.tasa).replace('.', ',')}%</span>${variacion(cv.tasa, cv.tasa_anterior, 'pp')}</div>
       <p class="font-body-sm text-body-sm text-on-surface-variant mt-1">Visitantes que iniciaron contacto comercial</p>`,
      `<div class="flex items-center gap-1 font-label-sm text-label-sm text-outline"><span class="w-2 h-2 rounded-full bg-secondary"></span> ${numero(cv.visitantes)} visitas únicas totales</div>`)}
    ${tarjeta('Inventario Crítico', 'warning', 'bg-error-container text-on-error-container',
      `<div class="flex items-baseline gap-space-xs flex-wrap"><span class="font-headline-lg text-headline-lg ${d.critico ? 'text-error' : 'text-on-surface'} tnum">${d.critico}</span>
        ${d.critico ? '<span class="px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-label-sm text-label-sm font-bold">Acción urgente</span>' : '<span class="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-label-sm font-bold">Todo en orden</span>'}</div>
       <p class="font-body-sm text-body-sm text-on-surface-variant mt-1">Productos por debajo del stock mínimo recomendado</p>`,
      `<a class="font-label-sm text-label-sm ${d.critico ? 'text-error' : 'text-primary'} hover:underline flex items-center gap-1 font-semibold" href="inventario.html?filtro=bajo"><span>Ver artículos en riesgo</span>${ico('arrow_forward', 'text-[14px]')}</a>`)}
  </div>`;
}

function textoPico(d) {
  const h = d.horas || [];
  const total = h.reduce((s, x) => s + x, 0);
  if (!total) return 'Aún no hay suficientes conversaciones para detectar los horarios pico.';
  let mejor = 0; let inicio = 0;
  for (let i = 0; i < 24; i++) {
    const suma = [0, 1, 2, 3].reduce((s, k) => s + (h[(i + k) % 24] || 0), 0);
    if (suma > mejor) { mejor = suma; inicio = i; }
  }
  return `El ${Math.round((mejor / total) * 100)}% de las conversaciones se inician entre las ${String(inicio).padStart(2, '0')}:00 y ${String((inicio + 4) % 24).padStart(2, '0')}:00 hs.`;
}

function grafico(d) {
  const serie = d.serie || [];
  const etiquetas = d.serie_tipo === 'dia'
    ? serie.map((s) => { const f = new Date(`${s.fecha}T12:00:00`); return `${DIAS[(f.getDay() + 6) % 7]} ${f.getDate()}`; })
    : serie.map((s) => DIAS[s.dia - 1]);
  const totales = serie.map((s) => s.producto + s.carrito);
  const max = Math.max(1, ...totales);
  const pico = d.serie_tipo === 'semana' && totales.some(Boolean)
    ? [...serie.keys()].sort((a, b) => totales[b] - totales[a]).slice(0, 2).sort((a, b) => a - b).map((i) => DIAS_LARGOS[i]).map((x) => x[0].toUpperCase() + x.slice(1)).join(' y ') + ' pico'
    : '';
  const picoIdx = totales.indexOf(Math.max(...totales));
  return `<div class="lg:col-span-8 bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm mb-space-md">
      <div><div class="flex items-center gap-space-xs flex-wrap"><h2 class="font-headline-sm text-headline-sm text-on-surface">Flujo ${d.serie_tipo === 'dia' ? 'Diario' : 'Semanal'} de Consultas y Pedidos WhatsApp</h2>
        ${pico ? `<span class="px-2.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-bold">${esc(pico)}</span>` : ''}</div>
        <p class="font-body-sm text-body-sm text-on-surface-variant">Desglose comparativo entre consultas directas y pedidos multilínea${d.serie_tipo === 'semana' ? ' (por día de la semana)' : ''}</p></div>
      <div class="flex items-center gap-space-md font-label-sm text-label-sm shrink-0">
        <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-primary"></span><span class="text-on-surface-variant">Producto Específico</span></div>
        <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-secondary-fixed-dim"></span><span class="text-on-surface-variant">Lista Carrito Completa</span></div>
      </div>
    </div>
    <div class="w-full h-64 relative flex items-end pt-6 pb-2" role="img" aria-label="Gráfico de consultas por día">
      <div class="absolute inset-0 bottom-8 flex flex-col justify-between pointer-events-none opacity-20">${'<div class="border-b border-outline-variant w-full"></div>'.repeat(4)}</div>
      <div class="w-full h-full flex items-end justify-between gap-1 sm:gap-2 z-10">
        ${serie.map((s, i) => `<div class="flex-1 flex flex-col items-center gap-1 group h-full justify-end relative">
          <div class="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full hidden group-hover:block whitespace-nowrap bg-inverse-surface text-inverse-on-surface font-label-sm text-label-sm px-2 py-1 rounded-lg shadow z-20 tnum">${s.producto} producto · ${s.carrito} carrito</div>
          <div class="w-full max-w-[36px] flex flex-col items-center gap-1 h-[calc(100%-22px)] justify-end">
            <div class="w-full bg-secondary-fixed-dim rounded-t group-hover:brightness-95 transition-all" style="height:${(s.carrito / max) * 100}%"></div>
            <div class="w-full bg-primary rounded-t group-hover:brightness-110 transition-all" style="height:${(s.producto / max) * 100}%"></div>
          </div>
          <span class="font-label-sm text-label-sm ${i === picoIdx && totales[i] ? 'text-primary font-bold' : 'text-outline'} mt-1 whitespace-nowrap">${esc(etiquetas[i])}</span></div>`).join('')}
      </div>
    </div>
    <div class="mt-space-sm p-space-sm rounded-xl bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs">
      <div class="flex items-center gap-2 text-on-surface-variant font-body-sm text-body-sm">${ico('insights', 'text-[18px] text-primary')}<span>${esc(textoPico(d))}</span></div>
      ${puede('config') ? '<a href="configuracion.html#mensajes" class="font-label-md text-label-md text-primary font-semibold hover:underline whitespace-nowrap">Configurar Respuestas Rápidas →</a>' : ''}
    </div></div>`;
}

function dona(d) {
  const colores = [['#006948', 'bg-primary'], ['#2170e4', 'bg-tertiary-container'], ['#3de273', 'bg-secondary-fixed-dim'], ['#6d7a72', 'bg-outline']];
  const cats = d.categorias || [];
  const top = cats.slice(0, 3);
  const otros = cats.slice(3).reduce((s, c) => s + Number(c.total), 0);
  const filas = [...top.map((c) => ({ nombre: c.nombre, total: Number(c.total) })), ...(otros ? [{ nombre: 'Otras categorías', total: otros }] : [])];
  const total = filas.reduce((s, f) => s + f.total, 0);
  let acumulado = 0;
  return `<div class="lg:col-span-4 bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between">
    <div><h2 class="font-headline-sm text-headline-sm text-on-surface">Distribución por Categoría</h2><p class="font-body-sm text-body-sm text-on-surface-variant">Interés de compra reflejado en chats</p></div>
    <div class="my-space-md flex flex-col items-center justify-center relative">
      <div class="relative w-44 h-44 flex items-center justify-center">
        <svg class="w-full h-full -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
          <circle cx="18" cy="18" fill="none" r="15.9155" stroke="#f2f3ff" stroke-width="4"></circle>
          ${filas.map((f, i) => { const pct = total ? (f.total / total) * 100 : 0; const el = `<circle cx="18" cy="18" fill="none" r="15.9155" stroke="${colores[i][0]}" stroke-dasharray="${pct} ${100 - pct}" stroke-dashoffset="${-acumulado}" stroke-width="4"></circle>`; acumulado += pct; return el; }).join('')}
        </svg>
        <div class="absolute flex flex-col items-center justify-center text-center"><span class="font-headline-md text-headline-md text-on-surface font-extrabold leading-none tnum">${numero(total)}</span><span class="font-label-sm text-label-sm text-outline mt-0.5">Leads totales</span></div>
      </div>
    </div>
    <div class="space-y-2">${filas.length ? filas.map((f, i) => `<div class="flex items-center justify-between font-body-sm text-body-sm gap-2">
        <div class="flex items-center gap-2 min-w-0"><span class="w-3 h-3 rounded-full ${colores[i][1]} shrink-0"></span><span class="text-on-surface font-medium truncate">${esc(f.nombre)}</span></div>
        <span class="font-label-md text-label-md text-on-surface font-bold tnum">${total ? Math.round((f.total / total) * 100) : 0}% <span class="text-outline font-normal">(${numero(f.total)})</span></span></div>`).join('')
      : '<p class="font-body-sm text-body-sm text-outline text-center">Sin consultas en este periodo.</p>'}</div></div>`;
}

function mensajeCliente(o) {
  return plantilla('Hola {nombre}, te escribimos de {tienda} sobre tu pedido {numero}. ¿Te ayudamos a confirmarlo?', { nombre: (o.cliente || '').split(' ')[0], tienda: tienda().nombre, numero: o.numero });
}

function ultimas(d, totalAbiertos) {
  const colores = ['bg-secondary-fixed text-on-secondary-fixed', 'bg-tertiary-fixed text-on-tertiary-fixed', 'bg-primary-fixed text-on-primary-fixed'];
  return `<div class="lg:col-span-6 bg-surface-container-lowest rounded-xl p-space-md shadow-sm space-y-space-md">
    <div class="flex items-center justify-between pb-space-xs gap-2">
      <div><div class="flex items-center gap-space-xs"><h2 class="font-headline-sm text-headline-sm text-on-surface">Últimas Consultas Entrantes</h2><span class="w-2 h-2 rounded-full bg-secondary animate-ping"></span></div>
        <p class="font-body-sm text-body-sm text-on-surface-variant">Prioriza la atención para acelerar el cierre comercial</p></div>
      ${puede('ventas') ? `<a class="font-label-md text-label-md text-primary font-bold hover:underline whitespace-nowrap" href="pedidos.html">Ver todas (${totalAbiertos})</a>` : ''}
    </div>
    <div class="space-y-space-sm">${(d.ultimas || []).length ? d.ultimas.map((o, i) => `<div class="p-space-sm rounded-xl bg-surface-container-low hover:bg-surface-container transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
        <div class="flex items-start gap-space-sm min-w-0">
          <div class="w-10 h-10 rounded-full ${colores[i % 3]} flex items-center justify-center font-bold font-label-lg shrink-0">${esc(iniciales(o.cliente))}</div>
          <div class="space-y-0.5 min-w-0"><div class="flex items-center gap-space-xs flex-wrap"><span class="font-label-lg text-label-lg text-on-surface font-bold">${esc(o.cliente)}</span>
            ${o.telefono ? `<span class="text-[12px] px-1.5 py-0.5 rounded bg-surface-container-highest text-on-surface-variant font-label-sm font-semibold tnum">${esc(telefonoBonito(o.telefono))}</span>` : ''}
            <span class="text-[12px] text-outline font-label-sm tnum">${esc(o.numero)}</span></div>
            <p class="font-body-sm text-body-sm text-on-surface-variant line-clamp-2">${esc(o.resumen || '')}</p>
            <div class="flex items-center gap-space-sm pt-1 flex-wrap"><span class="font-label-md text-label-md font-bold text-on-surface tnum">Cotización: ${dineroPanel(o.total)}</span>${chipPedido(o.estado)}<span class="text-outline font-body-sm text-[11px]">${esc(hace(o.creado_en))}</span></div>
          </div></div>
        <div class="flex sm:flex-col items-end justify-between gap-1 shrink-0">
          ${o.telefono ? `<a href="${esc(urlWhatsApp(o.telefono, mensajeCliente(o)))}" target="_blank" rel="noopener" class="px-3 py-1.5 rounded-lg bg-wa text-white hover:bg-wa-hover font-label-sm text-label-sm font-bold flex items-center gap-1.5 shadow-sm transition-transform active:scale-95">${ico('chat', 'text-[16px]', true)}<span>${o.estado === 'nuevo' ? 'Abrir WhatsApp' : 'Continuar Chat'}</span></a>`
            : `<a href="pedidos.html#${esc(o.numero)}" class="px-3 py-1.5 rounded-lg bg-white border border-[#E2E8F0] text-[#334155] font-label-sm text-label-sm font-bold flex items-center gap-1.5">${ico('receipt_long', 'text-[16px]')}<span>Ver pedido</span></a>`}
          <a href="pedidos.html#${esc(o.numero)}" class="p-1 text-outline hover:text-on-surface transition-colors" aria-label="Gestionar pedido ${esc(o.numero)}">${ico('more_horiz', 'text-[18px]')}</a>
        </div></div>`).join('') : '<p class="py-8 text-center font-body-sm text-body-sm text-outline">Todavía no hay pedidos. Comparte el enlace de tu tienda para empezar.</p>'}</div></div>`;
}

function top(d) {
  return `<div class="lg:col-span-3 bg-surface-container-lowest rounded-xl p-space-md shadow-sm space-y-space-md">
    <div class="flex items-center justify-between"><div><h2 class="font-headline-sm text-headline-sm text-on-surface">Top Consultados</h2><p class="font-body-sm text-body-sm text-on-surface-variant">Clics a WhatsApp en el periodo</p></div>${ico('local_fire_department', 'text-[22px] text-tertiary')}</div>
    <div class="space-y-space-sm">${(d.top || []).length ? d.top.map((p, i) => `<a href="producto.html?id=${p.id}" class="flex items-center gap-space-sm p-1.5 rounded-xl hover:bg-surface-container-low">
        <div class="w-14 h-14 rounded-xl bg-surface-container overflow-hidden shrink-0">${p.imagen ? `<img src="${esc(urlImagen(p.imagen))}" alt="" class="w-full h-full object-cover" loading="lazy">` : `<div class="w-full h-full flex items-center justify-center">${ico('bolt', 'text-primary')}</div>`}</div>
        <div class="flex-1 min-w-0"><p class="font-label-lg text-label-lg text-on-surface truncate">${esc(p.nombre)}</p>
          <p class="font-body-sm text-body-sm text-on-surface-variant truncate">SKU: ${esc(p.sku)} • ${dineroPanel(p.precio)}</p>
          <div class="flex items-center gap-1.5 mt-1"><span class="px-1.5 py-0.5 rounded bg-surface-container-high text-primary font-label-sm text-label-sm font-bold tnum">${p.clics} clics WA</span>
            <span class="font-label-sm text-label-sm ${p.rastrear && p.stock <= 2 ? 'text-error' : 'text-on-surface-variant'} tnum">${p.rastrear ? `${p.stock} en stock` : 'Sin control'}</span></div></div>
        <span class="font-headline-sm text-headline-sm text-outline-variant">#${i + 1}</span></a>`).join('') : '<p class="py-6 text-center font-body-sm text-body-sm text-outline">Sin consultas todavía.</p>'}</div></div>`;
}

const ICONOS_ACCION = { alerta: ['warning', 'bg-error-container text-error'], update: ['edit', 'bg-tertiary-fixed text-tertiary'], insert: ['new_releases', 'bg-secondary-fixed text-secondary'], delete: ['delete', 'bg-error-container text-error'], stock: ['inventory', 'bg-primary-fixed text-primary'], estado: ['sync', 'bg-tertiary-fixed text-tertiary'] };
function actividad(d) {
  const alertas = (d.alertas || []).slice(0, 2).map((a) => ({ accion: 'alerta', autor: 'Sistema', detalle: `Stock crítico: "${a.nombre}" tiene ${a.stock} ${a.stock === 1 ? 'unidad' : 'unidades'} (mínimo ${a.minimo})`, creado_en: null }));
  const eventos = [...alertas, ...(d.actividad || [])].slice(0, 5);
  return `<div class="lg:col-span-3 bg-surface-container-lowest rounded-xl p-space-md shadow-sm space-y-space-md">
    <div class="flex items-center justify-between"><div><h2 class="font-headline-sm text-headline-sm text-on-surface">Actividad & Alertas</h2><p class="font-body-sm text-body-sm text-on-surface-variant">Eventos del sistema en vivo</p></div>${ico('notifications_active', 'text-[22px] text-outline')}</div>
    <ol class="relative border-l border-surface-container-high ml-3 space-y-space-md">
      ${eventos.length ? eventos.map((e) => { const [icono, color] = ICONOS_ACCION[e.accion] || ['history', 'bg-surface-container text-on-surface-variant']; return `<li class="ml-5">
        <span class="absolute -left-3.5 w-7 h-7 rounded-full ${color} flex items-center justify-center ring-4 ring-white">${ico(icono, 'text-[15px]')}</span>
        <p class="font-label-lg text-label-lg text-on-surface">${esc(e.autor)}</p><p class="font-body-sm text-body-sm text-on-surface-variant">${esc(e.detalle || '')}</p>
        <p class="font-label-sm text-label-sm text-outline mt-0.5">${e.creado_en ? esc(hace(e.creado_en)) : 'Ahora'}</p></li>`; }).join('') : '<li class="ml-5 font-body-sm text-body-sm text-outline">Sin actividad reciente.</li>'}
    </ol>
    <a href="actividad.html" class="w-full py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md flex items-center justify-center text-center">Ver registro completo de auditoría</a></div>`;
}

function pintarEsqueleto() {
  contenido.querySelector('#cuerpoDash')?.classList.add('opacity-60');
}

async function cargar() {
  pintarEsqueleto();
  const { desde, hasta } = periodo();
  try {
    const [d, abiertos] = await Promise.all([
      db.rpc('mt_resumen_dashboard', { p_desde: desde.toISOString(), p_hasta: hasta.toISOString() }),
      puede('ventas') ? db.contar('mt_pedidos', 'estado=in.(nuevo,contactado,negociacion)') : 0,
    ]);
    datos = d;
    pintar(d, abiertos);
  } catch (e) { toastError(e); }
}

function pintar(d, abiertos) {
  contenido.innerHTML = `
    <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-space-md">
      <div><div class="flex items-center gap-space-xs mb-1"><span class="inline-flex w-2.5 h-2.5 rounded-full ${tienda().abierta === false ? 'bg-[#F59E0B]' : 'bg-secondary-fixed animate-pulse'}"></span>
        <span class="font-label-sm text-label-sm uppercase tracking-wider ${tienda().abierta === false ? 'text-[#B45309]' : 'text-secondary'} font-bold">${tienda().abierta === false ? 'Tienda cerrada • Pedidos en espera' : 'Canal Comercial Activo • Sincronizado'}</span></div>
        <h1 class="font-headline-lg-mobile text-headline-lg-mobile lg:font-headline-lg lg:text-headline-lg text-on-surface tracking-tight">Panel de Control Comercial</h1>
        <p class="font-body-md text-body-md text-on-surface-variant">Resumen general de tráfico, catálogo y conversiones vía WhatsApp</p></div>
      <div class="flex flex-wrap items-center gap-space-sm">
        <div class="flex items-center bg-surface-container-low p-1 rounded-xl shadow-sm overflow-x-auto no-scrollbar" role="tablist" aria-label="Periodo">
          ${RANGOS.map(([id, t]) => `<button type="button" data-rango="${id}" role="tab" aria-selected="${rango === id}" class="px-3 sm:px-space-md py-1.5 rounded-lg font-label-md text-label-md whitespace-nowrap transition-all flex items-center gap-1 ${rango === id ? 'bg-surface-container-lowest text-primary font-bold shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}">
            <span>${id === 'custom' && personalizado && rango === 'custom' ? `${personalizado.desde.toLocaleDateString('es')} – ${personalizado.hasta.toLocaleDateString('es')}` : t}</span>${id === 'custom' ? ico('tune', 'text-[16px]') : ''}</button>`).join('')}
        </div>
        <div class="flex items-center gap-space-xs">
          <button type="button" id="exportar" class="flex items-center gap-space-xs px-3.5 py-2 rounded-xl bg-surface-container-lowest hover:bg-surface-container-low text-on-surface font-label-md text-label-md shadow-sm transition-all">${ico('download', 'text-[18px] text-on-surface-variant')}<span>Exportar CSV</span></button>
          <button type="button" id="actualizar" class="flex items-center gap-space-xs px-3.5 py-2 rounded-xl bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md shadow-sm transition-all">${ico('sync', 'text-[18px]')}<span>Actualizar</span></button>
        </div>
      </div>
    </div>
    <div id="cuerpoDash" class="space-y-space-lg transition-opacity">
      ${kpis(d)}
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-space-md">${grafico(d)}${dona(d)}</div>
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-space-md items-start">${ultimas(d, abiertos)}${top(d)}${actividad(d)}</div>
    </div>`;
}

function exportar() {
  if (!datos) return;
  const { desde, hasta } = periodo();
  const filas = [
    { seccion: 'Periodo', dato: 'Desde', valor: desde.toLocaleString('es') }, { seccion: 'Periodo', dato: 'Hasta', valor: hasta.toLocaleString('es') },
    { seccion: 'Catálogo', dato: 'Publicados', valor: datos.catalogo.publicados }, { seccion: 'Catálogo', dato: 'En stock', valor: datos.catalogo.en_stock },
    { seccion: 'Catálogo', dato: 'Agotados', valor: datos.catalogo.agotados }, { seccion: 'Consultas WhatsApp', dato: 'Total', valor: datos.consultas.total },
    { seccion: 'Consultas WhatsApp', dato: 'Producto directo', valor: datos.consultas.producto }, { seccion: 'Consultas WhatsApp', dato: 'Carrito completo', valor: datos.consultas.carrito },
    { seccion: 'Cotización', dato: 'Monto en proceso', valor: datos.cotizacion.monto }, { seccion: 'Cotización', dato: 'Vendido (confirmado)', valor: datos.cotizacion.vendido },
    { seccion: 'Conversión', dato: 'Visitantes', valor: datos.conversion.visitantes }, { seccion: 'Conversión', dato: 'Tasa %', valor: datos.conversion.tasa },
    ...(datos.categorias || []).map((c) => ({ seccion: 'Categorías', dato: c.nombre, valor: c.total })),
    ...(datos.top || []).map((p) => ({ seccion: 'Top consultados', dato: p.nombre, valor: p.clics })),
    ...(datos.serie || []).map((s) => ({ seccion: 'Serie', dato: s.fecha || DIAS[s.dia - 1], valor: `${s.producto} producto / ${s.carrito} carrito` })),
  ];
  descargar(`dashboard-${new Date().toISOString().slice(0, 10)}.csv`, aCsv(filas, [{ clave: 'seccion', titulo: 'Sección' }, { clave: 'dato', titulo: 'Dato' }, { clave: 'valor', titulo: 'Valor' }]), 'text/csv;charset=utf-8');
  toast('Reporte descargado');
}

contenido.addEventListener('click', async (e) => {
  const r = e.target.closest('[data-rango]');
  if (r) {
    if (r.dataset.rango === 'custom') {
      const hoy = new Date().toISOString().slice(0, 10);
      const res = await modal({
        titulo: 'Periodo personalizado', icono: 'date_range', textoEnviar: 'Aplicar',
        contenido: `<div class="grid grid-cols-2 gap-3"><div><label class="etiqueta" for="fDesde">Desde</label><input id="fDesde" name="desde" type="date" class="campo" max="${hoy}" required></div>
          <div><label class="etiqueta" for="fHasta">Hasta</label><input id="fHasta" name="hasta" type="date" class="campo" max="${hoy}" value="${hoy}" required></div></div>`,
        alEnviar: (form) => {
          const { desde, hasta } = Object.fromEntries(new FormData(form));
          if (!desde || !hasta || desde > hasta) throw new Error('Revisa las fechas: "desde" debe ser anterior a "hasta".');
          return { desde: new Date(`${desde}T00:00:00`), hasta: new Date(`${hasta}T23:59:59`) };
        },
      });
      if (!res || res === true) return;
      personalizado = res;
    }
    rango = r.dataset.rango;
    try { localStorage.setItem('mt_dash_rango', rango === 'custom' ? '7' : rango); } catch { /* nada */ }
    cargar();
  }
  if (e.target.closest('#actualizar')) { await cargar(); toast('Datos actualizados'); }
  if (e.target.closest('#exportar')) exportar();
});

await cargar();
setInterval(() => { if (!document.hidden) cargar(); }, 120000);
