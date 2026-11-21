// Control de inventario y existencias (diseño "Control de Inventario" de Stitch): stock, alertas,
// ajustes rápidos, entradas/salidas y kárdex. Todo movimiento pasa por mt_ajustar_stock.
import { $, esc, ico, num, hace, fechaHora, normalizar, debounce, aCsv, descargar, numero } from '../util.js';
import { db, urlImagen } from '../api.js';
import { iniciarPanel, dineroPanel, tienda } from './base.js';
import { modal, toast, toastError, vacio, paginacion, panelLateral } from './ui.js';

await iniciarPanel({ seccion: 'inventario', migas: [{ texto: 'Catálogo', href: 'productos.html' }, { texto: 'Inventario' }], area: 'catalogo' });
const contenido = $('#contenido');
const params = new URLSearchParams(location.search);
const MOTIVOS = {
  entrada: ['Recepción de compra a proveedor', 'Recepción de compra local', 'Devolución de cliente', 'Corrección de conteo físico', 'Otro'],
  salida: ['Artículo dañado / Garantía', 'Muestra promocional / Regalo WhatsApp', 'Venta fuera de la tienda', 'Corrección de conteo físico', 'Robo o pérdida', 'Otro'],
};
const TIPOS_MOV = {
  entrada: ['+', 'Entrada de Mercadería', 'bg-secondary-container text-on-secondary-container', 'text-secondary'],
  salida: ['-', 'Salida / Merma', 'bg-error-container text-on-error-container', 'text-error'],
  ajuste: ['!', 'Ajuste de Inventario', 'bg-[#FEF3C7] text-[#92400E]', 'text-[#B45309]'],
  venta: ['-', 'Despacho Comercial', 'bg-tertiary-fixed text-on-tertiary-fixed', 'text-tertiary'],
  devolucion: ['+', 'Devolución al stock', 'bg-secondary-container text-on-secondary-container', 'text-secondary'],
};

let productos = [];
let privados = new Map();
let ultimos = new Map();
let recientes = [];
let categorias = [];
const f = { q: '', filtro: params.get('filtro') === 'agotado' ? 'agotado' : params.get('filtro') === 'bajo' ? 'bajo' : 'todos', pagina: 1, porPagina: 10 };
let alertaCerrada = false;

async function cargar() {
  const [prods, privs, movs, cats] = await Promise.all([
    db.leer('mt_productos', 'select=id,nombre,sku,slug,precio,precio_oferta,oferta_activa,oferta_inicio,oferta_fin,stock,stock_minimo,rastrear_stock,al_agotarse,estado,categoria_id,imagenes,variantes&estado=neq.archivado&order=nombre'),
    db.leer('mt_productos_privado', 'select=producto_id,costo,ubicacion'),
    db.leer('mt_movimientos', 'select=*&order=creado_en.desc&limit=400'),
    db.leer('mt_categorias', 'select=id,nombre'),
  ]);
  productos = prods;
  privados = new Map(privs.map((x) => [x.producto_id, x]));
  categorias = cats;
  ultimos = new Map();
  movs.forEach((m) => { if (!ultimos.has(m.producto_id)) ultimos.set(m.producto_id, m); });
  recientes = movs.slice(0, 6);
}

const conControl = () => productos.filter((p) => p.rastrear_stock);
const agotado = (p) => p.rastrear_stock && p.stock <= 0;
const bajo = (p) => p.rastrear_stock && p.stock > 0 && p.stock <= p.stock_minimo;
const nombreCat = (id) => categorias.find((c) => c.id === id)?.nombre || 'Sin categoría';

function filtrados() {
  const q = normalizar(f.q.trim());
  return productos.filter((p) => {
    if (f.filtro === 'bajo' && !bajo(p)) return false;
    if (f.filtro === 'agotado' && !agotado(p)) return false;
    if (q && !normalizar(`${p.nombre} ${p.sku} ${(p.variantes || []).map((v) => `${v.nombre} ${v.sku || ''}`).join(' ')}`).includes(q)) return false;
    return true;
  }).sort((a, b) => (agotado(b) - agotado(a)) || (bajo(b) - bajo(a)) || a.nombre.localeCompare(b.nombre, 'es'));
}

// ---------------- Plantillas ----------------
function kpis() {
  const lista = conControl();
  const unidades = lista.reduce((s, p) => s + Math.max(0, p.stock), 0);
  const valuacion = lista.reduce((s, p) => s + Math.max(0, p.stock) * num(privados.get(p.id)?.costo), 0);
  const sinCosto = lista.filter((p) => p.stock > 0 && privados.get(p.id)?.costo == null).length;
  const optimos = lista.filter((p) => p.stock > p.stock_minimo).length;
  const bajos = lista.filter(bajo).length;
  const agotados = lista.filter(agotado);
  const preventa = agotados.filter((p) => p.al_agotarse !== 'bloquear').length;
  const caja = (titulo, icono, colorIcono, valor, unidad, colorValor, pie) => `<div class="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between gap-2">
    <div class="flex items-start justify-between"><span class="font-label-sm text-label-sm uppercase tracking-wider text-outline">${titulo}</span><div class="w-9 h-9 rounded-lg ${colorIcono} flex items-center justify-center">${ico(icono, 'text-[20px]')}</div></div>
    <p class="font-headline-lg text-headline-lg ${colorValor} tnum">${valor} <span class="font-body-sm text-body-sm text-outline font-normal">${unidad}</span></p>${pie}</div>`;
  return `<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-md">
    ${caja('Total Unidades en Almacén', 'inventory', 'bg-surface-container text-primary', numero(unidades), 'artículos', 'text-on-surface',
      `<p class="font-body-sm text-body-sm text-on-surface-variant">Valuación activa: <strong class="text-on-surface tnum">${dineroPanel(valuacion)} ${esc(tienda().moneda || '')}</strong>${sinCosto ? ` <span class="text-outline">(${sinCosto} sin costo)</span>` : ''}</p>`)}
    ${caja('Stock Óptimo', 'check_circle', 'bg-secondary-container text-on-secondary-container', optimos, 'SKUs estables', 'text-on-surface', `<p class="font-body-sm text-body-sm text-secondary flex items-center gap-1">${ico('verified', 'text-[16px]')}Sin riesgo de quiebre inmediato</p>`)}
    ${caja(`Stock Bajo (≤ mínimo)`, 'warning_amber', 'bg-[#FEF3C7] text-[#B45309]', bajos, 'SKUs en riesgo', 'text-[#B45309]', `<p class="font-body-sm text-body-sm text-on-surface-variant">Reorden recomendada en 48h</p>`)}
    ${caja('Quiebre de Stock', 'do_not_disturb_on', 'bg-error-container text-on-error-container', agotados.length, 'artículos agotados', 'text-error', `<p class="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1">${ico('chat', 'text-[16px] text-wa')}${preventa ? `${preventa} en preventa o consulta` : 'Clientes ven "Avisarme"'}</p>`)}
  </div>`;
}

function alerta() {
  const criticos = productos.filter((p) => agotado(p) || bajo(p)).length;
  if (!criticos || alertaCerrada) return '';
  return `<div class="flex flex-col sm:flex-row sm:items-center gap-3 p-space-md rounded-xl bg-error-container/50 border border-[#FECACA]">
    <div class="w-10 h-10 rounded-full bg-error text-on-error flex items-center justify-center shrink-0">${ico('priority_high', 'text-[22px]')}</div>
    <div class="flex-1"><div class="flex items-center gap-2 flex-wrap"><p class="font-label-lg text-label-lg text-on-error-container">Atención: ${criticos} ${criticos === 1 ? 'artículo requiere' : 'artículos requieren'} reabastecimiento urgente</p><span class="chip-rojo">Prioridad Alta</span></div>
      <p class="font-body-sm text-body-sm text-on-error-container/80">Si se agotan, la tienda mostrará "Avisarme por WhatsApp" y perderás ventas directas.</p></div>
    <div class="flex items-center gap-1"><button type="button" data-filtro="bajo" class="btn-sm btn bg-error text-on-error hover:bg-[#93000a]">${ico('visibility', 'text-[16px]')}Ver críticos</button>
      <button type="button" data-cerrar-alerta class="btn-icono" aria-label="Cerrar aviso">${ico('close', 'text-[18px]')}</button></div></div>`;
}

const comportamientos = { bloquear: 'Bloquear WA', preventa: 'Preventa WA', continuar: 'Consultas ON' };
function estadoChip(p) {
  if (!p.rastrear_stock) return '<span class="chip-gris">Sin control</span>';
  if (agotado(p)) return p.al_agotarse === 'preventa' ? '<span class="chip-azul">Preventa</span>' : '<span class="chip-rojo">Agotado</span>';
  if (bajo(p)) return '<span class="chip-ambar">Stock Crítico</span>';
  return '<span class="chip-verde">Disponible</span>';
}
function ultimoMovimiento(p) {
  const m = ultimos.get(p.id);
  if (!m) return '<span class="font-label-sm text-label-sm text-outline">Sin movimientos</span>';
  const t = { entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste', venta: 'Venta', devolucion: 'Devolución' }[m.tipo] || m.tipo;
  return `<div class="flex flex-col font-label-sm text-label-sm"><span class="text-on-surface font-semibold">${esc(t)} ${m.cantidad > 0 ? '+' : ''}${m.cantidad} un${m.referencia ? ` · ${esc(m.referencia)}` : ''}</span><span class="text-outline">${esc(hace(m.creado_en))}</span></div>`;
}

function fila(p) {
  const img = (p.imagenes || [])[0];
  const variantes = (p.variantes || []).length;
  return `<tr class="hover:bg-surface-container-low/70 transition-colors">
    <td class="py-3 px-4"><div class="flex items-center gap-3 min-w-[230px]">
      <div class="w-11 h-11 rounded-lg bg-surface-container overflow-hidden shrink-0">${img ? `<img src="${esc(urlImagen(img.mini || img.url))}" alt="" class="w-full h-full object-cover" loading="lazy">` : ''}</div>
      <div class="min-w-0"><a href="producto.html?id=${p.id}" class="block font-label-lg text-label-lg text-on-surface truncate hover:text-primary">${esc(p.nombre)}</a>
        <span class="font-label-sm text-label-sm text-outline">SKU: ${esc(p.sku)} • ${dineroPanel(p.precio)}${variantes ? ` • ${variantes} variantes` : ''}</span></div></div></td>
    <td class="py-3 px-3 whitespace-nowrap"><span class="font-label-md text-label-md text-on-surface-variant">${esc(nombreCat(p.categoria_id))}</span></td>
    <td class="py-3 px-3">${p.rastrear_stock ? `<div class="flex items-center gap-1">
        <button type="button" data-delta="-1" data-id="${p.id}" class="w-7 h-7 rounded-lg bg-surface-container hover:bg-surface-container-high flex items-center justify-center disabled:opacity-40" ${p.stock <= 0 ? 'disabled' : ''} aria-label="Restar una unidad">${ico('remove', 'text-[16px]')}</button>
        <span class="w-10 text-center font-headline-sm text-[16px] tnum ${agotado(p) ? 'text-error' : bajo(p) ? 'text-[#B45309]' : 'text-on-surface'}">${p.stock}</span>
        <button type="button" data-delta="1" data-id="${p.id}" class="w-7 h-7 rounded-lg bg-surface-container hover:bg-surface-container-high flex items-center justify-center" aria-label="Sumar una unidad">${ico('add', 'text-[16px]')}</button></div>`
      : '<span class="font-label-md text-label-md text-outline">—</span>'}</td>
    <td class="py-3 px-3 whitespace-nowrap"><button type="button" data-minimo="${p.id}" class="font-label-md text-label-md text-on-surface-variant hover:text-primary underline decoration-dotted underline-offset-4 tnum" title="Cambiar mínimo">${p.stock_minimo} un.</button></td>
    <td class="py-3 px-3 whitespace-nowrap">${estadoChip(p)}</td>
    <td class="py-3 px-3"><select data-agotarse="${p.id}" class="campo h-8 lg:h-8 py-0 pl-2 w-auto font-label-sm text-label-sm" title="Qué pasa en la tienda cuando se agota">${Object.entries(comportamientos).map(([v, t]) => `<option value="${v}" ${p.al_agotarse === v ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
    <td class="py-3 px-3 whitespace-nowrap">${ultimoMovimiento(p)}</td>
    <td class="py-3 px-4 text-right whitespace-nowrap"><div class="flex items-center justify-end gap-1">
      <button type="button" data-ajustar="${p.id}" class="btn-icono" title="Ajuste rápido">${ico('tune', 'text-[18px]')}</button>
      <button type="button" data-kardex="${p.id}" class="btn-sm btn-secundario">${ico('receipt_long', 'text-[16px]')}Kárdex</button></div></td></tr>`;
}

function tarjetaMovil(p) {
  const img = (p.imagenes || [])[0];
  return `<div class="p-3 border-b border-[#F1F5F9] flex flex-col gap-2">
    <div class="flex items-center gap-3"><div class="w-12 h-12 rounded-lg bg-surface-container overflow-hidden shrink-0">${img ? `<img src="${esc(urlImagen(img.mini || img.url))}" alt="" class="w-full h-full object-cover" loading="lazy">` : ''}</div>
      <div class="flex-1 min-w-0"><p class="font-label-lg text-label-lg truncate">${esc(p.nombre)}</p><p class="font-label-sm text-label-sm text-outline">SKU: ${esc(p.sku)} · mín. ${p.stock_minimo}</p></div>${estadoChip(p)}</div>
    <div class="flex items-center justify-between gap-2">${p.rastrear_stock ? `<div class="flex items-center gap-1">
        <button type="button" data-delta="-1" data-id="${p.id}" class="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center" ${p.stock <= 0 ? 'disabled' : ''} aria-label="Restar">${ico('remove', 'text-[18px]')}</button>
        <span class="w-12 text-center font-headline-sm text-headline-sm tnum">${p.stock}</span>
        <button type="button" data-delta="1" data-id="${p.id}" class="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center" aria-label="Sumar">${ico('add', 'text-[18px]')}</button></div>` : '<span class="text-outline">Sin control de stock</span>'}
      <div class="flex gap-1"><button type="button" data-ajustar="${p.id}" class="btn-icono" aria-label="Ajuste rápido">${ico('tune', 'text-[18px]')}</button>
        <button type="button" data-kardex="${p.id}" class="btn-sm btn-secundario">Kárdex</button></div></div>
    ${ultimoMovimiento(p)}</div>`;
}

function htmlMovimiento(m, conProducto = true) {
  const [signo, titulo, clase, color] = TIPOS_MOV[m.tipo] || ['·', m.tipo, 'bg-surface-container', 'text-on-surface'];
  const prod = productos.find((p) => p.id === m.producto_id);
  return `<div class="flex gap-3 p-3 rounded-xl bg-surface-container-low">
    <span class="w-9 h-9 rounded-full ${clase} flex items-center justify-center font-headline-sm text-headline-sm shrink-0">${signo}</span>
    <div class="flex-1 min-w-0"><div class="flex items-center justify-between gap-2"><span class="font-label-lg text-label-lg text-on-surface">${esc(titulo)}</span><span class="font-label-sm text-label-sm text-outline whitespace-nowrap">${esc(hace(m.creado_en))}</span></div>
      <p class="font-body-sm text-body-sm"><strong class="${color} tnum">${m.cantidad > 0 ? '+' : ''}${m.cantidad}x</strong> ${conProducto ? esc(prod?.nombre || 'Producto eliminado') : ''}${m.variante ? ` <span class="text-outline">(${esc(m.variante)})</span>` : ''} <span class="text-outline">→ queda ${m.stock_resultante}</span></p>
      ${m.motivo ? `<p class="font-body-sm text-body-sm text-on-surface-variant">${esc(m.motivo)}${m.referencia ? ` · ${esc(m.referencia)}` : ''}</p>` : ''}
      <p class="font-label-sm text-label-sm text-outline mt-0.5">${m.tipo === 'venta' || m.tipo === 'devolucion' ? `Canal: ${ico('chat', 'text-[12px] align-[-2px]')} Pedido WhatsApp` : 'Operador'}: ${esc(m.autor || 'Sistema')}</p></div></div>`;
}

function pintar() {
  const lista = filtrados();
  const paginas = Math.max(1, Math.ceil(lista.length / f.porPagina));
  f.pagina = Math.min(f.pagina, paginas);
  const visibles = lista.slice((f.pagina - 1) * f.porPagina, f.pagina * f.porPagina);
  const cuenta = { todos: productos.length, bajo: productos.filter(bajo).length, agotado: productos.filter(agotado).length };
  const tab = (id, texto, n, color = '') => `<button type="button" data-filtro="${id}" class="px-3.5 py-1.5 rounded-lg font-label-md text-label-md flex items-center gap-1.5 transition-all ${f.filtro === id ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}">${texto}${n != null ? `<span class="${f.filtro === id ? 'opacity-80' : color} font-bold tnum">${n}</span>` : ''}</button>`;
  contenido.innerHTML = `
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
      <div><div class="flex items-center gap-1.5 mb-1"><span class="w-6 h-6 rounded-md bg-primary/10 text-primary flex items-center justify-center">${ico('warehouse', 'text-[16px]')}</span>
          <span class="font-label-sm text-label-sm uppercase tracking-wider text-primary font-bold">Módulo Logístico &amp; Operaciones</span></div>
        <h1 class="font-headline-lg-mobile text-headline-lg-mobile lg:font-headline-lg lg:text-headline-lg text-on-surface tracking-tight">Control de Inventario &amp; Existencias</h1>
        <p class="font-body-md text-body-md text-on-surface-variant">Supervisa niveles de stock, alertas de reposición y auditoría de movimientos en tiempo real.</p></div>
      <div class="flex flex-wrap items-center gap-space-xs">
        <button type="button" data-accion="reporte" class="btn-secundario">${ico('download', 'text-[18px]')}Descargar Reporte</button>
        <button type="button" data-accion="salida" class="btn-secundario">${ico('remove_circle_outline', 'text-[18px]')}Registrar Ajuste / Salida</button>
        <button type="button" data-accion="entrada" class="btn-primario">${ico('add_circle', 'text-[18px]')}Registrar Entrada</button></div>
    </div>
    ${kpis()}
    ${alerta()}
    <div class="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
      <div class="p-space-md flex flex-col xl:flex-row xl:items-center justify-between gap-space-sm border-b border-[#F1F5F9]">
        <div class="flex flex-wrap items-center gap-1.5">${tab('todos', 'Todos los productos', cuenta.todos)}${tab('bajo', 'Stock Bajo (≤ mín.)', cuenta.bajo, 'text-[#B45309]')}${tab('agotado', 'Agotados (0 un)', cuenta.agotado, 'text-error')}
          <button type="button" data-accion="historial" class="px-3.5 py-1.5 rounded-lg font-label-md text-label-md bg-surface-container-low text-on-surface-variant hover:bg-surface-container flex items-center gap-1">${ico('receipt_long', 'text-[16px]')}Historial Kárdex</button></div>
        <div class="flex flex-col sm:flex-row gap-2">
          <span class="flex items-center gap-1.5 px-3 h-10 rounded-lg bg-surface-container-low font-label-md text-label-md text-on-surface-variant">${ico('location_on', 'text-[18px] text-primary')}Bodega: <strong class="text-on-surface">${esc(tienda().bodega || 'Bodega Principal')}</strong></span>
          <div class="relative">${ico('search', 'absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]')}<input id="buscar" type="search" value="${esc(f.q)}" class="campo h-10 lg:h-10 pl-9 sm:w-64" placeholder="Filtrar por SKU o nombre..." aria-label="Filtrar inventario"></div></div>
      </div>
      ${visibles.length ? `<div class="hidden lg:block overflow-x-auto"><table class="w-full text-left">
          <thead><tr class="bg-surface-container-low text-outline font-label-sm text-label-sm uppercase tracking-wider"><th class="py-3 px-4">Producto / SKU</th><th class="py-3 px-3">Categoría</th><th class="py-3 px-3">Stock Actual</th><th class="py-3 px-3">Mín. Alerta</th><th class="py-3 px-3">Estado</th><th class="py-3 px-3">Al agotarse</th><th class="py-3 px-3">Último Movimiento</th><th class="py-3 px-4 text-right">Acciones</th></tr></thead>
          <tbody class="divide-y divide-[#F1F5F9]">${visibles.map(fila).join('')}</tbody></table></div>
        <div class="lg:hidden">${visibles.map(tarjetaMovil).join('')}</div>`
        : vacio({ icono: 'inventory', titulo: 'No hay productos en esta vista', texto: f.filtro === 'todos' ? 'Prueba con otra búsqueda.' : '¡Excelente! Nada en riesgo por ahora.' })}
      ${lista.length > f.porPagina ? `<div class="border-t border-[#F1F5F9]">${paginacion({ total: lista.length, pagina: f.pagina, porPagina: f.porPagina })}</div>` : ''}
    </div>
    <section id="kardex" class="bg-surface-container-lowest rounded-xl shadow-sm p-space-md space-y-space-md scroll-mt-24">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2"><div>
        <div class="flex items-center gap-1.5 text-primary">${ico('history', 'text-[18px]')}<span class="font-label-sm text-label-sm uppercase tracking-wider font-bold">Auditoría en Tiempo Real</span></div>
        <h2 class="font-headline-sm text-headline-sm text-on-surface">Últimos Movimientos del Kárdex</h2>
        <p class="font-body-sm text-body-sm text-on-surface-variant">Trazabilidad completa de recepciones, despachos de WhatsApp y regularizaciones manuales.</p></div>
        <span class="inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-full bg-secondary-container/40 text-on-secondary-container font-label-sm text-label-sm"><span class="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse"></span>Sincronizado</span></div>
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-space-sm">${recientes.map((m) => htmlMovimiento(m)).join('') || '<p class="font-body-sm text-body-sm text-outline">Aún no hay movimientos.</p>'}</div>
    </section>`;
}

// ---------------- Ajustes ----------------
async function ajustar({ producto = null, tipo = 'entrada' } = {}) {
  const seleccion = producto ? [producto] : productos.filter((p) => p.rastrear_stock);
  let actual = producto || null;
  const opcionesVariante = (p) => (p?.variantes || []).map((v) => `<option value="${esc(v.nombre)}">${esc(v.nombre)} (${num(v.stock)} un)</option>`).join('');
  const r = await modal({
    titulo: 'Ajuste Rápido de Kárdex', icono: 'tune', textoEnviar: 'Guardar en Kárdex',
    subtitulo: producto ? `${esc(producto.nombre)} · SKU ${esc(producto.sku)}` : 'Elige el producto y la operación.',
    contenido: `<div class="flex flex-col gap-3">
      ${producto ? '' : `<div><label class="etiqueta" for="ajProducto">Producto</label><select id="ajProducto" name="producto" class="campo" required><option value="">Elige un producto…</option>${seleccion.map((p) => `<option value="${p.id}">${esc(p.nombre)} · ${esc(p.sku)} (${p.stock} un)</option>`).join('')}</select></div>`}
      <div data-bloque-variante class="${actual && (actual.variantes || []).length ? '' : 'hidden'}"><label class="etiqueta" for="ajVariante">Variante</label><select id="ajVariante" name="variante" class="campo">${opcionesVariante(actual)}</select></div>
      <div class="p-3 rounded-xl bg-surface-container-low flex items-center justify-between"><span class="font-body-md text-body-md text-on-surface-variant">Existencias actuales en sistema:</span><strong data-existencias class="font-headline-sm text-headline-sm tnum">${actual ? actual.stock : '—'}</strong></div>
      <div><span class="etiqueta">Tipo de Operación</span><div class="grid grid-cols-2 gap-2">
        <label class="flex items-center gap-2 p-3 rounded-xl border cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5 border-[#E2E8F0]"><input type="radio" name="tipo" value="entrada" ${tipo === 'entrada' ? 'checked' : ''} class="accent-primary">${ico('add_circle', 'text-secondary text-[20px]')}<span class="font-label-lg text-label-lg">Entrada (+ stock)</span></label>
        <label class="flex items-center gap-2 p-3 rounded-xl border cursor-pointer has-[:checked]:border-error has-[:checked]:bg-error/5 border-[#E2E8F0]"><input type="radio" name="tipo" value="salida" ${tipo === 'salida' ? 'checked' : ''} class="accent-error">${ico('remove_circle', 'text-error text-[20px]')}<span class="font-label-lg text-label-lg">Salida / Merma (- stock)</span></label></div></div>
      <div class="grid grid-cols-2 gap-3"><div><label class="etiqueta" for="ajCantidad">Cantidad a Modificar</label><input id="ajCantidad" name="cantidad" type="number" min="1" step="1" value="1" class="campo tnum" required></div>
        <div><label class="etiqueta" for="ajReferencia">Referencia (opcional)</label><input id="ajReferencia" name="referencia" class="campo" maxlength="120" placeholder="Factura, lote, pedido..."></div></div>
      <div><label class="etiqueta" for="ajMotivo">Motivo del Ajuste</label><select id="ajMotivo" name="motivo" class="campo">${MOTIVOS[tipo].map((m) => `<option>${m}</option>`).join('')}</select></div>
    </div>`,
    alAbrir: (capa) => {
      const form = capa.querySelector('form');
      const refrescar = () => {
        const sel = form.producto ? productos.find((p) => p.id === form.producto.value) : actual;
        actual = sel || null;
        const bloque = capa.querySelector('[data-bloque-variante]');
        bloque.classList.toggle('hidden', !(actual?.variantes || []).length);
        if (form.producto) form.variante.innerHTML = opcionesVariante(actual);
        const v = (actual?.variantes || []).find((x) => x.nombre === form.variante.value);
        capa.querySelector('[data-existencias]').textContent = actual ? (v ? num(v.stock) : actual.stock) : '—';
      };
      form.producto?.addEventListener('change', refrescar);
      form.variante.addEventListener('change', refrescar);
      form.querySelectorAll('[name="tipo"]').forEach((x) => x.addEventListener('change', () => { form.motivo.innerHTML = MOTIVOS[form.tipo.value].map((m) => `<option>${m}</option>`).join(''); }));
    },
    alEnviar: async (form) => {
      const p = actual || productos.find((x) => x.id === form.producto?.value);
      if (!p) throw new Error('Elige un producto.');
      const cantidad = Math.round(num(form.cantidad.value));
      if (cantidad < 1) throw new Error('La cantidad debe ser al menos 1.');
      const t = form.tipo.value;
      const res = await db.rpc('mt_ajustar_stock', { p_producto: p.id, p_variante: (p.variantes || []).length ? form.variante.value : null, p_delta: t === 'entrada' ? cantidad : -cantidad, p_tipo: t, p_motivo: form.motivo.value, p_referencia: form.referencia.value.trim() || null });
      return { p, res, t, cantidad };
    },
  });
  if (r && r.p) { toast(`${r.t === 'entrada' ? 'Entrada' : 'Salida'} de ${r.cantidad} u. registrada · queda ${r.res.stock}`); await recargar(); }
}

async function verKardex(idProducto) {
  const p = productos.find((x) => x.id === idProducto);
  if (!p) return;
  const panel = panelLateral({ titulo: `Kárdex · ${p.nombre}`, contenido: '<div class="p-5"><div class="h-20 esqueleto mb-2"></div><div class="h-20 esqueleto"></div></div>' });
  try {
    const movs = await db.leer('mt_movimientos', `select=*&producto_id=eq.${p.id}&order=creado_en.desc&limit=300`);
    const entradas = movs.filter((m) => m.cantidad > 0).reduce((s, m) => s + m.cantidad, 0);
    const salidas = movs.filter((m) => m.cantidad < 0).reduce((s, m) => s - m.cantidad, 0);
    panel.cuerpo.innerHTML = `<div class="p-5 flex flex-col gap-4">
      <div class="flex items-center gap-3"><div class="w-14 h-14 rounded-xl bg-surface-container overflow-hidden">${p.imagenes?.[0] ? `<img src="${esc(urlImagen(p.imagenes[0].mini || p.imagenes[0].url))}" alt="" class="w-full h-full object-cover">` : ''}</div>
        <div class="min-w-0"><p class="font-label-lg text-label-lg truncate">${esc(p.nombre)}</p><p class="font-mono text-label-sm text-outline">${esc(p.sku)}${privados.get(p.id)?.ubicacion ? ` · ${esc(privados.get(p.id).ubicacion)}` : ''}</p></div></div>
      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="p-3 rounded-xl bg-surface-container-low"><p class="font-headline-sm text-headline-sm tnum">${p.stock}</p><p class="font-label-sm text-label-sm text-outline">Stock actual</p></div>
        <div class="p-3 rounded-xl bg-secondary-container/30"><p class="font-headline-sm text-headline-sm text-secondary tnum">+${entradas}</p><p class="font-label-sm text-label-sm text-outline">Entradas</p></div>
        <div class="p-3 rounded-xl bg-error-container/30"><p class="font-headline-sm text-headline-sm text-error tnum">-${salidas}</p><p class="font-label-sm text-label-sm text-outline">Salidas</p></div></div>
      ${(p.variantes || []).length ? `<div class="flex flex-wrap gap-1.5">${p.variantes.map((v) => `<span class="chip-gris normal-case tracking-normal">${esc(v.nombre)}: <strong class="tnum">${num(v.stock)}</strong></span>`).join('')}</div>` : ''}
      <div class="flex gap-2"><button type="button" data-k-ajustar class="btn-primario flex-1">${ico('tune', 'text-[18px]')}Registrar movimiento</button><button type="button" data-k-csv class="btn-secundario">${ico('download', 'text-[18px]')}CSV</button></div>
      <div class="flex flex-col gap-2">${movs.map((m) => `<div class="flex items-start gap-3 py-2 border-b border-[#F1F5F9]">
          <span class="font-headline-sm text-[15px] tnum w-12 text-right ${m.cantidad > 0 ? 'text-secondary' : 'text-error'}">${m.cantidad > 0 ? '+' : ''}${m.cantidad}</span>
          <div class="flex-1 min-w-0"><p class="font-label-md text-label-md">${esc((TIPOS_MOV[m.tipo] || [])[1] || m.tipo)}${m.variante ? ` · ${esc(m.variante)}` : ''}</p>
            <p class="font-body-sm text-body-sm text-on-surface-variant">${esc(m.motivo || '')}${m.referencia ? ` · ${esc(m.referencia)}` : ''}</p>
            <p class="font-label-sm text-label-sm text-outline">${esc(fechaHora(m.creado_en))} · ${esc(m.autor || 'Sistema')}</p></div>
          <span class="font-label-md text-label-md text-on-surface-variant tnum">= ${m.stock_resultante}</span></div>`).join('') || '<p class="text-center py-6 font-body-sm text-body-sm text-outline">Sin movimientos registrados.</p>'}</div></div>`;
    panel.cuerpo.addEventListener('click', async (e) => {
      if (e.target.closest('[data-k-ajustar]')) { panel.cerrar(); await ajustar({ producto: p }); }
      if (e.target.closest('[data-k-csv]')) descargar(`kardex-${p.sku}.csv`, aCsv(movs, [{ titulo: 'Fecha', valor: (m) => fechaHora(m.creado_en) }, { clave: 'tipo', titulo: 'Tipo' }, { clave: 'variante', titulo: 'Variante' }, { clave: 'cantidad', titulo: 'Cantidad' }, { clave: 'stock_resultante', titulo: 'Stock resultante' }, { clave: 'motivo', titulo: 'Motivo' }, { clave: 'referencia', titulo: 'Referencia' }, { clave: 'autor', titulo: 'Autor' }]), 'text/csv;charset=utf-8');
    });
  } catch (e) { panel.cuerpo.innerHTML = `<p class="p-5 text-error">${esc(e.message)}</p>`; }
}

function reporte() {
  const filas = productos.map((p) => ({ ...p, costo: privados.get(p.id)?.costo, ubicacion: privados.get(p.id)?.ubicacion }));
  descargar(`inventario-${new Date().toISOString().slice(0, 10)}.csv`, aCsv(filas, [
    { clave: 'sku', titulo: 'SKU' }, { clave: 'nombre', titulo: 'Producto' }, { titulo: 'Categoría', valor: (p) => nombreCat(p.categoria_id) },
    { clave: 'stock', titulo: 'Stock' }, { clave: 'stock_minimo', titulo: 'Mínimo' }, { titulo: 'Estado', valor: (p) => (agotado(p) ? 'Agotado' : bajo(p) ? 'Stock bajo' : 'OK') },
    { clave: 'costo', titulo: 'Costo unitario' }, { titulo: 'Valuación', valor: (p) => (p.costo != null ? (Math.max(0, p.stock) * num(p.costo)).toFixed(2) : '') },
    { clave: 'ubicacion', titulo: 'Ubicación' }, { titulo: 'Variantes', valor: (p) => (p.variantes || []).map((v) => `${v.nombre}: ${num(v.stock)}`).join(' | ') },
  ]), 'text/csv;charset=utf-8');
  toast('Reporte de inventario descargado');
}

async function recargar() { await cargar(); pintar(); }

// ---------------- Eventos ----------------
contenido.addEventListener('input', debounce((e) => {
  if (e.target.id === 'buscar') { f.q = e.target.value; f.pagina = 1; const pos = e.target.selectionStart; pintar(); const b = $('#buscar'); b.focus(); b.setSelectionRange(pos, pos); }
}, 200));
contenido.addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-agotarse]');
  if (sel) {
    try { await db.actualizar('mt_productos', `id=eq.${sel.dataset.agotarse}`, { al_agotarse: sel.value }); productos.find((p) => p.id === sel.dataset.agotarse).al_agotarse = sel.value; toast('Comportamiento actualizado'); pintar(); }
    catch (err) { toastError(err); }
  }
});
contenido.addEventListener('click', async (e) => {
  const t = e.target;
  try {
    const fil = t.closest('[data-filtro]');
    if (fil) { f.filtro = fil.dataset.filtro; f.pagina = 1; pintar(); return; }
    if (t.closest('[data-cerrar-alerta]')) { alertaCerrada = true; pintar(); return; }
    const acc = t.closest('[data-accion]')?.dataset.accion;
    if (acc === 'reporte') { reporte(); return; }
    if (acc === 'entrada' || acc === 'salida') { await ajustar({ tipo: acc }); return; }
    if (acc === 'historial') { $('#kardex').scrollIntoView({ behavior: 'smooth' }); return; }
    const pag = t.closest('[data-pagina]');
    if (pag) { f.pagina = Number(pag.dataset.pagina); pintar(); return; }
    const d = t.closest('[data-delta]');
    if (d) {
      const p = productos.find((x) => x.id === d.dataset.id);
      const delta = Number(d.dataset.delta);
      if ((p.variantes || []).length) { await ajustar({ producto: p, tipo: delta > 0 ? 'entrada' : 'salida' }); return; }
      d.disabled = true;
      const res = await db.rpc('mt_ajustar_stock', { p_producto: p.id, p_variante: null, p_delta: delta, p_tipo: delta > 0 ? 'entrada' : 'salida', p_motivo: 'Ajuste rápido desde inventario', p_referencia: null });
      p.stock = res.stock;
      toast(`${p.nombre}: ${delta > 0 ? '+1' : '-1'} → ${res.stock} un.`);
      await recargar();
      return;
    }
    const min = t.closest('[data-minimo]');
    if (min) {
      const p = productos.find((x) => x.id === min.dataset.minimo);
      const r = await modal({ titulo: 'Stock mínimo de alerta', icono: 'notifications_active', ancho: 'sm', subtitulo: esc(p.nombre),
        contenido: `<label class="etiqueta" for="nuevoMin">Avisar cuando queden</label><input id="nuevoMin" name="minimo" type="number" min="0" step="1" class="campo tnum" value="${p.stock_minimo}" required>`,
        alEnviar: (form) => Math.max(0, Math.round(num(form.minimo.value))) });
      if (r === null || r === undefined || r === true) return;
      await db.actualizar('mt_productos', `id=eq.${p.id}`, { stock_minimo: r });
      toast('Mínimo actualizado'); await recargar(); return;
    }
    const aj = t.closest('[data-ajustar]');
    if (aj) { await ajustar({ producto: productos.find((x) => x.id === aj.dataset.ajustar) }); return; }
    const k = t.closest('[data-kardex]');
    if (k) await verKardex(k.dataset.kardex);
  } catch (err) { toastError(err); await recargar(); }
});

await cargar();
pintar();
if (params.get('producto')) verKardex(params.get('producto'));
