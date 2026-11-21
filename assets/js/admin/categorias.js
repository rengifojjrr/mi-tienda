// Categorías del catálogo: alta y edición (nombre, slug, descripción, icono e imagen), orden
// (el mismo que ve el cliente), visibilidad, destacadas en la portada y borrado
// (la base pone categoria_id en null: los productos quedan sin categoría, no se borran).
import { $, $$, esc, ico, slug } from '../util.js';
import { db, urlImagen, ruta } from '../api.js';
import { iniciarPanel } from './base.js';
import { modal, confirmar, toast, toastError, vacio, elegirImagenes, elegirIcono, leerFormulario } from './ui.js';

await iniciarPanel({ seccion: 'categorias', migas: [{ texto: 'Catálogo', href: 'productos.html' }, { texto: 'Categorías' }], area: 'catalogo' });
const contenido = $('#contenido');

let categorias = [];      // en el mismo orden que la tienda (orden, nombre)
let conteo = new Map();   // categoria_id → nº de productos (sin contar archivados)
let sinCategoria = 0;
let cargado = false;
let ocupado = false;      // evita dos cambios de orden a la vez

// ---------------- Utilidades ----------------
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const nombreIcono = (n) => String(n || '').replace(/[^a-z0-9_]/g, '').slice(0, 40) || 'category';
const aSlug = (t) => slug(t).replace(/-+$/, '');
const enlaceTienda = (c) => ruta(`catalogo.html?cat=${encodeURIComponent(c.slug)}`);

/** Lee todas las filas aunque pasen del máximo que devuelve el servidor por consulta. */
async function leerTodo(tabla, consulta) {
  const { filas, total } = await db.leerConTotal(tabla, consulta);
  while (filas.length < total) {
    const mas = await db.leer(tabla, `${consulta}&offset=${filas.length}`);
    if (!mas.length) break;
    filas.push(...mas);
  }
  return filas;
}

/** Enfoca el primer elemento visible y activo (la tabla y las tarjetas repiten los mismos controles). */
function enfocar(...selectores) {
  for (const s of selectores) {
    const el = $$(s, contenido).find((x) => x.offsetParent !== null && !x.disabled);
    if (el) { el.focus(); return true; }
  }
  return false;
}

// Con un modal encima de otro (elegir icono o imagen dentro del formulario), Escape cierra sólo el de arriba.
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const capas = $$('.z-\\[110\\]');
  if (capas.length < 2) return;
  e.stopPropagation();
  capas[capas.length - 1].querySelector('[data-cerrar]')?.click();
}, true);

// ---------------- Piezas visuales ----------------
function miniatura(c, tam) {
  return `<div class="${tam} rounded-xl overflow-hidden bg-surface-container-high flex items-center justify-center shrink-0 ${c.visible ? '' : 'opacity-60'}">
    ${c.imagen_url ? `<img src="${esc(urlImagen(c.imagen_url))}" alt="" class="w-full h-full object-cover" loading="lazy">` : ico(nombreIcono(c.icono), 'text-primary text-[24px]')}</div>`;
}

const chips = (c) => `${c.visible ? '' : `<span class="chip-gris">${ico('visibility_off', 'text-[13px]')}Oculta</span>`}${c.ejemplo ? '<span class="chip-violeta">Ejemplo</span>' : ''}`;

const interruptor = (c, campo) => `<input type="checkbox" class="interruptor align-middle" data-campo="${campo}" data-id="${esc(c.id)}" ${c[campo] ? 'checked' : ''}
  aria-label="${campo === 'visible' ? 'Visible en la tienda' : 'Destacada en la portada'}: ${esc(c.nombre)}">`;

function botonesOrden(c, i) {
  const boton = (accion, icono, texto, deshabilitado) => `<button type="button" data-accion="${accion}" data-id="${esc(c.id)}" ${deshabilitado ? 'disabled' : ''}
    class="w-7 h-7 rounded-md flex items-center justify-center text-outline hover:text-primary hover:bg-surface-container transition-colors disabled:opacity-30 disabled:pointer-events-none"
    title="${texto}" aria-label="${texto} ${esc(c.nombre)}">${ico(icono, 'text-[18px]')}</button>`;
  return `<div class="flex items-center">${boton('subir', 'arrow_upward', 'Subir', i === 0)}${boton('bajar', 'arrow_downward', 'Bajar', i === categorias.length - 1)}</div>`;
}

const acciones = (c) => `<div class="flex items-center justify-end gap-0.5">
    <a href="${esc(enlaceTienda(c))}" target="_blank" rel="noopener" class="btn-icono w-8 h-8 hover:text-secondary" title="${c.visible ? 'Ver en tienda' : 'Ver en tienda (oculta: tus clientes no la ven)'}" aria-label="Ver ${esc(c.nombre)} en la tienda">${ico('open_in_new', 'text-[18px]')}</a>
    <button type="button" data-accion="editar" data-id="${esc(c.id)}" class="btn-icono w-8 h-8 hover:text-primary" title="Editar" aria-label="Editar ${esc(c.nombre)}">${ico('edit', 'text-[18px]')}</button>
    <button type="button" data-accion="borrar" data-id="${esc(c.id)}" class="btn-icono w-8 h-8 hover:text-error hover:bg-error-container/40" title="Eliminar" aria-label="Eliminar ${esc(c.nombre)}">${ico('delete', 'text-[18px]')}</button>
  </div>`;

function encabezado() {
  return `<div class="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md">
    <div class="space-y-1">
      <span class="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-bold">Catálogo</span>
      <h1 class="font-headline-lg-mobile text-headline-lg-mobile lg:font-headline-lg lg:text-headline-lg text-on-surface tracking-tight">Categorías</h1>
      <p class="font-body-md text-body-md text-on-surface-variant max-w-2xl">Agrupa tus productos para que tus clientes encuentren todo más rápido. El orden de esta lista es el mismo que ven en la tienda.</p>
    </div>
    <div class="flex flex-wrap items-center gap-space-sm">
      <a href="${esc(ruta('categorias.html'))}" target="_blank" rel="noopener" class="flex items-center gap-space-xs px-3.5 py-2.5 rounded-xl bg-surface-container-lowest hover:bg-surface-container-low text-on-surface font-label-md text-label-md shadow-sm transition-all">${ico('open_in_new', 'text-[18px] text-on-surface-variant')}<span>Ver en la tienda</span></a>
      <button type="button" data-accion="nueva" class="flex items-center gap-space-xs px-space-md py-2.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-label-lg text-label-lg shadow-sm transition-all active:scale-95">${ico('add', 'text-[20px]')}<span>Nueva categoría</span></button>
    </div>
  </div>`;
}

function resumen() {
  const visibles = categorias.filter((c) => c.visible).length;
  const destacadas = categorias.filter((c) => c.destacada && c.visible).length;
  const cifra = (titulo, valor, extra, icono, color) => `<div class="bg-surface-container-lowest p-space-sm sm:p-space-md rounded-xl shadow-sm flex items-center justify-between gap-2">
      <div class="min-w-0"><span class="font-label-sm text-label-sm uppercase tracking-wider text-outline">${titulo}</span>
        <p class="font-headline-md text-headline-md text-on-surface tnum">${valor} <span class="font-body-sm text-body-sm text-outline font-normal">${extra}</span></p></div>
      <div class="w-10 h-10 rounded-xl ${color} flex items-center justify-center shrink-0">${ico(icono, 'text-[22px]')}</div></div>`;
  return `<div class="grid grid-cols-2 lg:grid-cols-4 gap-space-sm">
    ${cifra('Categorías', categorias.length, categorias.length === 1 ? 'creada' : 'creadas', 'category', 'bg-surface-container-low text-primary')}
    ${cifra('Visibles', visibles, `de ${categorias.length}`, 'visibility', 'bg-secondary-container/30 text-on-secondary-container')}
    ${cifra('En portada', destacadas, destacadas ? '' : '(se ven todas)', 'star', 'bg-tertiary-fixed text-on-tertiary-fixed-variant')}
    ${cifra('Sin categoría', sinCategoria, sinCategoria === 1 ? 'producto' : 'productos', 'help', sinCategoria ? 'bg-[#FFFBEB] text-[#B45309]' : 'bg-surface-container-low text-outline')}
  </div>`;
}

function filaTabla(c, i) {
  const n = conteo.get(c.id) || 0;
  return `<tr>
    <td class="w-[92px]"><div class="flex items-center gap-1"><span class="w-6 text-center font-label-md text-label-md text-outline tnum">${i + 1}</span>${botonesOrden(c, i)}</div></td>
    <td><div class="flex items-center gap-3 min-w-[240px]">${miniatura(c, 'w-12 h-12')}
      <div class="min-w-0"><div class="flex items-center gap-2 flex-wrap"><span class="font-label-lg text-label-lg text-on-surface">${esc(c.nombre)}</span>${chips(c)}</div>
        <p class="font-mono text-[12px] leading-4 text-outline truncate">${esc(c.slug)}</p>
        ${c.descripcion ? `<p class="font-body-sm text-body-sm text-on-surface-variant line-clamp-1 max-w-xl">${esc(c.descripcion)}</p>` : ''}</div></div></td>
    <td class="text-right"><span class="font-label-lg text-label-lg tnum ${n ? 'text-on-surface' : 'text-outline'}">${n}</span></td>
    <td class="text-center">${interruptor(c, 'visible')}</td>
    <td class="text-center">${interruptor(c, 'destacada')}</td>
    <td class="text-right">${acciones(c)}</td></tr>`;
}

function tarjeta(c, i) {
  const n = conteo.get(c.id) || 0;
  return `<div class="bg-surface-container-lowest rounded-xl shadow-sm p-3 md:p-4 flex flex-col md:flex-row md:items-center gap-3">
    <div class="flex items-center gap-3 flex-1 min-w-0">
      ${miniatura(c, 'w-14 h-14')}
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5 flex-wrap"><span class="font-label-lg text-label-lg text-on-surface">${esc(c.nombre)}</span>${chips(c)}</div>
        <p class="font-mono text-[12px] leading-4 text-outline truncate">${esc(c.slug)}</p>
        <p class="font-body-sm text-body-sm text-on-surface-variant">${plural(n, 'producto', 'productos')}</p>
      </div>
      <div class="flex items-center shrink-0 md:order-first"><span class="w-5 text-center font-label-md text-label-md text-outline tnum">${i + 1}</span>${botonesOrden(c, i)}</div>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-2.5 md:pt-0 border-t md:border-0 border-surface-container">
      <div class="flex items-center gap-4">
        <label class="flex items-center gap-2 font-label-md text-label-md text-on-surface-variant cursor-pointer">${interruptor(c, 'visible')}Visible</label>
        <label class="flex items-center gap-2 font-label-md text-label-md text-on-surface-variant cursor-pointer">${interruptor(c, 'destacada')}En portada</label>
      </div>
      ${acciones(c)}
    </div></div>`;
}

function pintar() {
  cargado = true;
  const lista = categorias.length
    ? `<section class="flex flex-col gap-3" aria-label="Lista de categorías">
        <div class="hidden xl:block bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
          <table class="tabla"><thead><tr>
            <th>Orden</th><th>Categoría</th><th class="text-right">Productos</th>
            <th class="text-center" title="Si está apagado, la categoría no aparece en la tienda">Visible</th>
            <th class="text-center" title="Aparece en la fila de categorías del inicio">En portada</th>
            <th class="text-right">Acciones</th></tr></thead>
            <tbody>${categorias.map(filaTabla).join('')}</tbody></table>
        </div>
        <div class="xl:hidden flex flex-col gap-3">${categorias.map(tarjeta).join('')}</div>
        <p class="flex items-start gap-1.5 font-body-sm text-body-sm text-on-surface-variant">${ico('info', 'text-[18px] text-outline')}
          <span>Usa las flechas para cambiar el orden. Las categorías ocultas no aparecen en la tienda, pero sus productos siguen publicados.
          Si ninguna está en portada, el inicio muestra todas. El conteo no incluye productos archivados.${sinCategoria ? ` Tienes ${plural(sinCategoria, 'producto', 'productos')} sin categoría: asígnalos desde <a href="productos.html" class="text-primary font-semibold hover:underline">Productos</a>.` : ''}</span></p>
      </section>`
    : `<div class="bg-surface-container-lowest rounded-xl shadow-sm">${vacio({
      icono: 'category', titulo: 'Todavía no hay categorías',
      texto: 'Crea la primera para ordenar tu catálogo y que tus clientes puedan filtrar por tipo de producto.',
      accion: `<button type="button" data-accion="nueva" class="btn-primario">${ico('add', 'text-[18px]')}Nueva categoría</button>`,
    })}</div>`;
  contenido.innerHTML = `${encabezado()}${resumen()}${lista}`;
}

function pintarError(e) {
  contenido.innerHTML = `${encabezado()}<div class="bg-surface-container-lowest rounded-xl shadow-sm">${vacio({
    icono: 'cloud_off', titulo: 'No se pudieron cargar las categorías', texto: esc(e.message),
    accion: '<button type="button" data-accion="recargar" class="btn-primario">Reintentar</button>',
  })}</div>`;
}

// ---------------- Datos ----------------
async function cargar() {
  try {
    const [cats, prods] = await Promise.all([
      db.leer('mt_categorias', 'select=*&order=orden,nombre'),
      leerTodo('mt_productos', 'select=categoria_id&estado=neq.archivado&order=id'),
    ]);
    categorias = cats;
    conteo = new Map();
    sinCategoria = 0;
    for (const p of prods) {
      if (p.categoria_id) conteo.set(p.categoria_id, (conteo.get(p.categoria_id) || 0) + 1);
      else sinCategoria++;
    }
    pintar();
  } catch (e) {
    toastError(e);
    if (!cargado) pintarError(e);
  }
}

// ---------------- Acciones de la lista ----------------
async function alternar(input) {
  const c = categorias.find((x) => x.id === input.dataset.id);
  if (!c) return;
  const campo = input.dataset.campo;
  const valor = input.checked;
  input.disabled = true;
  try {
    await db.actualizar('mt_categorias', `id=eq.${c.id}`, { [campo]: valor });
    c[campo] = valor;
    const textos = campo === 'visible'
      ? [`“${c.nombre}” ya se ve en la tienda`, `“${c.nombre}” quedó oculta en la tienda`]
      : [`“${c.nombre}” aparece en la portada`, `“${c.nombre}” ya no aparece en la portada`];
    toast(valor ? textos[0] : textos[1], { tipo: valor ? 'ok' : 'info' });
  } catch (e) { toastError(e); }
  pintar();
  enfocar(`[data-campo="${campo}"][data-id="${c.id}"]`);
}

/** Sube o baja una categoría. Si hay valores de orden repetidos se renumera la lista (1..n). */
async function mover(id, paso) {
  if (ocupado) return;
  const i = categorias.findIndex((c) => c.id === id);
  const j = i + paso;
  if (i < 0 || j < 0 || j >= categorias.length) return;
  const nueva = [...categorias];
  [nueva[i], nueva[j]] = [nueva[j], nueva[i]];
  const repetidos = new Set(categorias.map((c) => c.orden)).size !== categorias.length;
  const cambios = repetidos
    ? nueva.map((c, k) => [c, k + 1]).filter(([c, o]) => c.orden !== o)
    : [[categorias[i], categorias[j].orden], [categorias[j], categorias[i].orden]];
  ocupado = true;
  try {
    await Promise.all(cambios.map(([c, o]) => db.actualizar('mt_categorias', `id=eq.${c.id}`, { orden: o })));
    cambios.forEach(([c, o]) => { c.orden = o; });
    categorias = nueva;
    pintar();
    const [a, b] = paso < 0 ? ['subir', 'bajar'] : ['bajar', 'subir'];
    enfocar(`[data-accion="${a}"][data-id="${id}"]`, `[data-accion="${b}"][data-id="${id}"]`);
  } catch (e) {
    toastError(e);
    await cargar();
  } finally {
    ocupado = false;
  }
}

/** Si cambia el slug, los banners que apuntaban a la categoría se actualizan para no romper su botón. */
async function actualizarBanners(viejo, nuevo) {
  const filtro = `boton_enlace=eq.${encodeURIComponent(`catalogo.html?cat=${viejo}`)}`;
  try {
    const afectados = await db.leer('mt_banners', `select=id&${filtro}`);
    if (!afectados.length) return;
    await db.actualizar('mt_banners', filtro, { boton_enlace: `catalogo.html?cat=${nuevo}` });
    toast(`También se actualizó el botón de ${plural(afectados.length, 'banner', 'banners')} que apuntaba${afectados.length === 1 ? '' : 'n'} a esta categoría.`, { tipo: 'info' });
  } catch (e) { toastError(e); }
}

async function borrar(c) {
  const activos = conteo.get(c.id) || 0;
  let total = activos;
  let banners = [];
  try {
    [total, banners] = await Promise.all([
      db.contar('mt_productos', `categoria_id=eq.${c.id}`),
      db.leer('mt_banners', `select=id&boton_enlace=eq.${encodeURIComponent(`catalogo.html?cat=${c.slug}`)}`),
    ]);
  } catch { /* se usa el conteo de la lista */ }
  const archivados = Math.max(0, total - activos);
  const partes = [
    total
      ? `<strong class="text-[#0F172A]">${plural(total, 'producto quedará', 'productos quedarán')} sin categoría</strong>${archivados ? ` (incluye ${plural(archivados, 'archivado', 'archivados')})` : ''}. No se borran: podrás asignarles otra desde Productos.`
      : 'Esta categoría no tiene productos.',
  ];
  if (banners.length) partes.push(`${plural(banners.length, 'banner de la portada enlaza', 'banners de la portada enlazan')} a esta categoría: su botón llevará a una página vacía.`);
  partes.push('Esta acción no se puede deshacer.');
  const ok = await confirmar({
    titulo: `¿Eliminar “${c.nombre}”?`, peligro: true, icono: 'delete', boton: 'Eliminar categoría',
    mensaje: partes.map((p) => `<span class="block mt-1.5 first:mt-0">${p}</span>`).join(''),
  });
  if (!ok) return;
  try {
    const r = await db.borrar('mt_categorias', `id=eq.${c.id}`);
    if (Array.isArray(r) && !r.length) throw new Error('No se pudo eliminar: la categoría ya no existe o no tienes permiso.');
    toast(`Categoría “${c.nombre}” eliminada`);
  } catch (e) { toastError(e); }
  await cargar();
}

// ---------------- Formulario (crear / editar) ----------------
const filaInterruptor = (nombre, titulo, ayuda, activo) => `<label class="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] cursor-pointer">
    <span class="min-w-0"><span class="block font-label-lg text-label-lg text-[#0F172A]">${titulo}</span><span class="block font-body-sm text-body-sm text-[#64748B]">${ayuda}</span></span>
    <input type="checkbox" name="${nombre}" class="interruptor" ${activo ? 'checked' : ''}></label>`;

/** Vista previa con el mismo marcado que la tienda (chip de la portada y tarjeta de la página de categorías). */
function vistaCategoria(c, n) {
  const icono = nombreIcono(c.icono);
  const img = c.imagen_url ? esc(urlImagen(c.imagen_url)) : '';
  const nombre = esc(c.nombre || 'Nombre de la categoría');
  return `<div class="flex flex-col items-center w-28 p-3 rounded-xl bg-surface-container-lowest shadow-sm text-center mx-auto">
      <div class="w-16 h-16 rounded-full overflow-hidden bg-surface-container-high p-1 mb-2 flex items-center justify-center">
        ${img ? `<img class="w-full h-full object-cover rounded-full" src="${img}" alt="">` : ico(icono, 'text-primary text-[30px]')}</div>
      <span class="font-label-md text-label-md text-on-surface line-clamp-1">${nombre}</span>
      <span class="font-label-sm text-label-sm text-on-surface-variant">${n} productos</span></div>
    <div class="overflow-hidden rounded-2xl bg-surface-container-lowest shadow-sm flex flex-col w-full max-w-[240px] sm:max-w-none mx-auto">
      <div class="relative aspect-[4/3] bg-surface-container-high overflow-hidden">
        ${img ? `<img src="${img}" alt="" class="w-full h-full object-cover">` : `<div class="w-full h-full flex items-center justify-center">${ico(icono, 'text-[48px] text-primary')}</div>`}
        <div class="absolute inset-0 bg-gradient-to-t from-inverse-surface/70 via-transparent to-transparent"></div>
        <span class="absolute top-2 left-2 w-8 h-8 rounded-full bg-surface/90 text-primary flex items-center justify-center shadow-sm">${ico(icono, 'text-[18px]')}</span>
        <span class="absolute bottom-2 left-3 right-3 font-subheading text-subheading text-white drop-shadow line-clamp-2">${nombre}</span>
      </div>
      <div class="p-2.5 flex flex-col gap-0.5"><span class="font-label-md text-label-md text-primary">${n} productos</span>
        ${c.descripcion ? `<p class="font-body-sm text-body-sm text-on-surface-variant line-clamp-2">${esc(c.descripcion)}</p>` : ''}</div>
    </div>`;
}

async function abrirFormulario(original = null) {
  const nuevo = !original;
  const c = original || { nombre: '', slug: '', descripcion: '', icono: 'category', imagen_url: '', visible: true, destacada: true };
  const n = nuevo ? 0 : conteo.get(c.id) || 0;
  let icono = nombreIcono(c.icono);
  let imagen = c.imagen_url || '';
  // En una categoría nueva el slug se arma solo con el nombre hasta que lo edites. En una existente
  // no cambia solo: cambiarlo rompe los enlaces que ya compartiste.
  let slugManual = !nuevo;

  const r = await modal({
    titulo: nuevo ? 'Nueva categoría' : 'Editar categoría',
    subtitulo: nuevo ? 'Agrupa productos parecidos. Los cambios se ven en la tienda al instante.' : `Editando <strong class="text-[#0F172A]">${esc(c.nombre)}</strong> · ${plural(n, 'producto', 'productos')}`,
    icono: nuevo ? 'add_circle' : 'edit', ancho: 'lg', textoEnviar: nuevo ? 'Crear categoría' : 'Guardar cambios',
    contenido: `<div class="grid gap-5 sm:grid-cols-[minmax(0,1fr)_190px]">
      <div class="flex flex-col gap-4 min-w-0">
        <div><label class="etiqueta" for="catNombre">Nombre *</label>
          <input id="catNombre" name="nombre" class="campo" maxlength="60" required autocomplete="off" value="${esc(c.nombre)}" placeholder="Ej.: Tecnología"></div>
        <div><label class="etiqueta" for="catSlug">Slug (dirección)</label>
          <input id="catSlug" name="slug" class="campo font-mono" maxlength="80" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(c.slug)}" placeholder="se-arma-con-el-nombre">
          <p class="ayuda break-all">Enlace: …/catalogo.html?cat=<strong class="text-[#0F172A]" data-slug-vista></strong></p>
          <p class="ayuda hidden text-[#B45309]" data-aviso-slug>Cambiar el slug rompe los enlaces que ya compartiste. Los banners que apuntan a esta categoría se actualizan solos.</p></div>
        <div><label class="etiqueta" for="catDesc">Descripción</label>
          <textarea id="catDesc" name="descripcion" class="campo" rows="3" maxlength="300" placeholder="Ej.: Audio, relojes inteligentes y accesorios para tu día a día.">${esc(c.descripcion || '')}</textarea>
          <p class="ayuda flex justify-between gap-2"><span>Se muestra en la página de categorías de la tienda.</span><span class="tnum shrink-0" data-cuenta></span></p></div>
        <div class="grid sm:grid-cols-2 gap-3">
          <div><span class="etiqueta">Icono</span>
            <button type="button" data-elegir-icono class="w-full flex items-center gap-2.5 p-1.5 pr-3 rounded-lg border border-[#E2E8F0] bg-white hover:border-primary text-left transition-colors">
              <span class="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0" data-icono-vista></span>
              <span class="flex-1 min-w-0 font-body-sm text-body-sm text-[#64748B] truncate" data-icono-nombre></span>
              <span class="font-label-md text-label-md text-primary shrink-0">Cambiar</span></button>
            <p class="ayuda">Se usa cuando no hay imagen y como insignia.</p></div>
          <div><span class="etiqueta">Imagen</span>
            <div class="flex items-center gap-2.5">
              <div class="w-12 h-12 rounded-lg overflow-hidden bg-[#F1F5F9] flex items-center justify-center shrink-0" data-imagen-vista></div>
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <button type="button" data-elegir-imagen class="btn-secundario btn-sm">${ico('photo_library', 'text-[16px]')}<span data-texto-imagen></span></button>
                <button type="button" data-quitar-imagen class="font-label-md text-label-md text-error hover:underline px-1">Quitar</button>
              </div></div>
            <p class="ayuda">Opcional. Mejor una foto cuadrada.</p></div>
        </div>
        <div class="flex flex-col gap-2">
          ${filaInterruptor('visible', 'Visible en la tienda', 'Si la ocultas, no aparece en el menú ni en los filtros (sus productos siguen publicados).', c.visible)}
          ${filaInterruptor('destacada', 'Destacada en la portada', 'Aparece en la fila de categorías del inicio.', c.destacada)}
        </div>
      </div>
      <div class="flex flex-col gap-2 min-w-0">
        <span class="etiqueta mb-0">Vista previa</span>
        <div class="flex flex-col gap-3 p-3 rounded-2xl bg-surface border border-[#E2E8F0]" data-vista></div>
        <p class="ayuda mt-0" data-nota-vista></p>
      </div>
    </div>`,
    alAbrir: (capa) => {
      const form = $('form', capa);
      const el = form.elements;
      const pintarIcono = () => {
        $('[data-icono-vista]', capa).innerHTML = ico(icono, 'text-[22px]');
        $('[data-icono-nombre]', capa).textContent = icono;
      };
      const pintarImagen = () => {
        $('[data-imagen-vista]', capa).innerHTML = imagen
          ? `<img src="${esc(urlImagen(imagen))}" alt="" class="w-full h-full object-cover">`
          : ico('hide_image', 'text-[22px] text-[#94A3B8]');
        $('[data-texto-imagen]', capa).textContent = imagen ? 'Cambiar' : 'Elegir imagen';
        $('[data-quitar-imagen]', capa).classList.toggle('hidden', !imagen);
      };
      const refrescar = () => {
        const s = aSlug(el.slug.value || el.nombre.value);
        $('[data-slug-vista]', capa).textContent = s || '…';
        $('[data-aviso-slug]', capa).classList.toggle('hidden', nuevo || !s || s === c.slug);
        $('[data-cuenta]', capa).textContent = `${el.descripcion.value.length}/300`;
        $('[data-vista]', capa).innerHTML = vistaCategoria({ nombre: el.nombre.value.trim(), descripcion: el.descripcion.value.trim(), icono, imagen_url: imagen }, n);
        $('[data-nota-vista]', capa).textContent = !el.visible.checked
          ? 'Oculta: tus clientes no la verán.'
          : el.destacada.checked ? 'Se verá en la portada y en la página de categorías.' : 'Se verá en la página de categorías y en los filtros del catálogo.';
      };
      el.nombre.addEventListener('input', () => { if (!slugManual) el.slug.value = aSlug(el.nombre.value); });
      el.slug.addEventListener('input', () => { slugManual = el.slug.value.trim() !== ''; });
      el.slug.addEventListener('blur', () => {
        const s = aSlug(el.slug.value);
        if (s) el.slug.value = s;
        else { slugManual = false; el.slug.value = aSlug(el.nombre.value); }
        refrescar();
      });
      form.addEventListener('input', refrescar);
      form.addEventListener('change', refrescar);
      $('[data-elegir-icono]', capa).addEventListener('click', async () => {
        const elegido = await elegirIcono(icono);
        if (elegido) { icono = nombreIcono(elegido); pintarIcono(); refrescar(); }
      });
      $('[data-elegir-imagen]', capa).addEventListener('click', async () => {
        const elegidas = await elegirImagenes({ carpeta: 'categorias', titulo: 'Imagen de la categoría' });
        if (elegidas?.length) { imagen = elegidas[0].mini || elegidas[0].url; pintarImagen(); refrescar(); }
      });
      $('[data-quitar-imagen]', capa).addEventListener('click', () => { imagen = ''; pintarImagen(); refrescar(); });
      pintarIcono();
      pintarImagen();
      refrescar();
    },
    alEnviar: async (form) => {
      const d = leerFormulario(form);
      if (!d.nombre) throw new Error('Escribe el nombre de la categoría.');
      if (d.nombre.length > 60) throw new Error('El nombre puede tener hasta 60 caracteres.');
      const s = aSlug(d.slug || d.nombre);
      if (!s) throw new Error('El slug necesita al menos una letra o un número.');
      if (categorias.some((x) => x.slug === s && x.id !== c.id)) throw new Error(`Ya existe una categoría con el slug “${s}”. Elige otro.`);
      if (d.descripcion.length > 300) throw new Error('La descripción puede tener hasta 300 caracteres.');
      const fila = {
        nombre: d.nombre, slug: s, descripcion: d.descripcion || null, icono, imagen_url: imagen || null,
        visible: d.visible, destacada: d.destacada,
      };
      if (nuevo) {
        fila.orden = categorias.reduce((m, x) => Math.max(m, Number(x.orden) || 0), 0) + 1;
        await db.crear('mt_categorias', [fila]);
      } else {
        await db.actualizar('mt_categorias', `id=eq.${c.id}`, fila);
        if (s !== c.slug) await actualizarBanners(c.slug, s);
      }
      return fila;
    },
  });
  if (!r) return;
  toast(nuevo ? `Categoría “${r.nombre}” creada` : 'Cambios guardados');
  await cargar();
}

// ---------------- Eventos ----------------
contenido.addEventListener('click', (e) => {
  const b = e.target.closest('[data-accion]');
  if (!b || b.disabled) return;
  const c = categorias.find((x) => x.id === b.dataset.id);
  switch (b.dataset.accion) {
    case 'nueva': abrirFormulario(); break;
    case 'editar': if (c) abrirFormulario(c); break;
    case 'borrar': if (c) borrar(c); break;
    case 'subir': mover(b.dataset.id, -1); break;
    case 'bajar': mover(b.dataset.id, 1); break;
    case 'recargar': cargar(); break;
    default: break;
  }
});
contenido.addEventListener('change', (e) => {
  const input = e.target.closest('input[data-campo]');
  if (input) alternar(input);
});

/** #nueva abre el alta; #<id> o #<slug> abre la edición de esa categoría. */
function revisarHash() {
  let h = '';
  try { h = decodeURIComponent(location.hash.slice(1)); } catch { h = ''; }
  if (!h) return;
  const limpiar = () => {
    history.replaceState(null, '', location.pathname + location.search);
    $('[data-menu-crear]')?.classList.add('hidden'); // si se llegó desde "Crear Nuevo" estando en esta página
  };
  if (h === 'nueva' || h === 'nuevo') { limpiar(); abrirFormulario(); return; }
  const c = categorias.find((x) => x.id === h || x.slug === h);
  if (c) { limpiar(); abrirFormulario(c); }
}
window.addEventListener('hashchange', revisarHash);

await cargar();
revisarHash();
