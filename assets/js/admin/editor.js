// Crear y editar producto (diseño "Crear y Editar Producto" de Stitch).
// Todos los cambios de stock pasan por mt_ajustar_stock para que queden en el kárdex.
import { $, $$, esc, ico, num, slug, markdown, plantilla, hace, ofertaVigente, precioVigente, descuentoPct, debounce } from '../util.js';
import { db, urlImagen, ruta } from '../api.js';
import { iniciarPanel, dineroPanel, tienda, admin } from './base.js';
import { modal, confirmar, toast, toastError, subirImagen, elegirImagenes, elegirIcono, chipProducto, spinner } from './ui.js';

const id = new URLSearchParams(location.search).get('id');
const esNuevo = !id;
await iniciarPanel({ seccion: 'productos', migas: [{ texto: 'Catálogo', href: 'productos.html' }, { texto: 'Gestión de Productos', href: 'productos.html' }, { texto: esNuevo ? 'Nuevo producto' : 'Editar producto' }], area: 'catalogo' });
const contenido = $('#contenido');
contenido.className = 'w-full';

const VACIO = {
  nombre: '', slug: '', sku: '', codigo_barras: '', marca: '', modelo: '', material: '', peso: '', categoria_id: null, subcategoria: '',
  descripcion_corta: '', descripcion: '', etiquetas: [], destacados: [], especificaciones: [], imagenes: [], variantes: [], garantias: [], relacionados: [],
  precio: 0, precio_oferta: null, oferta_activa: false, oferta_inicio: null, oferta_fin: null, stock: 0, stock_minimo: 5, rastrear_stock: true,
  al_agotarse: 'bloquear', estado: 'publicado', destacado: false, novedad: true, relampago: false, en_catalogo_wa: true, envio_gratis: false,
};

let [categorias, todos] = await Promise.all([
  db.leer('mt_categorias', 'select=id,nombre,slug&order=orden,nombre'),
  db.leer('mt_productos', 'select=id,nombre,sku,slug,subcategoria,imagenes,estado&estado=neq.archivado&order=nombre'),
]);
let p; let priv; let original;
if (esNuevo) {
  p = structuredClone(VACIO);
  priv = { costo: null, ubicacion: '', notas: '' };
} else {
  const [[fila], [privado]] = await Promise.all([db.leer('mt_productos', `select=*&id=eq.${id}`), db.leer('mt_productos_privado', `select=*&producto_id=eq.${id}`)]);
  if (!fila) { contenido.innerHTML = `<div class="p-6"><div class="tarjeta p-10 text-center"><p class="font-headline-sm text-headline-sm mb-3">Este producto no existe</p><a class="btn-primario" href="productos.html">Volver al catálogo</a></div></div>`; throw new Error('No existe'); }
  p = fila;
  priv = privado || { costo: null, ubicacion: '', notas: '' };
}
original = structuredClone(p);
let slugManual = !esNuevo;
let sucio = false;
let vistaDescripcion = 'editar';

const marcarSucio = () => { if (!sucio) { sucio = true; $('#indicadorCambios')?.classList.remove('hidden'); } };
window.addEventListener('beforeunload', (e) => { if (sucio) { e.preventDefault(); e.returnValue = ''; } });

// ---------------- Piezas ----------------
const seccion = (n, icono, titulo, sub, cuerpo, extra = '') => `<section class="bg-surface-container-lowest rounded-xl p-space-md sm:p-space-lg shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
  <div class="flex items-center justify-between gap-2 pb-space-sm mb-space-md">
    <div class="flex items-center gap-space-xs"><div class="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary">${ico(icono, 'text-[18px]')}</div>
      <div><h2 class="font-headline-sm text-headline-sm text-on-surface">${n}. ${titulo}</h2><p class="font-body-sm text-body-sm text-outline">${sub}</p></div></div>${extra}</div>
  <div class="space-y-space-md">${cuerpo}</div></section>`;

const campoTexto = (nombre, etiqueta, valor, { requerido = false, max = null, placeholder = '', ayuda = '', tipo = 'text', extra = '' } = {}) => `<div>
  <label class="flex items-center justify-between font-label-lg text-label-lg text-on-surface mb-1.5" for="c_${nombre}"><span>${etiqueta}${requerido ? ' <span class="text-error">*</span>' : ''}</span>
    ${max ? `<span class="font-label-sm text-label-sm text-outline tnum" data-contador="${nombre}">${String(valor ?? '').length} / ${max}</span>` : ''}</label>
  <input id="c_${nombre}" name="${nombre}" type="${tipo}" class="campo" value="${esc(valor ?? '')}" ${max ? `maxlength="${max}"` : ''} ${requerido ? 'required' : ''} placeholder="${esc(placeholder)}" ${extra}>
  ${ayuda ? `<p class="ayuda">${ayuda}</p>` : ''}</div>`;

function htmlInformacion() {
  const subcats = [...new Set(todos.map((x) => x.subcategoria).filter(Boolean))].sort();
  return seccion(1, 'edit_note', 'Información General', 'Datos base del producto visibles en la vitrina pública y carrito.', `
    ${campoTexto('nombre', 'Nombre Oficial del Producto', p.nombre, { requerido: true, max: 120, placeholder: 'Ej: Camisa Slim Fit de Algodón Egipcio', ayuda: 'Optimizado para búsqueda en catálogo rápido.' })}
    <div class="flex flex-wrap items-center gap-2 -mt-2 font-body-sm text-body-sm text-outline">${ico('link', 'text-[16px]')}<span class="truncate">${esc(ruta('producto.html?p='))}<strong class="text-on-surface-variant" id="vistaSlug">${esc(p.slug || 'se-genera-del-nombre')}</strong></span>
      <button type="button" data-accion="editarSlug" class="text-primary font-label-md text-label-md hover:underline">Editar dirección</button></div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-space-md">
      <div><label class="block font-label-lg text-label-lg text-on-surface mb-1.5" for="c_sku">SKU / Código Referencia <span class="text-error">*</span></label>
        <div class="flex gap-2"><input id="c_sku" name="sku" class="campo font-mono uppercase" value="${esc(p.sku)}" maxlength="40" required placeholder="Ej: CAM-SLIM-001">
          <button type="button" data-accion="autoSku" class="btn-secundario shrink-0">${ico('refresh', 'text-[18px]')}<span class="hidden sm:inline">Auto-generar</span></button></div></div>
      <div><label class="block font-label-lg text-label-lg text-on-surface mb-1.5" for="c_codigo_barras">Código de Barras (EAN / UPC / GTIN)</label>
        <div class="relative">${ico('barcode', 'absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]')}<input id="c_codigo_barras" name="codigo_barras" class="campo pl-10 font-mono" value="${esc(p.codigo_barras || '')}" maxlength="40" placeholder="Escanear o ingresar número..." inputmode="numeric"></div></div>
      <div><label class="block font-label-lg text-label-lg text-on-surface mb-1.5" for="c_categoria_id">Categoría Principal <span class="text-error">*</span></label>
        <select id="c_categoria_id" name="categoria_id" class="campo"><option value="">Elige una categoría…</option>${categorias.map((c) => `<option value="${c.id}" ${c.id === p.categoria_id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>
        <a href="categorias.html#nueva" target="_blank" class="ayuda inline-flex items-center gap-1 text-primary hover:underline">${ico('add', 'text-[14px]')}Crear categoría</a></div>
      <div><label class="block font-label-lg text-label-lg text-on-surface mb-1.5" for="c_subcategoria">Subcategoría</label>
        <input id="c_subcategoria" name="subcategoria" class="campo" list="subcategorias" value="${esc(p.subcategoria || '')}" maxlength="60" placeholder="Ej: Accesorios de Audio">
        <datalist id="subcategorias">${subcats.map((s) => `<option value="${esc(s)}">`).join('')}</datalist></div>
    </div>
    <div><label class="flex items-center justify-between font-label-lg text-label-lg text-on-surface mb-1.5" for="c_descripcion_corta"><span class="flex items-center gap-1">Descripción Corta (Extracto WhatsApp) <span title="Aparece bajo el nombre del producto y en búsquedas">${ico('help', 'text-[16px] text-outline')}</span></span>
      <span class="font-label-sm text-label-sm text-outline tnum" data-contador="descripcion_corta">${(p.descripcion_corta || '').length} / 160</span></label>
      <textarea id="c_descripcion_corta" name="descripcion_corta" class="campo" rows="2" maxlength="160" placeholder="Una o dos frases que vendan el producto.">${esc(p.descripcion_corta || '')}</textarea></div>
    <div><div class="flex items-center justify-between mb-1.5"><span class="font-label-lg text-label-lg text-on-surface">Descripción Completa &amp; Ficha Técnica</span>
        <div class="flex items-center bg-surface-container-low p-0.5 rounded-lg">${[['editar', 'Editar'], ['vista', 'Vista previa']].map(([v, t]) => `<button type="button" data-vista-desc="${v}" class="px-2.5 py-1 rounded-md font-label-sm text-label-sm ${vistaDescripcion === v ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant'}">${t}</button>`).join('')}</div></div>
      <div class="rounded-lg border border-[#E2E8F0] overflow-hidden focus-within:border-[#059669] focus-within:ring-[3px] focus-within:ring-[#059669]/15">
        <div class="flex items-center gap-0.5 px-2 py-1.5 bg-[#F8FAFC] border-b border-[#E2E8F0] ${vistaDescripcion === 'vista' ? 'hidden' : ''}">
          ${[['format_bold', 'negrita', 'Negrita'], ['format_italic', 'cursiva', 'Cursiva'], ['title', 'titulo', 'Título'], ['format_list_bulleted', 'lista', 'Lista'], ['format_list_numbered', 'numerada', 'Lista numerada'], ['link', 'enlace', 'Enlace']]
            .map(([icono, accion, t]) => `<button type="button" data-md="${accion}" title="${t}" class="w-8 h-8 rounded-md text-on-surface-variant hover:bg-white hover:text-primary flex items-center justify-center">${ico(icono, 'text-[18px]')}</button>`).join('')}
          <span class="ml-auto font-label-sm text-label-sm text-outline hidden sm:inline">Modo Markdown activo</span></div>
        ${vistaDescripcion === 'editar'
          ? `<textarea id="c_descripcion" name="descripcion" rows="8" maxlength="8000" class="w-full px-3 py-2.5 font-mono text-[13px] leading-relaxed text-[#0F172A] focus:outline-none resize-y" placeholder="### Título&#10;Texto del producto...&#10;- **Punto:** detalle">${esc(p.descripcion || '')}</textarea>`
          : `<div class="prosa p-4 min-h-[160px]">${markdown(p.descripcion || '') || '<p class="text-outline">Sin descripción todavía.</p>'}</div>`}
      </div></div>
    <div><span class="block font-label-lg text-label-lg text-on-surface mb-1.5">Etiquetas del Producto (Tags de Búsqueda Rápida)</span>
      <div class="flex flex-wrap items-center gap-1.5 p-2 rounded-lg border border-[#E2E8F0] bg-white min-h-[48px]" id="cajaEtiquetas">
        ${(p.etiquetas || []).map((t, i) => `<span class="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-surface-container text-on-surface font-label-md text-label-md">${esc(t)}<button type="button" data-quitar-etiqueta="${i}" class="w-5 h-5 rounded-full hover:bg-surface-container-high flex items-center justify-center" aria-label="Quitar ${esc(t)}">${ico('close', 'text-[14px]')}</button></span>`).join('')}
        <input id="nuevaEtiqueta" class="flex-1 min-w-[120px] px-1 py-1 font-body-md text-body-md focus:outline-none" placeholder="+ Agregar tag..." maxlength="30"></div>
      <p class="ayuda">Enter o coma para agregar. Se usan en el buscador de la tienda.</p></div>`, '<span class="font-label-sm text-label-sm uppercase tracking-wider text-outline">Requerido</span>');
}

function htmlPrecios() {
  const vigente = precioVigente(p);
  const costo = num(priv.costo);
  const ganancia = vigente - costo;
  const margen = vigente > 0 && priv.costo != null ? (ganancia / vigente) * 100 : null;
  const moneda = tienda().moneda || 'USD';
  return seccion(2, 'payments', 'Precios & Márgenes Comerciales', 'Definición de precios de lista, ofertas promocionales y margen interno.', `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-space-md">
      <div><span class="block font-label-lg text-label-lg text-on-surface mb-1.5">Moneda de Transacción</span>
        <div class="campo flex items-center justify-between bg-[#F8FAFC]"><span class="font-label-lg text-label-lg">${esc(moneda)} (${esc(dineroPanel(0).replace(/[\d.,\s]/g, '') || '$')})</span><a href="configuracion.html#tienda" class="font-label-sm text-label-sm text-primary">Cambiar</a></div></div>
      <div><label class="block font-label-lg text-label-lg text-on-surface mb-1.5" for="c_precio">Precio Regular / Lista <span class="text-error">*</span></label>
        <input id="c_precio" name="precio" type="number" min="0" step="0.01" class="campo tnum" value="${p.precio ?? ''}" required></div>
      <div><label class="block font-label-lg text-label-lg text-on-surface mb-1.5" for="c_costo">Costo Unitario Privado</label>
        <input id="c_costo" name="costo" type="number" min="0" step="0.01" class="campo tnum" value="${priv.costo ?? ''}" placeholder="Opcional">
        <p class="ayuda flex items-center gap-1">${ico('lock', 'text-[14px]')}Solo visible para administradores</p></div>
    </div>
    <div class="p-space-md rounded-xl bg-surface-container-low space-y-space-md">
      <label class="flex items-center justify-between gap-3 cursor-pointer"><span class="flex items-center gap-2.5"><input type="checkbox" class="interruptor" name="oferta_activa" ${p.oferta_activa ? 'checked' : ''}>
        <span class="font-label-lg text-label-lg text-on-surface">Habilitar Precio Promocional / Oferta Especial</span></span>
        ${descuentoPct({ ...p, oferta_inicio: null, oferta_fin: null }) ? `<span class="px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-bold">-${descuentoPct({ ...p, oferta_inicio: null, oferta_fin: null })}% calculado</span>` : ''}</label>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-space-md ${p.oferta_activa ? '' : 'opacity-50 pointer-events-none'}">
        <div><label class="block font-label-lg text-label-lg text-on-surface mb-1.5" for="c_precio_oferta">Precio Oferta <span class="text-error">*</span></label>
          <input id="c_precio_oferta" name="precio_oferta" type="number" min="0" step="0.01" class="campo tnum" value="${p.precio_oferta ?? ''}"></div>
        <div><label class="block font-label-lg text-label-lg text-on-surface mb-1.5" for="c_oferta_inicio">Fecha Inicio Oferta</label><input id="c_oferta_inicio" name="oferta_inicio" type="date" class="campo" value="${p.oferta_inicio || ''}"></div>
        <div><label class="block font-label-lg text-label-lg text-on-surface mb-1.5" for="c_oferta_fin">Fecha Fin (Opcional)</label><input id="c_oferta_fin" name="oferta_fin" type="date" class="campo" value="${p.oferta_fin || ''}"></div>
      </div>
      ${p.oferta_activa && !ofertaVigente(p) ? `<p class="font-label-md text-label-md text-[#B45309] flex items-center gap-1">${ico('info', 'text-[16px]')} La oferta no se muestra hoy (revisa que sea menor al precio regular y las fechas).</p>` : ''}
    </div>
    <div class="flex flex-wrap items-center gap-x-6 gap-y-2 p-space-sm rounded-xl bg-tertiary-fixed/30">
      <span class="flex items-center gap-1.5 font-label-lg text-label-lg text-on-surface">${ico('trending_up', 'text-[20px] text-tertiary')} Rendimiento Financiero por Unidad:</span>
      <span class="font-body-md text-body-md">Ganancia Neta: <strong class="tnum ${ganancia < 0 ? 'text-error' : 'text-on-surface'}">${priv.costo != null ? `${dineroPanel(ganancia)} ${esc(tienda().moneda || '')}` : '—'}</strong></span>
      <span class="font-body-md text-body-md">Margen Bruto: <strong class="tnum ${margen != null && margen < 15 ? 'text-error' : 'text-secondary'}">${margen != null ? `${margen.toFixed(1)}%` : 'Ingresa el costo'}</strong></span>
    </div>`);
}

function htmlGaleria() {
  const imgs = p.imagenes || [];
  return seccion(3, 'photo_library', 'Galería de Fotos & Recursos Multimedia', 'Sube hasta 8 imágenes. La foto principal es la que se ve en el catálogo y en WhatsApp.', `
    <label id="zonaFotos" class="flex flex-col items-center justify-center gap-1 p-6 rounded-2xl border-2 border-dashed border-[#CBD5E1] bg-[#F8FAFC] hover:border-primary hover:bg-primary/5 cursor-pointer transition-colors text-center ${imgs.length >= 8 ? 'hidden' : ''}">
      ${ico('cloud_upload', 'text-[36px] text-primary')}
      <span class="font-label-lg text-label-lg text-on-surface">Arrastra tus imágenes aquí o <span class="text-primary underline">explora tus archivos</span></span>
      <span class="font-body-sm text-body-sm text-outline">Formatos soportados: WEBP, PNG, JPG. Se optimizan solas. Aspecto recomendado 1:1 o 4:5.</span>
      <input type="file" id="archivosFotos" accept="image/*" multiple class="sr-only"></label>
    <div class="flex items-center justify-between gap-2"><span id="estadoFotos" class="font-label-md text-label-md text-primary flex items-center gap-2"></span>
      <button type="button" data-accion="galeria" class="btn-secundario btn-sm">${ico('perm_media', 'text-[16px]')}Elegir de la galería</button></div>
    ${imgs.length ? `<div id="rejillaFotos" class="grid grid-cols-2 sm:grid-cols-4 gap-space-sm">${imgs.map((im, i) => `<div class="rounded-xl overflow-hidden bg-surface-container-low shadow-sm ${i === 0 ? 'ring-2 ring-primary' : ''}" draggable="true" data-foto="${i}">
        <div class="relative aspect-square bg-surface-container"><img src="${esc(urlImagen(im.mini || im.url))}" alt="${esc(im.alt || '')}" class="w-full h-full object-cover pointer-events-none">
          ${i === 0 ? `<span class="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-primary text-on-primary font-label-sm text-label-sm flex items-center gap-0.5">${ico('star', 'text-[12px]', true)}Principal</span>` : `<button type="button" data-principal="${i}" class="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-white/90 text-on-surface font-label-sm text-label-sm hover:bg-white">Hacer Principal</button>`}
          <div class="absolute top-1.5 right-1.5 flex gap-1">
            <span class="w-7 h-7 rounded-lg bg-white/90 flex items-center justify-center text-on-surface-variant cursor-grab" title="Arrastra para ordenar">${ico('drag_indicator', 'text-[16px]')}</span>
            <button type="button" data-quitar-foto="${i}" class="w-7 h-7 rounded-lg bg-white/90 flex items-center justify-center text-error hover:bg-white" aria-label="Quitar foto">${ico('delete', 'text-[16px]')}</button></div></div>
        <div class="flex items-center gap-1 px-2 py-1.5"><button type="button" data-mover-foto="${i}:-1" class="btn-icono w-7 h-7" aria-label="Mover a la izquierda" ${i === 0 ? 'disabled' : ''}>${ico('chevron_left', 'text-[16px]')}</button>
          <span class="flex-1 truncate font-label-sm text-label-sm text-on-surface-variant text-center" title="${esc(im.alt || '')}">${esc(im.alt || `foto-${i + 1}`)}</span>
          <button type="button" data-mover-foto="${i}:1" class="btn-icono w-7 h-7" aria-label="Mover a la derecha" ${i === imgs.length - 1 ? 'disabled' : ''}>${ico('chevron_right', 'text-[16px]')}</button></div></div>`).join('')}</div>`
      : `<p class="font-body-sm text-body-sm text-outline text-center">Este producto aún no tiene fotos. Sin foto se muestra el logo de la tienda.</p>`}`,
  `<span class="font-label-sm text-label-sm uppercase tracking-wider text-outline tnum">${imgs.length} / 8 subidas</span>`);
}

function estadoVariante(v) {
  if (!p.rastrear_stock) return '<span class="chip-gris">Sin control</span>';
  if (num(v.stock) > 0) return '<span class="chip-verde">Disponible</span>';
  return p.al_agotarse === 'preventa' ? '<span class="chip-azul">Preventa</span>' : '<span class="chip-rojo">Sin Stock</span>';
}

function htmlInventario() {
  const conVariantes = (p.variantes || []).length > 0;
  const total = conVariantes ? p.variantes.reduce((s, v) => s + Math.max(0, num(v.stock)), 0) : num(p.stock);
  const opciones = [['bloquear', 'Bloquear consultas', 'El botón de WhatsApp se cambia por "Avisarme" y se muestra "Agotado".'], ['preventa', 'Permitir Preventa', 'Acepta pedidos informando entrega estimada en 7 a 10 días hábiles.'], ['continuar', 'Consulta Continua', 'Sigue recibiendo pedidos en WhatsApp sin advertir inventario.']];
  return seccion(4, 'inventory_2', 'Inventario, Stock & Disponibilidad', 'Reglas automáticas de reserva y avisos de stock mínimo. Cada cambio queda en el kárdex.', `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-space-md ${p.rastrear_stock ? '' : 'opacity-50'}">
      <div><span class="block font-label-lg text-label-lg text-on-surface mb-1.5">Stock Total Disponible <span class="text-error">*</span></span>
        <div class="flex items-center gap-1">
          <button type="button" data-stock="-1" class="btn-secundario w-11 px-0" ${conVariantes || !p.rastrear_stock ? 'disabled' : ''} aria-label="Restar">-</button>
          <input name="stock" type="number" min="0" step="1" class="campo text-center tnum" value="${total}" ${conVariantes || !p.rastrear_stock ? 'disabled' : ''} aria-label="Stock total">
          <button type="button" data-stock="1" class="btn-secundario w-11 px-0" ${conVariantes || !p.rastrear_stock ? 'disabled' : ''} aria-label="Sumar">+</button></div>
        <p class="ayuda">${conVariantes ? 'Suma de todas las variantes (edítalas abajo).' : esNuevo ? 'Se registra como "Stock inicial" en el kárdex.' : 'El cambio se registra como ajuste en el kárdex.'}</p></div>
      <div><label class="block font-label-lg text-label-lg text-on-surface mb-1.5" for="c_stock_minimo">Alerta de Stock Mínimo</label>
        <input id="c_stock_minimo" name="stock_minimo" type="number" min="0" step="1" class="campo tnum" value="${p.stock_minimo ?? 5}">
        <p class="ayuda">Aviso en el panel al llegar a este umbral.</p></div>
      <div><label class="block font-label-lg text-label-lg text-on-surface mb-1.5" for="c_ubicacion">Ubicación en Bodega / Almacén</label>
        <div class="relative">${ico('location_on', 'absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]')}<input id="c_ubicacion" name="ubicacion" class="campo pl-10" value="${esc(priv.ubicacion || '')}" maxlength="120" placeholder="Pasillo A - Estante 4"></div>
        <p class="ayuda">Para logística y empaque rápido (privado).</p></div>
    </div>
    <label class="flex items-center gap-2.5 cursor-pointer"><input type="checkbox" class="interruptor" name="rastrear_stock" ${p.rastrear_stock ? 'checked' : ''}><span class="font-label-lg text-label-lg">Rastrear Stock</span>
      <span class="font-body-sm text-body-sm text-outline">(apágalo para productos por encargo o servicios)</span></label>
    <div><p class="font-label-lg text-label-lg text-on-surface mb-2">Comportamiento cuando el stock se agote (0 unidades):</p>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-space-sm">${opciones.map(([v, t, d]) => `<label class="flex gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${p.al_agotarse === v ? 'border-primary bg-primary/5' : 'border-[#E2E8F0] hover:bg-[#F8FAFC]'}">
        <input type="radio" name="al_agotarse" value="${v}" ${p.al_agotarse === v ? 'checked' : ''} class="mt-1 accent-primary"><span><span class="block font-label-lg text-label-lg text-on-surface">${t}</span><span class="block font-body-sm text-body-sm text-on-surface-variant">${d}</span></span></label>`).join('')}</div></div>`);
}

function htmlVariantes() {
  const variantes = p.variantes || [];
  return seccion(5, 'style', 'Variantes & Atributos del Producto', 'Gestiona colores, tallas o modelos con inventario individual, y la ficha técnica.', `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-space-md">
      ${[['marca', 'Marca', 'SoundMaster'], ['modelo', 'Modelo', 'ANC-900 Pro'], ['material', 'Material', 'Aluminio'], ['peso', 'Peso Total', '245 gramos']].map(([k, t, ph]) => `<div><label class="block font-label-md text-label-md text-on-surface mb-1.5" for="c_${k}">${t}</label><input id="c_${k}" name="${k}" class="campo" value="${esc(p[k] || '')}" placeholder="${ph}" maxlength="80"></div>`).join('')}
    </div>
    <div class="rounded-xl border border-[#E2E8F0] overflow-hidden">
      <div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 bg-[#F8FAFC] border-b border-[#E2E8F0]">
        <span class="font-label-lg text-label-lg text-on-surface">Variantes (${variantes.length})</span>
        <div class="flex gap-1.5"><button type="button" data-accion="variosVariantes" class="btn-secundario btn-sm">${ico('playlist_add', 'text-[16px]')}Agregar varias</button>
          <button type="button" data-accion="nuevaVariante" class="btn-primario btn-sm">${ico('add', 'text-[16px]')}Nueva Variante</button></div></div>
      ${variantes.length ? `<div class="overflow-x-auto"><table class="w-full text-left min-w-[720px]"><thead><tr class="bg-white text-outline font-label-sm text-label-sm uppercase tracking-wider">
          <th class="py-2.5 px-3">Variante / Color</th><th class="py-2.5 px-3">SKU Específico</th><th class="py-2.5 px-3 w-28">Precio Extra</th><th class="py-2.5 px-3 w-28">Stock</th><th class="py-2.5 px-3">Estado</th><th class="py-2.5 px-3 text-right">Acción</th></tr></thead>
        <tbody class="divide-y divide-[#F1F5F9]">${variantes.map((v, i) => `<tr data-variante="${i}">
          <td class="py-2 px-3"><div class="flex items-center gap-2"><label class="relative w-8 h-8 rounded-lg border border-[#E2E8F0] cursor-pointer shrink-0 overflow-hidden" title="Color (opcional)" style="background:${esc(v.color || '#ffffff')}">
              ${v.color ? '' : `<span class="absolute inset-0 flex items-center justify-center text-outline">${ico('palette', 'text-[16px]')}</span>`}<input type="color" data-v="color" value="${esc(v.color || '#ffffff')}" class="sr-only"></label>
            <div class="flex flex-col gap-1 min-w-[150px]"><input data-v="nombre" class="campo h-9 lg:h-9" value="${esc(v.nombre)}" placeholder="Negro, Talla 40…" maxlength="40">
              <input data-v="detalle" class="campo h-8 lg:h-8 font-body-sm text-body-sm" value="${esc(v.detalle || '')}" placeholder="Detalle (opcional)" maxlength="40"></div>
            ${v.color ? `<button type="button" data-v-sin-color class="btn-icono w-7 h-7" title="Quitar color">${ico('format_color_reset', 'text-[16px]')}</button>` : ''}</div></td>
          <td class="py-2 px-3"><input data-v="sku" class="campo h-9 lg:h-9 font-mono text-[13px] uppercase" value="${esc(v.sku || '')}" placeholder="${esc(`${p.sku || 'SKU'}-${String(i + 1).padStart(2, '0')}`)}" maxlength="40"></td>
          <td class="py-2 px-3"><input data-v="precio_extra" type="number" step="0.01" class="campo h-9 lg:h-9 tnum" value="${num(v.precio_extra)}"></td>
          <td class="py-2 px-3"><input data-v="stock" type="number" min="0" step="1" class="campo h-9 lg:h-9 tnum" value="${num(v.stock)}" ${p.rastrear_stock ? '' : 'disabled'}></td>
          <td class="py-2 px-3">${estadoVariante(v)}</td>
          <td class="py-2 px-3 text-right"><button type="button" data-quitar-variante="${i}" class="btn-icono hover:text-error" aria-label="Quitar variante">${ico('delete', 'text-[18px]')}</button></td></tr>`).join('')}</tbody></table></div>`
        : `<p class="px-4 py-6 text-center font-body-sm text-body-sm text-outline">Sin variantes: el producto se vende tal cual. Agrega colores o tallas si el cliente debe elegir.</p>`}
    </div>
    ${listaEditable('destacados', 'Puntos destacados (máx. 4, se ven en la pestaña Descripción)', p.destacados || [], (x, i) => `<div class="grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-center" data-fila-lista="destacados:${i}">
        <button type="button" data-icono-destacado="${i}" class="w-11 h-11 rounded-lg border border-[#E2E8F0] flex items-center justify-center text-primary hover:bg-primary/5" title="Cambiar icono">${ico(x.icono || 'verified', 'text-[22px]')}</button>
        <input data-l="titulo" class="campo" value="${esc(x.titulo || '')}" placeholder="32h Autonomía" maxlength="40"><input data-l="detalle" class="campo" value="${esc(x.detalle || '')}" placeholder="Con estuche" maxlength="40">
        <button type="button" data-quitar-lista="destacados:${i}" class="btn-icono hover:text-error" aria-label="Quitar">${ico('close', 'text-[18px]')}</button></div>`, (p.destacados || []).length < 4)}
    ${listaEditable('especificaciones', 'Ficha técnica (pestaña Especificaciones)', p.especificaciones || [], (x, i) => `<div class="grid grid-cols-[1fr_2fr_auto] gap-2 items-center" data-fila-lista="especificaciones:${i}">
        <input data-l="nombre" class="campo" value="${esc(x.nombre || '')}" placeholder="Conectividad" maxlength="40"><input data-l="valor" class="campo" value="${esc(x.valor || '')}" placeholder="Bluetooth 5.3" maxlength="120">
        <button type="button" data-quitar-lista="especificaciones:${i}" class="btn-icono hover:text-error" aria-label="Quitar">${ico('close', 'text-[18px]')}</button></div>`)}
    ${listaEditable('garantias', 'Opciones de garantía / cobertura (la primera es la incluida)', p.garantias || [], (x, i) => `<div class="grid grid-cols-[1fr_140px_auto] gap-2 items-center" data-fila-lista="garantias:${i}">
        <input data-l="nombre" class="campo" value="${esc(x.nombre || '')}" placeholder="Extendida 12 Meses" maxlength="40"><input data-l="precio_extra" type="number" step="0.01" min="0" class="campo tnum" value="${num(x.precio_extra)}" title="Precio extra">
        <button type="button" data-quitar-lista="garantias:${i}" class="btn-icono hover:text-error" aria-label="Quitar">${ico('close', 'text-[18px]')}</button></div>`)}
    <div><div class="flex items-center justify-between mb-2"><span class="font-label-lg text-label-lg text-on-surface">Productos relacionados ("Completa tu equipo")</span>
        <button type="button" data-accion="relacionados" class="btn-secundario btn-sm">${ico('add_link', 'text-[16px]')}Elegir</button></div>
      <div class="flex flex-wrap gap-2">${(p.relacionados || []).map((rid) => todos.find((x) => x.id === rid)).filter(Boolean).map((r) => `<span class="inline-flex items-center gap-2 pl-1 pr-1.5 py-1 rounded-full bg-surface-container-low">
          <img src="${esc(urlImagen(r.imagenes?.[0]?.mini || r.imagenes?.[0]?.url))}" alt="" class="w-7 h-7 rounded-full object-cover bg-surface-container"><span class="font-label-md text-label-md">${esc(r.nombre)}</span>
          <button type="button" data-quitar-rel="${r.id}" class="w-5 h-5 rounded-full hover:bg-surface-container-high flex items-center justify-center" aria-label="Quitar">${ico('close', 'text-[14px]')}</button></span>`).join('') || '<p class="font-body-sm text-body-sm text-outline">Si no eliges, la tienda sugiere productos de la misma categoría.</p>'}</div></div>`,
  '');
}

function listaEditable(clave, titulo, filas, fila, puedeAgregar = true) {
  return `<div><div class="flex items-center justify-between mb-2"><span class="font-label-lg text-label-lg text-on-surface">${titulo}</span>
      ${puedeAgregar ? `<button type="button" data-agregar-lista="${clave}" class="btn-fantasma btn-sm">${ico('add', 'text-[16px]')}Agregar</button>` : ''}</div>
    <div class="flex flex-col gap-2">${filas.map(fila).join('') || '<p class="font-body-sm text-body-sm text-outline">Vacío.</p>'}</div></div>`;
}

function htmlLateral() {
  const vis = [['publicado', 'Público en Tienda Web', 'check_circle', 'text-secondary'], ['borrador', 'Borrador Privado', 'lock', 'text-outline'], ['oculto', 'Oculto del Catálogo', 'visibility_off', 'text-outline']];
  return `<div class="bg-surface-container-lowest rounded-xl p-space-md sm:p-space-lg shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <h3 class="font-headline-sm text-headline-sm text-on-surface mb-space-sm flex items-center gap-space-xs">${ico('public', 'text-primary text-[20px]')}<span>Visibilidad &amp; Canales</span></h3>
      <div class="space-y-space-md">
        <div class="space-y-2">${vis.map(([v, t, icono, color]) => `<label class="flex items-center justify-between p-2.5 rounded-xl ${p.estado === v ? 'bg-primary/10 ring-1 ring-primary/30' : 'bg-surface-container-low hover:bg-surface-container'} cursor-pointer transition-colors">
          <span class="flex items-center gap-space-xs"><input type="radio" name="estado" value="${v}" ${p.estado === v ? 'checked' : ''} class="accent-primary"><span class="font-label-lg text-label-lg text-on-surface">${t}</span></span>
          ${ico(icono, `${p.estado === v ? color : 'text-outline'} text-[18px]`, p.estado === v)}</label>`).join('')}
          ${p.estado === 'archivado' ? `<p class="font-label-md text-label-md text-error">Este producto está archivado. Elige una opción para restaurarlo.</p>` : ''}</div>
        <label class="p-space-sm rounded-xl bg-wa/10 flex items-center justify-between gap-space-xs cursor-pointer">
          <span class="flex items-center gap-space-xs">${ico('chat', 'text-secondary text-[22px]')}<span><span class="block font-label-md text-label-md font-bold text-on-surface">Incluir en catálogo de WhatsApp</span>
            <span class="block font-body-sm text-body-sm text-outline">Exportable a Meta Commerce Manager</span></span></span>
          <input type="checkbox" class="interruptor checked:!bg-wa" name="en_catalogo_wa" ${p.en_catalogo_wa ? 'checked' : ''}></label>
        <div class="space-y-2 pt-1">${[['destacado', 'Marcar como Producto Destacado en Inicio'], ['novedad', 'Etiqueta "Novedad / Lanzamiento"'], ['relampago', 'Participa en "Ofertas Relámpago"'], ['envio_gratis', 'Envío gratis en este producto']]
          .map(([k, t]) => `<label class="flex items-center gap-space-xs cursor-pointer font-label-md text-label-md text-on-surface"><input type="checkbox" name="${k}" ${p[k] ? 'checked' : ''} class="w-4 h-4 rounded accent-primary"><span>${t}</span></label>`).join('')}</div>
        <div class="bg-surface-container-low p-space-sm rounded-xl space-y-1">
          <div class="flex justify-between font-label-sm text-label-sm"><span class="text-outline">Última edición:</span><span class="text-on-surface font-semibold">${esNuevo ? 'Sin guardar' : esc(hace(p.actualizado_en))}</span></div>
          <div class="flex justify-between font-label-sm text-label-sm"><span class="text-outline">Editor responsable:</span><span class="text-on-surface font-semibold">${esc(esNuevo ? `${admin().nombre} (Tú)` : `${p.actualizado_por || 'Sistema'}${p.actualizado_por === admin().nombre ? ' (Tú)' : ''}`)}</span></div>
          ${!esNuevo ? `<div class="flex justify-between font-label-sm text-label-sm"><span class="text-outline">Unidades vendidas:</span><span class="text-on-surface font-semibold tnum">${p.ventas || 0}</span></div>` : ''}
        </div>
      </div></div>
    <div class="bg-surface-container-lowest rounded-xl p-space-md sm:p-space-lg shadow-[0_1px_3px_rgba(15,23,42,0.04)]" id="vistaPrevia">${htmlVistaPrevia()}</div>
    ${!esNuevo ? `<div class="bg-surface-container-lowest rounded-xl p-space-md shadow-[0_1px_3px_rgba(15,23,42,0.04)] flex items-center justify-between gap-2">
      <div><p class="font-label-lg text-label-lg text-on-surface">¿Archivar o Desactivar?</p><p class="font-body-sm text-body-sm text-outline">No se perderá el historial de pedidos</p></div>
      <button type="button" data-accion="archivar" class="btn-secundario btn-sm">${ico('archive', 'text-[16px]')}Archivar</button></div>` : ''}`;
}

function htmlVistaPrevia() {
  const cat = categorias.find((c) => c.id === p.categoria_id);
  const img = (p.imagenes || [])[0];
  const pct = descuentoPct(p);
  const total = (p.variantes || []).length ? p.variantes.reduce((s, v) => s + Math.max(0, num(v.stock)), 0) : num(p.stock);
  const v0 = (p.variantes || [])[0];
  const msg = plantilla(tienda().plantilla_producto || 'Hola {tienda}, me interesa el producto: {producto} (SKU: {sku}){opciones}. Cantidad: {cantidad} por {total}.', {
    tienda: tienda().nombre, producto: p.nombre || 'Nombre del producto', sku: v0?.sku || p.sku || 'SKU', opciones: v0 ? `, opción: ${v0.nombre}` : '',
    cantidad: 1, total: dineroPanel(precioVigente(p) + num(v0?.precio_extra)), precio: dineroPanel(precioVigente(p)), enlace: ruta(`producto.html?p=${p.slug || ''}`),
  });
  return `<div class="flex items-center justify-between mb-space-sm"><h3 class="font-headline-sm text-headline-sm text-on-surface flex items-center gap-space-xs">${ico('smartphone', 'text-primary text-[20px]')}<span>Previsualización en Vivo</span></h3>
      <span class="px-2 py-0.5 rounded bg-surface-container text-primary font-label-sm text-label-sm font-bold">Ficha Móvil</span></div>
    <p class="font-body-sm text-body-sm text-outline mb-space-md">Así experimenta el cliente esta ficha en la tienda pública:</p>
    <div class="w-full max-w-[280px] mx-auto bg-surface-container-lowest rounded-xl overflow-hidden shadow-md">
      <div class="relative aspect-square bg-surface-container">${img ? `<img class="w-full h-full object-cover" src="${esc(urlImagen(img.mini || img.url))}" alt="">` : `<div class="w-full h-full flex items-center justify-center text-outline">${ico('image', 'text-[40px]')}</div>`}
        <div class="absolute top-2 left-2 flex flex-col gap-1">${pct ? `<span class="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-label-sm font-bold shadow-sm">-${pct}% OFF</span>` : ''}
          ${p.destacado ? '<span class="px-2 py-0.5 rounded-full bg-surface-container-lowest/90 text-primary font-label-sm text-label-sm font-bold shadow-sm">DESTACADO</span>' : ''}
          ${p.novedad ? '<span class="px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant font-label-sm text-label-sm font-bold shadow-sm">NOVEDAD</span>' : ''}</div>
        <span class="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-wa text-white flex items-center justify-center shadow-wa">${ico('chat', 'text-[18px]', true)}</span></div>
      <div class="p-3 space-y-1"><p class="font-label-sm text-label-sm text-primary uppercase tracking-wider">${esc(cat?.nombre || 'Sin categoría')}</p>
        <h4 class="font-subheading text-subheading text-on-surface line-clamp-2">${esc(p.nombre || 'Nombre del producto')}</h4>
        <div class="flex items-baseline gap-1.5"><span class="font-headline-sm text-headline-sm text-primary tnum">${dineroPanel(precioVigente(p))}</span>${pct ? `<span class="font-label-sm text-label-sm text-outline line-through tnum">${dineroPanel(p.precio)}</span>` : ''}</div>
        <div class="flex items-center gap-2 font-label-sm text-label-sm text-on-surface-variant"><span>${p.rastrear_stock ? `${total} disp.` : 'Disponible'}</span>${(p.variantes || []).length ? `<span>•</span><span>${p.variantes.length} variantes</span>` : ''}</div></div></div>
    <div class="mt-space-md p-space-sm rounded-xl bg-wa-burbuja text-wa-oscuro">
      <p class="font-label-sm text-label-sm font-bold mb-1">Mensaje Autogenerado WhatsApp:</p>
      <p class="font-body-sm text-body-sm leading-snug break-words">"${esc(msg)}"</p></div>
    <div class="flex items-center justify-between mt-2 font-label-sm text-label-sm"><span class="text-outline">Plantilla de alta conversión</span><a href="configuracion.html#mensajes" class="text-primary hover:underline">Configurar formato</a></div>`;
}

function pintar() {
  const [tEstado] = { publicado: ['Publicado'], borrador: ['Borrador'], oculto: ['Pausado'], archivado: ['Archivado'] }[p.estado] || [''];
  const desc = { publicado: ['Activo en Catálogo Online', 'Visible en la tienda pública', 'bg-wa'], borrador: ['Borrador privado', 'No se muestra en la tienda hasta que lo publiques', 'bg-outline'], oculto: ['Pausado', 'Oculto en la tienda; conserva sus datos', 'bg-[#F59E0B]'], archivado: ['Archivado', 'Fuera del catálogo y del panel', 'bg-error'] }[p.estado];
  contenido.innerHTML = `
    <div class="px-space-md lg:px-margin-desktop py-space-md bg-surface-container-lowest shadow-[0_1px_4px_rgba(19,27,46,0.04)] sticky top-16 z-30">
      <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-space-sm max-w-[1600px] mx-auto">
        <div class="flex flex-col gap-0.5 min-w-0">
          <div class="flex items-center gap-space-xs text-outline font-label-md text-label-md min-w-0"><a href="productos.html" class="hover:text-primary">Catálogo</a>${ico('chevron_right', 'text-[14px]')}<a href="productos.html" class="hover:text-primary hidden sm:inline">Gestión de Productos</a>${ico('chevron_right', 'text-[14px] hidden sm:inline')}
            <span class="text-on-surface font-semibold truncate">${esNuevo ? 'Nuevo producto' : `Editar: ${esc(original.nombre)}`}</span></div>
          <div class="flex items-center gap-space-sm flex-wrap"><h1 class="font-headline-md text-headline-md text-on-surface tracking-tight">${esNuevo ? 'Nuevo Producto' : 'Editar Producto'}</h1>
            ${esNuevo ? '<span class="chip-azul">Sin guardar</span>' : chipProducto(original.estado)}
            <span id="indicadorCambios" class="${sucio ? '' : 'hidden'} chip-ambar normal-case tracking-normal">Cambios sin guardar</span></div></div>
        <div class="flex items-center flex-wrap gap-space-xs">
          <a href="productos.html" data-accion="descartar" class="px-space-md py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface-variant font-label-lg text-label-lg transition-colors flex items-center gap-space-xs">${ico('close', 'text-[18px]')}<span>Descartar</span></a>
          <button type="button" data-guardar="borrador" class="px-space-md py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-lg text-label-lg transition-colors flex items-center gap-space-xs">${ico('bookmark', 'text-[18px]')}<span class="hidden sm:inline">Guardar Borrador</span></button>
          <button type="button" data-accion="vistaPrevia" class="px-space-md py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-primary font-label-lg text-label-lg transition-colors flex items-center gap-space-xs">${ico('visibility', 'text-[18px]')}<span>Vista Previa</span></button>
          <button type="button" data-guardar="actual" class="px-space-lg py-2 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-label-lg text-label-lg shadow-sm hover:shadow-md transition-all flex items-center gap-space-xs">${ico('check_circle', 'text-[20px]', true)}<span class="font-bold">${p.estado === 'publicado' ? 'Publicar / Guardar' : 'Guardar'}</span></button>
        </div></div></div>
    <div class="px-space-md lg:px-margin-desktop pt-space-md max-w-[1600px] mx-auto">
      <div class="w-full bg-secondary-container/20 rounded-xl p-space-sm sm:px-space-md flex flex-wrap items-center justify-between gap-space-sm">
        <div class="flex items-center gap-space-sm"><div class="w-8 h-8 rounded-lg bg-wa/20 text-secondary flex items-center justify-center shrink-0">${ico('sync', 'text-[20px]', true)}</div>
          <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-space-sm"><span class="font-label-lg text-label-lg font-bold text-on-surface">${desc[0]}</span><span class="hidden sm:inline text-outline text-[12px]">•</span>
            <div class="flex items-center gap-1 text-on-surface-variant font-body-sm text-body-sm"><span class="w-2 h-2 rounded-full ${desc[2]}"></span><span>${desc[1]}${esNuevo ? '' : ` (actualizado ${esc(hace(original.actualizado_en).toLowerCase())})`}</span></div></div></div>
        <div class="flex items-center gap-space-sm"><span class="font-mono text-label-sm px-space-xs py-1 rounded bg-surface-container-lowest text-on-surface font-semibold shadow-sm">SKU: ${esc(p.sku || '—')}</span>
          ${esNuevo ? '' : `<span class="font-label-sm text-label-sm text-outline">ID: ${esc(id.slice(0, 8))}</span><a href="inventario.html?producto=${id}" class="font-label-sm text-label-sm text-primary hover:underline">Ver kárdex</a>`}</div></div></div>
    <form id="formProducto" novalidate class="px-space-md lg:px-margin-desktop py-space-md grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start max-w-[1600px] mx-auto">
      <div class="lg:col-span-8 flex flex-col gap-space-lg min-w-0">${htmlInformacion()}${htmlPrecios()}${htmlGaleria()}${htmlInventario()}${htmlVariantes()}</div>
      <div class="lg:col-span-4 flex flex-col gap-space-lg lg:sticky lg:top-40">${htmlLateral()}
        <div class="flex gap-2 lg:hidden"><button type="button" data-guardar="borrador" class="btn-secundario flex-1">Guardar Borrador</button><button type="button" data-guardar="actual" class="btn-primario flex-1">${ico('check', 'text-[18px]')}${p.estado === 'publicado' ? 'Publicar' : 'Guardar'}</button></div>
      </div>
    </form>`;
}

// ---------------- Lectura del formulario ----------------
function leerFormulario() {
  const form = $('#formProducto');
  if (!form) return;
  const valor = (n) => form.elements[n]?.value;
  p.nombre = (valor('nombre') ?? p.nombre).trim();
  p.sku = (valor('sku') ?? p.sku).trim().toUpperCase();
  p.codigo_barras = (valor('codigo_barras') ?? '').trim() || null;
  p.categoria_id = valor('categoria_id') || null;
  p.subcategoria = (valor('subcategoria') ?? '').trim() || null;
  p.descripcion_corta = (valor('descripcion_corta') ?? '').trim() || null;
  if (form.elements.descripcion) p.descripcion = form.elements.descripcion.value.trim() || null;
  p.precio = num(valor('precio'));
  priv.costo = valor('costo') === '' || valor('costo') == null ? null : num(valor('costo'));
  p.oferta_activa = form.elements.oferta_activa.checked;
  p.precio_oferta = valor('precio_oferta') === '' ? null : num(valor('precio_oferta'));
  p.oferta_inicio = valor('oferta_inicio') || null;
  p.oferta_fin = valor('oferta_fin') || null;
  p.rastrear_stock = form.elements.rastrear_stock.checked;
  if (!(p.variantes || []).length && form.elements.stock && !form.elements.stock.disabled) p.stock = Math.max(0, Math.round(num(valor('stock'))));
  p.stock_minimo = Math.max(0, Math.round(num(valor('stock_minimo'))));
  priv.ubicacion = (valor('ubicacion') ?? '').trim() || null;
  p.al_agotarse = form.querySelector('[name="al_agotarse"]:checked')?.value || 'bloquear';
  ['marca', 'modelo', 'material', 'peso'].forEach((k) => { p[k] = (valor(k) ?? '').trim() || null; });
  p.estado = form.querySelector('[name="estado"]:checked')?.value || p.estado;
  ['en_catalogo_wa', 'destacado', 'novedad', 'relampago', 'envio_gratis'].forEach((k) => { p[k] = form.elements[k].checked; });
  $$('[data-variante]', form).forEach((fila) => {
    const v = p.variantes[Number(fila.dataset.variante)];
    fila.querySelectorAll('[data-v]').forEach((el) => {
      const k = el.dataset.v;
      if (k === 'color') { if (v.color || el.value !== '#ffffff') v.color = el.value; return; }
      v[k] = ['precio_extra', 'stock'].includes(k) ? (k === 'stock' ? Math.max(0, Math.round(num(el.value))) : num(el.value)) : el.value.trim();
    });
  });
  $$('[data-fila-lista]', form).forEach((fila) => {
    const [clave, i] = fila.dataset.filaLista.split(':');
    const x = p[clave][Number(i)];
    fila.querySelectorAll('[data-l]').forEach((el) => { x[el.dataset.l] = el.dataset.l === 'precio_extra' ? num(el.value) : el.value.trim(); });
  });
  if (!slugManual) p.slug = slug(p.nombre);
}

const refrescarVista = debounce(() => {
  leerFormulario();
  $('#vistaPrevia').innerHTML = htmlVistaPrevia();
  if ($('#vistaSlug')) $('#vistaSlug').textContent = p.slug || 'se-genera-del-nombre';
}, 250);

/** Repinta todo conservando el scroll. Quien llama debe haber hecho leerFormulario() ANTES de cambiar `p`. */
function repintar() { const y = window.scrollY; pintar(); window.scrollTo(0, y); }

// ---------------- Guardar ----------------
async function slugLibre(base) {
  const existentes = new Set((await db.leer('mt_productos', `select=slug,id&slug=like.${encodeURIComponent(base)}*`)).filter((x) => x.id !== id).map((x) => x.slug));
  if (!existentes.has(base)) return base;
  for (let i = 2; i < 200; i++) if (!existentes.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now().toString(36)}`;
}

function validar() {
  const errores = [];
  if (p.nombre.length < 2) errores.push('Escribe el nombre del producto.');
  if (!p.sku) errores.push('Escribe un SKU (o usa Auto-generar).');
  if (categorias.length && !p.categoria_id) errores.push('Elige una categoría.');
  if (!(p.precio >= 0)) errores.push('El precio debe ser un número mayor o igual a 0.');
  if (p.oferta_activa) {
    if (p.precio_oferta == null) errores.push('Escribe el precio de oferta o desactiva la oferta.');
    else if (p.precio_oferta >= p.precio) errores.push('El precio de oferta debe ser menor al precio regular.');
    if (p.oferta_inicio && p.oferta_fin && p.oferta_inicio > p.oferta_fin) errores.push('La fecha de fin de la oferta es anterior a la de inicio.');
  }
  const nombres = (p.variantes || []).map((v) => v.nombre.trim().toLowerCase());
  if (nombres.some((n) => !n)) errores.push('Todas las variantes necesitan un nombre.');
  if (new Set(nombres).size !== nombres.length) errores.push('Hay variantes con el mismo nombre.');
  if ((p.garantias || []).some((g) => !g.nombre)) errores.push('Las opciones de garantía necesitan nombre.');
  return errores;
}

async function guardar(modo) {
  leerFormulario();
  if (modo === 'borrador') p.estado = 'borrador';
  const errores = validar();
  if (errores.length) { toast(errores[0], { tipo: 'error', duracion: 5000 }); return null; }
  const botones = $$('[data-guardar]');
  botones.forEach((b) => { b.disabled = true; });
  const principal = $('[data-guardar="actual"]');
  const antes = principal?.innerHTML;
  if (principal) principal.innerHTML = `${spinner()} Guardando…`;
  try {
    p.slug = slugManual ? slug(p.slug) || slug(p.nombre) : slug(p.nombre);
    p.slug = await slugLibre(p.slug || `producto-${Date.now().toString(36)}`);
    p.destacados = (p.destacados || []).filter((x) => x.titulo).slice(0, 4);
    p.especificaciones = (p.especificaciones || []).filter((x) => x.nombre && x.valor);
    p.variantes = (p.variantes || []).map((v, i) => ({ ...v, nombre: v.nombre.trim(), sku: (v.sku || `${p.sku}-${String(i + 1).padStart(2, '0')}`).toUpperCase() }));
    const campos = ['slug', 'sku', 'codigo_barras', 'nombre', 'marca', 'modelo', 'material', 'peso', 'categoria_id', 'subcategoria', 'descripcion_corta', 'descripcion', 'etiquetas', 'destacados', 'especificaciones', 'imagenes', 'garantias', 'relacionados', 'precio', 'precio_oferta', 'oferta_activa', 'oferta_inicio', 'oferta_fin', 'stock_minimo', 'rastrear_stock', 'al_agotarse', 'estado', 'destacado', 'novedad', 'relampago', 'en_catalogo_wa', 'envio_gratis'];
    const fila = Object.fromEntries(campos.map((k) => [k, p[k] ?? (Array.isArray(VACIO[k]) ? [] : null)]));
    const ajustes = [];
    let productoId = id;
    if (esNuevo) {
      fila.stock = 0;
      fila.variantes = p.variantes.map((v) => ({ ...v, stock: 0 }));
      const [creado] = await db.crear('mt_productos', [fila]);
      productoId = creado.id;
      if (p.rastrear_stock) {
        if (p.variantes.length) p.variantes.forEach((v) => { if (num(v.stock) > 0) ajustes.push([v.nombre, num(v.stock), 'entrada', 'Stock inicial']); });
        else if (num(p.stock) > 0) ajustes.push([null, num(p.stock), 'entrada', 'Stock inicial']);
      }
    } else {
      // El stock no se escribe directo: se conserva el actual y la diferencia se registra con mt_ajustar_stock.
      const viejas = new Map((original.variantes || []).map((v) => [v.nombre, num(v.stock)]));
      fila.variantes = p.variantes.map((v) => ({ ...v, stock: viejas.has(v.nombre) ? viejas.get(v.nombre) : 0 }));
      if (p.rastrear_stock) {
        if (p.variantes.length) {
          p.variantes.forEach((v) => {
            const antesV = viejas.has(v.nombre) ? viejas.get(v.nombre) : 0;
            const delta = num(v.stock) - antesV;
            if (delta) ajustes.push([v.nombre, delta, viejas.has(v.nombre) ? 'ajuste' : 'entrada', viejas.has(v.nombre) ? 'Ajuste desde el editor' : 'Stock inicial de la variante']);
          });
        } else if (!(original.variantes || []).length) {
          const delta = num(p.stock) - num(original.stock);
          if (delta) ajustes.push([null, delta, 'ajuste', 'Ajuste desde el editor']);
        } else if (num(p.stock) > 0) {
          fila.stock = 0;
          ajustes.push([null, num(p.stock), 'entrada', 'Stock tras quitar variantes']);
        }
      }
      await db.actualizar('mt_productos', `id=eq.${id}`, fila);
    }
    await db.upsert('mt_productos_privado', [{ producto_id: productoId, costo: priv.costo, ubicacion: priv.ubicacion, notas: priv.notas || null }], 'producto_id');
    for (const [variante, delta, tipo, motivo] of ajustes) {
      await db.rpc('mt_ajustar_stock', { p_producto: productoId, p_variante: variante, p_delta: delta, p_tipo: tipo, p_motivo: motivo, p_referencia: null });
    }
    sucio = false;
    toast(p.estado === 'publicado' ? 'Producto guardado y publicado en la tienda' : 'Producto guardado');
    return productoId;
  } catch (e) {
    toastError(e);
    return null;
  } finally {
    botones.forEach((b) => { b.disabled = false; });
    if (principal && document.body.contains(principal)) principal.innerHTML = antes;
  }
}

// ---------------- Fotos ----------------
async function subirFotos(archivos) {
  const lista = [...archivos].filter((a) => a.type.startsWith('image/'));
  const espacio = 8 - (p.imagenes || []).length;
  if (!lista.length) return;
  if (lista.length > espacio) toast(`Sólo caben ${espacio} fotos más (máximo 8).`, { tipo: 'info' });
  const estado = $('#estadoFotos');
  for (const [i, a] of lista.slice(0, espacio).entries()) {
    estado.innerHTML = `${spinner()} Subiendo ${i + 1} de ${Math.min(lista.length, espacio)}…`;
    try {
      const r = await subirImagen(a, 'productos');
      leerFormulario();
      p.imagenes = [...(p.imagenes || []), { url: r.url, mini: r.mini, alt: p.nombre || r.alt }];
      marcarSucio();
    } catch (e) { toastError(e); }
  }
  estado.innerHTML = '';
  repintar();
}

// ---------------- Eventos ----------------
pintar();
contenido.addEventListener('input', (e) => {
  const t = e.target;
  marcarSucio();
  const contador = t.name && $(`[data-contador="${t.name}"]`);
  if (contador) contador.textContent = `${t.value.length} / ${t.maxLength}`;
  if (t.id === 'nuevaEtiqueta') return;
  refrescarVista();
});
contenido.addEventListener('change', (e) => {
  const t = e.target;
  marcarSucio();
  if (t.id === 'archivosFotos') { subirFotos(t.files); return; }
  if (['oferta_activa', 'rastrear_stock', 'estado', 'al_agotarse'].includes(t.name) || t.dataset.v === 'stock' || t.dataset.v === 'color') { leerFormulario(); repintar(); return; }
  refrescarVista();
});
contenido.addEventListener('keydown', (e) => {
  if (e.target.id === 'nuevaEtiqueta' && (e.key === 'Enter' || e.key === ',')) {
    e.preventDefault();
    const v = e.target.value.trim().replace(/,$/, '');
    if (v && !(p.etiquetas || []).includes(v)) { leerFormulario(); p.etiquetas = [...(p.etiquetas || []), v].slice(0, 20); marcarSucio(); repintar(); $('#nuevaEtiqueta')?.focus(); }
    else e.target.value = '';
  }
  if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.id !== 'nuevaEtiqueta') e.preventDefault();
});

contenido.addEventListener('click', async (e) => {
  const t = e.target;
  const accion = t.closest('[data-accion]')?.dataset.accion;
  try {
    if (accion === 'descartar') {
      e.preventDefault();
      if (sucio && !(await confirmar({ titulo: '¿Descartar los cambios?', mensaje: 'Perderás lo que no hayas guardado.', boton: 'Descartar', peligro: true }))) return;
      sucio = false;
      location.href = 'productos.html';
      return;
    }
    if (accion) e.preventDefault();
    if (accion === 'autoSku') {
      leerFormulario();
      const cat = categorias.find((c) => c.id === p.categoria_id);
      const pref = (cat?.slug || p.nombre || 'PRD').replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
      p.sku = `${pref}-${slug(p.nombre).split('-').filter(Boolean).slice(0, 1).join('').slice(0, 4).toUpperCase() || 'ART'}-${String(Math.floor(Math.random() * 900) + 100)}`;
      marcarSucio(); repintar(); return;
    }
    if (accion === 'editarSlug') {
      leerFormulario();
      const r = await modal({
        titulo: 'Dirección del producto', icono: 'link', textoEnviar: 'Usar esta dirección',
        subtitulo: 'Es la parte final del enlace que compartes. Cambiarla rompe los enlaces viejos.',
        contenido: `<label class="etiqueta" for="nuevoSlug">Slug</label><input id="nuevoSlug" name="slug" class="campo font-mono" value="${esc(p.slug || slug(p.nombre))}" required>`,
        alEnviar: (form) => { const s = slug(form.slug.value); if (!s) throw new Error('Escribe una dirección válida'); return s; },
      });
      if (r && r !== true) { p.slug = r; slugManual = true; marcarSucio(); $('#vistaSlug').textContent = r; }
      return;
    }
    if (accion === 'vistaPrevia') {
      const ventana = window.open('', '_blank');
      const nuevoId = sucio || esNuevo ? await guardar('actual') : id;
      if (!nuevoId) { ventana?.close(); return; }
      const url = ruta(`producto.html?p=${encodeURIComponent(p.slug)}&vista_previa=1`);
      if (ventana) ventana.location.href = url; else window.open(url, '_blank');
      if (esNuevo) location.replace(`producto.html?id=${nuevoId}`);
      return;
    }
    if (accion === 'galeria') {
      const elegidas = await elegirImagenes({ multiple: true, carpeta: 'productos', titulo: 'Agregar fotos del producto' });
      if (!elegidas || elegidas === true) return;
      leerFormulario();
      p.imagenes = [...(p.imagenes || []), ...elegidas.map((x) => ({ ...x, alt: p.nombre || x.alt }))].slice(0, 8);
      marcarSucio(); repintar(); return;
    }
    if (accion === 'nuevaVariante') { leerFormulario(); p.variantes = [...(p.variantes || []), { nombre: '', detalle: '', sku: '', precio_extra: 0, stock: 0 }]; marcarSucio(); repintar(); $$('[data-v="nombre"]').pop()?.focus(); return; }
    if (accion === 'variosVariantes') {
      const r = await modal({
        titulo: 'Agregar varias variantes', icono: 'playlist_add', textoEnviar: 'Agregar',
        contenido: `<label class="etiqueta" for="lista">Nombres separados por coma</label><input id="lista" name="lista" class="campo" placeholder="Talla 38, Talla 39, Talla 40" required>
          <p class="ayuda">Ejemplos: "S, M, L, XL" o "Negro, Blanco, Azul". Luego completa el stock de cada una.</p>`,
        alEnviar: (form) => form.lista.value.split(',').map((x) => x.trim()).filter(Boolean),
      });
      if (!Array.isArray(r) || !r.length) return;
      leerFormulario();
      const existentes = new Set((p.variantes || []).map((v) => v.nombre.toLowerCase()));
      p.variantes = [...(p.variantes || []), ...r.filter((n) => !existentes.has(n.toLowerCase())).map((nombre) => ({ nombre, detalle: '', sku: '', precio_extra: 0, stock: 0 }))];
      marcarSucio(); repintar(); return;
    }
    if (accion === 'relacionados') {
      leerFormulario();
      const candidatos = todos.filter((x) => x.id !== id);
      const elegidos = new Set(p.relacionados || []);
      const r = await modal({
        titulo: 'Productos relacionados', icono: 'add_link', ancho: 'lg', textoEnviar: 'Guardar selección',
        contenido: `<input type="search" data-q class="campo mb-3" placeholder="Buscar producto...">
          <div data-lista class="flex flex-col gap-1 max-h-[50vh] overflow-y-auto">${candidatos.map((x) => `<label class="flex items-center gap-3 p-2 rounded-xl hover:bg-[#F8FAFC] cursor-pointer" data-nombre="${esc(x.nombre.toLowerCase())}">
            <input type="checkbox" value="${x.id}" ${elegidos.has(x.id) ? 'checked' : ''} class="w-4 h-4 accent-primary">
            <img src="${esc(urlImagen(x.imagenes?.[0]?.mini || x.imagenes?.[0]?.url))}" alt="" class="w-10 h-10 rounded-lg object-cover bg-surface-container">
            <span class="flex-1 min-w-0"><span class="block font-label-lg text-label-lg truncate">${esc(x.nombre)}</span><span class="block font-mono text-label-sm text-outline">${esc(x.sku)}</span></span></label>`).join('')}</div>`,
        alAbrir: (capa) => capa.querySelector('[data-q]').addEventListener('input', (ev) => {
          const q = ev.target.value.toLowerCase();
          capa.querySelectorAll('[data-nombre]').forEach((el) => { el.hidden = q && !el.dataset.nombre.includes(q); });
        }),
        alEnviar: (form) => [...form.querySelectorAll('input[type=checkbox]:checked')].map((c) => c.value),
      });
      if (!Array.isArray(r)) return;
      p.relacionados = r; marcarSucio(); repintar(); return;
    }
    if (accion === 'archivar') {
      if (!(await confirmar({ titulo: '¿Archivar este producto?', mensaje: 'Saldrá de la tienda y del listado. Podrás restaurarlo desde el filtro "Archivados".', boton: 'Archivar', icono: 'archive' }))) return;
      await db.actualizar('mt_productos', `id=eq.${id}`, { estado: 'archivado' });
      sucio = false; toast('Producto archivado'); location.href = 'productos.html'; return;
    }
    const g = t.closest('[data-guardar]');
    if (g) {
      const nuevoId = await guardar(g.dataset.guardar);
      if (nuevoId) location.replace(`producto.html?id=${nuevoId}`);
      return;
    }
    const vd = t.closest('[data-vista-desc]');
    if (vd) { leerFormulario(); vistaDescripcion = vd.dataset.vistaDesc; repintar(); return; }
    const md = t.closest('[data-md]');
    if (md) { aplicarMarkdown(md.dataset.md); return; }
    const qe = t.closest('[data-quitar-etiqueta]');
    if (qe) { leerFormulario(); p.etiquetas.splice(Number(qe.dataset.quitarEtiqueta), 1); marcarSucio(); repintar(); return; }
    const st = t.closest('[data-stock]');
    if (st) { leerFormulario(); p.stock = Math.max(0, num(p.stock) + Number(st.dataset.stock)); marcarSucio(); repintar(); return; }
    const pr = t.closest('[data-principal]');
    if (pr) { leerFormulario(); const i = Number(pr.dataset.principal); p.imagenes.unshift(...p.imagenes.splice(i, 1)); marcarSucio(); repintar(); return; }
    const qf = t.closest('[data-quitar-foto]');
    if (qf) { leerFormulario(); p.imagenes.splice(Number(qf.dataset.quitarFoto), 1); marcarSucio(); repintar(); toast('Foto quitada del producto (sigue en la galería)', { tipo: 'info' }); return; }
    const mf = t.closest('[data-mover-foto]');
    if (mf) { leerFormulario(); const [i, d] = mf.dataset.moverFoto.split(':').map(Number); const [x] = p.imagenes.splice(i, 1); p.imagenes.splice(i + d, 0, x); marcarSucio(); repintar(); return; }
    const qv = t.closest('[data-quitar-variante]');
    if (qv) {
      leerFormulario();
      const v = p.variantes[Number(qv.dataset.quitarVariante)];
      if (num(v.stock) > 0 && !(await confirmar({ titulo: `¿Quitar "${v.nombre}"?`, mensaje: `Tiene ${v.stock} unidades. Al guardar se descontarán del stock.`, boton: 'Quitar', peligro: true }))) return;
      p.variantes.splice(Number(qv.dataset.quitarVariante), 1); marcarSucio(); repintar(); return;
    }
    if (t.closest('[data-v-sin-color]')) { leerFormulario(); const i = Number(t.closest('[data-variante]').dataset.variante); delete p.variantes[i].color; marcarSucio(); repintar(); return; }
    const al = t.closest('[data-agregar-lista]');
    if (al) { leerFormulario(); const k = al.dataset.agregarLista; p[k] = [...(p[k] || []), k === 'destacados' ? { icono: 'verified', titulo: '', detalle: '' } : k === 'garantias' ? { nombre: '', precio_extra: 0 } : { nombre: '', valor: '' }]; marcarSucio(); repintar(); return; }
    const ql = t.closest('[data-quitar-lista]');
    if (ql) { leerFormulario(); const [k, i] = ql.dataset.quitarLista.split(':'); p[k].splice(Number(i), 1); marcarSucio(); repintar(); return; }
    const icd = t.closest('[data-icono-destacado]');
    if (icd) { leerFormulario(); const i = Number(icd.dataset.iconoDestacado); const n = await elegirIcono(p.destacados[i].icono); if (n && n !== true) { p.destacados[i].icono = n; marcarSucio(); repintar(); } return; }
    const qr = t.closest('[data-quitar-rel]');
    if (qr) { leerFormulario(); p.relacionados = p.relacionados.filter((x) => x !== qr.dataset.quitarRel); marcarSucio(); repintar(); }
  } catch (err) { toastError(err); }
});

function aplicarMarkdown(tipo) {
  const ta = $('#c_descripcion');
  if (!ta) return;
  const [ini, fin] = [ta.selectionStart, ta.selectionEnd];
  const sel = ta.value.slice(ini, fin) || { negrita: 'texto', cursiva: 'texto', titulo: 'Título', lista: 'elemento', numerada: 'elemento', enlace: 'texto' }[tipo];
  const nuevo = { negrita: `**${sel}**`, cursiva: `*${sel}*`, titulo: `\n### ${sel}\n`, lista: `\n- ${sel}`, numerada: `\n1. ${sel}`, enlace: `[${sel}](https://)` }[tipo];
  ta.setRangeText(nuevo, ini, fin, 'end');
  ta.focus();
  marcarSucio();
}

// Arrastrar y soltar: archivos sobre la zona y reordenar fotos
contenido.addEventListener('dragover', (e) => { if (e.target.closest('#zonaFotos') || e.target.closest('[data-foto]')) e.preventDefault(); });
contenido.addEventListener('drop', (e) => {
  const zona = e.target.closest('#zonaFotos');
  if (zona && e.dataTransfer.files.length) { e.preventDefault(); subirFotos(e.dataTransfer.files); return; }
  const destino = e.target.closest('[data-foto]');
  const origen = e.dataTransfer.getData('text/foto');
  if (destino && origen !== '') {
    e.preventDefault();
    leerFormulario();
    const [x] = p.imagenes.splice(Number(origen), 1);
    p.imagenes.splice(Number(destino.dataset.foto), 0, x);
    marcarSucio(); repintar();
  }
});
contenido.addEventListener('dragstart', (e) => { const f = e.target.closest?.('[data-foto]'); if (f) e.dataTransfer.setData('text/foto', f.dataset.foto); });
