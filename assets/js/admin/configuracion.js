// Configuración (Sistema): fila única mt_config (id=1), una tarjeta por sección con su propio Guardar.
// Anclas: #tienda #whatsapp #soporte #horario #envios #mensajes #contacto #datos
import { $, $$, esc, ico, dinero, numero, telefonoBonito, urlWhatsApp, plantilla, soloDigitos, slug, descargar } from '../util.js';
import { db, ruta, urlImagen } from '../api.js';
import { iniciarPanel, tienda } from './base.js';
import { modal, confirmar, toast, toastError, elegirImagenes, spinner } from './ui.js';

await iniciarPanel({ seccion: 'configuracion', migas: [{ texto: 'Sistema' }, { texto: 'Configuración' }], area: 'config' });
const raiz = $('#contenido');
const cfg = tienda(); // mismo objeto que usa el armazón del panel

// ---------------- Catálogos ----------------
const SECCIONES = [
  { id: 'tienda', titulo: 'Tienda', icono: 'storefront', texto: 'Nombre, logo, moneda y zona horaria.' },
  { id: 'whatsapp', titulo: 'WhatsApp', icono: 'chat', texto: 'Números que reciben los pedidos y el soporte del panel.' },
  { id: 'horario', titulo: 'Horario', icono: 'schedule', texto: 'Horario de atención y aviso de tienda cerrada.' },
  { id: 'envios', titulo: 'Envíos y precios', icono: 'local_shipping', texto: 'Costo de envío, envío gratis, avisos de precio e inventario.' },
  { id: 'mensajes', titulo: 'Mensajes de WhatsApp', icono: 'forum', texto: 'Textos que la tienda prepara para que el cliente te escriba.' },
  { id: 'contacto', titulo: 'Contacto y redes', icono: 'contact_mail', texto: 'Datos visibles en Soporte y en el pie de la tienda.' },
  { id: 'datos', titulo: 'Datos y respaldo', icono: 'database', texto: 'Datos de ejemplo y copia de seguridad.' },
];
const MONEDAS = [
  ['USD', 'Dólar estadounidense'], ['MXN', 'Peso mexicano'], ['COP', 'Peso colombiano'], ['ARS', 'Peso argentino'],
  ['PEN', 'Sol peruano'], ['CLP', 'Peso chileno'], ['EUR', 'Euro'], ['VES', 'Bolívar venezolano'], ['GTQ', 'Quetzal guatemalteco'],
  ['DOP', 'Peso dominicano'], ['BOB', 'Boliviano'], ['UYU', 'Peso uruguayo'], ['PYG', 'Guaraní paraguayo'], ['CRC', 'Colón costarricense'],
  ['HNL', 'Lempira hondureño'], ['NIO', 'Córdoba nicaragüense'], ['BRL', 'Real brasileño'],
];
const LOCALES = [
  ['es-US', 'Español (Estados Unidos)'], ['es-MX', 'Español (México)'], ['es-CO', 'Español (Colombia)'], ['es-AR', 'Español (Argentina)'],
  ['es-PE', 'Español (Perú)'], ['es-CL', 'Español (Chile)'], ['es-ES', 'Español (España)'], ['es-VE', 'Español (Venezuela)'],
  ['es-419', 'Español (Latinoamérica)'], ['es-GT', 'Español (Guatemala)'], ['es-DO', 'Español (Rep. Dominicana)'], ['es-BO', 'Español (Bolivia)'],
  ['es-UY', 'Español (Uruguay)'], ['es-PY', 'Español (Paraguay)'], ['es-CR', 'Español (Costa Rica)'], ['es-HN', 'Español (Honduras)'],
  ['es-NI', 'Español (Nicaragua)'], ['pt-BR', 'Portugués (Brasil)'],
];
// Formato regional que se sugiere al cambiar de moneda
const LOCALE_SUGERIDO = { USD: 'es-US', MXN: 'es-MX', COP: 'es-CO', ARS: 'es-AR', PEN: 'es-PE', CLP: 'es-CL', EUR: 'es-ES', VES: 'es-VE', GTQ: 'es-GT', DOP: 'es-DO', BOB: 'es-BO', UYU: 'es-UY', PYG: 'es-PY', CRC: 'es-CR', HNL: 'es-HN', NIO: 'es-NI', BRL: 'pt-BR' };
const ZONAS = [
  ['America/New_York', 'Nueva York / Miami (EE. UU. Este)'], ['America/Chicago', 'Chicago / Houston (EE. UU. Centro)'],
  ['America/Los_Angeles', 'Los Ángeles (EE. UU. Pacífico)'], ['America/Mexico_City', 'Ciudad de México'],
  ['America/Guatemala', 'Guatemala'], ['America/Tegucigalpa', 'Tegucigalpa (Honduras)'], ['America/Managua', 'Managua (Nicaragua)'],
  ['America/Costa_Rica', 'San José (Costa Rica)'], ['America/Bogota', 'Bogotá (Colombia)'], ['America/Lima', 'Lima (Perú)'],
  ['America/Caracas', 'Caracas (Venezuela)'], ['America/Santo_Domingo', 'Santo Domingo (Rep. Dominicana)'], ['America/La_Paz', 'La Paz (Bolivia)'],
  ['America/Santiago', 'Santiago (Chile)'], ['America/Asuncion', 'Asunción (Paraguay)'], ['America/Argentina/Buenos_Aires', 'Buenos Aires (Argentina)'],
  ['America/Montevideo', 'Montevideo (Uruguay)'], ['America/Sao_Paulo', 'São Paulo (Brasil)'], ['Europe/Madrid', 'Madrid (España)'],
];
// Textos que usa la tienda si la plantilla está vacía (ver tienda/producto.js y tienda/pedido.js)
const ORIGINALES = {
  plantilla_producto: 'Hola {tienda}, me interesa el producto: {producto} (SKU: {sku}){opciones}. Cantidad: {cantidad} por {total}. ¿Tienen disponibilidad inmediata?',
  plantilla_pedido_inicio: 'Hola {tienda}, quiero confirmar la disponibilidad de mi pedido {numero}:',
  plantilla_pedido_cierre: '¿Me indican los datos para coordinar el envío?',
};
const MARCADORES = {
  plantilla_producto: [['tienda', 'Nombre de tu tienda'], ['producto', 'Nombre del producto'], ['sku', 'SKU del producto o de la variante'], ['opciones', 'Variante y garantía elegidas, p. ej. «, color: Negro»'], ['cantidad', 'Unidades'], ['total', 'Precio × cantidad'], ['precio', 'Precio unitario'], ['enlace', 'Enlace a la ficha del producto']],
  plantilla_pedido_inicio: [['tienda', 'Nombre de tu tienda (va en negrita)'], ['numero', 'Número del pedido, p. ej. WA-1024']],
  plantilla_pedido_cierre: [],
};
const REDES = [
  { id: 'instagram', nombre: 'Instagram', icono: 'photo_camera', dominio: 'instagram.com' },
  { id: 'facebook', nombre: 'Facebook', icono: 'thumb_up', dominio: 'facebook.com' },
  { id: 'tiktok', nombre: 'TikTok', icono: 'music_note', dominio: 'tiktok.com' },
];
const ETIQUETAS_BORRADO = {
  eventos: ['visita o clic', 'visitas y clics'], movimientos: ['movimiento de inventario', 'movimientos de inventario'], pedidos: ['pedido', 'pedidos'],
  clientes: ['cliente', 'clientes'], actividad: ['registro de actividad', 'registros de actividad'], 'reseñas': ['reseña', 'reseñas'],
  productos: ['producto', 'productos'], categorias: ['categoría', 'categorías'], banners: ['banner', 'banners'], promociones: ['promoción', 'promociones'],
};
const TABLAS_RESPALDO = [
  ['mt_config', 'id'], ['mt_categorias', 'id'], ['mt_productos', 'id'], ['mt_productos_privado', 'producto_id'], ['mt_banners', 'id'],
  ['mt_promociones', 'id'], ['mt_testimonios', 'id'], ['mt_contenido', 'clave'], ['mt_clientes', 'id'], ['mt_pedidos', 'id'],
];

// ---------------- Utilidades ----------------
const val = (f, n) => String(f.elements[n]?.value ?? '').trim();
const numONulo = (v) => (v === '' ? null : Number(v));
const formulario = (s) => $(`form[data-form="${s}"]`, raiz);
const horaEn = (zona) => { try { return new Intl.DateTimeFormat('es', { timeZone: zona, weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date()); } catch { return ''; } };
const desfase = (zona) => {
  try { return new Intl.DateTimeFormat('en-US', { timeZone: zona, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value || ''; } catch { return ''; }
};
const opciones = (lista, actual, etiqueta = (c, n) => n) => `${actual && !lista.some(([c]) => c === actual) ? `<option value="${esc(actual)}" selected>${esc(actual)}</option>` : ''}
  ${lista.map(([c, n]) => `<option value="${esc(c)}" ${c === actual ? 'selected' : ''}>${esc(etiqueta(c, n))}</option>`).join('')}`;
const formatoWa = (t) => esc(t)
  .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
  .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?:;])/gm, '$1<em>$2</em>')
  .replace(/~([^~\n]+)~/g, '<s>$1</s>');

function normalizarRed(red, valor) {
  let u = String(valor || '').trim();
  const r = REDES.find((x) => x.id === red);
  if (!u || !r) return u;
  if (u.startsWith('@') || (!u.includes('.') && !u.includes('/') && !u.includes(':'))) {
    const usuario = u.replace(/^@/, '');
    u = red === 'tiktok' ? `https://www.tiktok.com/@${usuario}` : `https://${r.dominio}/${usuario}`;
  } else if (/^http:\/\//i.test(u)) u = u.replace(/^http:\/\//i, 'https://');
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = `https://${u.replace(/^\/+/, '')}`;
  return u;
}

function contar(el) {
  const salida = $(`[data-cuenta="${el.id}"]`, raiz);
  if (salida) salida.textContent = `${el.value.length} / ${el.dataset.contar || el.maxLength}`;
}

function insertar(el, texto) {
  if (!el) return;
  if (document.activeElement !== el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  el.setRangeText(texto, el.selectionStart, el.selectionEnd, 'end');
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Campo de texto con etiqueta, icono opcional a la izquierda y sufijo opcional a la derecha. */
function entrada({ id, nombre, etiqueta, valor = '', tipo = 'text', ayuda = '', attrs = '', obligatorio = false, icono = '', sufijo = '', contarMax = 0 }) {
  return `<div>
    <div class="flex items-center justify-between gap-2 mb-1.5"><label class="etiqueta mb-0" for="${id}">${etiqueta}${obligatorio ? ' <span class="text-error">*</span>' : ''}</label>
      ${contarMax ? `<span data-cuenta="${id}" class="font-label-sm text-label-sm text-outline tnum"></span>` : ''}</div>
    <div class="relative">
      ${icono ? `<span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline flex">${ico(icono, 'text-[20px]')}</span>` : ''}
      <input id="${id}" name="${nombre}" type="${tipo}" class="campo ${icono ? 'pl-10' : ''} ${sufijo ? 'pr-14' : ''}" value="${esc(valor ?? '')}" ${obligatorio ? 'required' : ''} ${contarMax ? `maxlength="${contarMax}" data-contar="${contarMax}"` : ''} ${attrs}>
      ${sufijo ? `<span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-label-md text-label-md text-outline">${sufijo}</span>` : ''}
    </div>
    ${ayuda ? `<p class="ayuda">${ayuda}</p>` : ''}</div>`;
}

// ---------------- Contenido de cada tarjeta ----------------
function cuerpoTienda() {
  return `<div class="flex flex-col sm:flex-row gap-space-md sm:items-start">
      <div class="flex sm:flex-col items-center gap-space-sm shrink-0">
        <div data-logo-vista class="w-24 h-24 rounded-2xl bg-surface-container-low border border-surface-container flex items-center justify-center overflow-hidden"></div>
        <div class="flex flex-col gap-1.5">
          <button type="button" data-elegir-logo class="btn-secundario btn-sm">${ico('add_photo_alternate', 'text-[16px]')}<span>Elegir logo</span></button>
          <button type="button" data-quitar-logo class="btn-fantasma btn-sm text-error hover:bg-error-container/40">${ico('delete', 'text-[16px]')}<span>Quitar logo</span></button>
        </div>
        <input type="hidden" name="logo_url" value="${esc(cfg.logo_url || '')}">
      </div>
      <div class="flex-1 min-w-0 grid grid-cols-1 gap-space-md">
        ${entrada({ id: 'cfgNombre', nombre: 'nombre', etiqueta: 'Nombre de la tienda', valor: cfg.nombre, obligatorio: true, contarMax: 60, attrs: 'autocomplete="organization"', ayuda: 'Aparece en el encabezado, el pie, el panel y en los mensajes de WhatsApp como {tienda}.' })}
        ${entrada({ id: 'cfgEslogan', nombre: 'eslogan', etiqueta: 'Eslogan', valor: cfg.eslogan, attrs: 'maxlength="120" placeholder="Ej: Comercio directo por WhatsApp"', ayuda: 'Subtítulo de la portada cuando no hay banners activos.' })}
        <p class="font-body-sm text-body-sm text-outline -mt-2">Logo: imagen cuadrada de al menos 200 × 200 px. Se usa en la tienda, el ícono de la pestaña y el panel.</p>
      </div>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
      <div><label class="etiqueta" for="cfgMoneda">Moneda</label><select id="cfgMoneda" name="moneda" class="campo">${opciones(MONEDAS, cfg.moneda, (c, n) => `${c} · ${n}`)}</select></div>
      <div><label class="etiqueta" for="cfgLocale">Formato de números y fechas</label><select id="cfgLocale" name="locale" class="campo">${opciones(LOCALES, cfg.locale)}</select></div>
      <div class="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 py-space-sm px-space-md rounded-xl bg-surface-container-low">
        <span class="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1.5">${ico('payments', 'text-[18px] text-primary')}Así se verán tus precios:</span>
        <span data-vista-precio class="font-headline-sm text-headline-sm text-primary tnum"></span></div>
      <div class="sm:col-span-2"><label class="etiqueta" for="cfgZona">Zona horaria</label>
        <select id="cfgZona" name="zona_horaria" class="campo">${opciones(ZONAS, cfg.zona_horaria, (c, n) => `${n}${desfase(c) ? ` · ${desfase(c)}` : ''}`)}</select>
        <p class="ayuda"><span data-vista-hora></span> Se usa para agrupar por hora y día las estadísticas del dashboard.</p></div>
    </div>`;
}

function cuerpoWhatsapp() {
  const numeroWa = (id, nombre, etiqueta, ayuda) => `<div class="flex flex-col gap-1.5">
      <label class="etiqueta mb-0" for="${id}">${etiqueta}</label>
      <div class="relative"><span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-wa flex">${ico('chat', 'text-[20px]', true)}</span>
        <input id="${id}" name="${nombre}" type="tel" inputmode="numeric" autocomplete="off" maxlength="22" class="campo pl-10 tnum" placeholder="Ej: 13055550118" value="${esc(cfg[nombre] || '')}"></div>
      <p class="ayuda mt-0">${ayuda}</p>
      <div data-vista-wa="${nombre}" class="min-h-[32px] flex items-center"></div></div>`;
  return `<div class="grid grid-cols-1 md:grid-cols-2 gap-space-md">
      ${numeroWa('cfgWhatsapp', 'whatsapp', 'Número de ventas', 'Recibe los pedidos y consultas de la tienda. Sólo números, con código de país y sin «+» (EE. UU. 1, México 52, Colombia 57, Venezuela 58…).')}
      <div id="soporte" class="scroll-mt-32 lg:scroll-mt-24 rounded-xl transition-shadow">
        ${numeroWa('cfgSoporte', 'soporte_whatsapp', 'Número de soporte técnico', 'Lo usa el botón «Contactar Soporte» del menú del panel para que tu equipo pida ayuda (a quien administra la tienda o a tu proveedor técnico). Los clientes no lo ven.')}
      </div>
    </div>
    <div class="flex items-start gap-2.5 p-space-sm px-space-md rounded-xl bg-wa/10 text-on-surface">
      ${ico('info', 'text-[20px] text-wa-tinta shrink-0')}
      <p class="font-body-sm text-body-sm">Cada pedido abre WhatsApp con un mensaje listo hacia el número de ventas. <strong>Si lo dejas vacío</strong>, WhatsApp abrirá la lista de contactos y el cliente tendrá que elegir a quién enviarlo manualmente.</p>
    </div>`;
}

function cuerpoHorario() {
  return `${entrada({ id: 'cfgHorario', nombre: 'horario', etiqueta: 'Horario de atención', valor: cfg.horario, attrs: 'maxlength="80" placeholder="Ej: Lunes a Sábado • 9am a 8pm"', icono: 'schedule', ayuda: 'Se muestra en el pie, en Soporte y junto al botón de WhatsApp.' })}
    <label class="flex items-center justify-between gap-space-sm p-space-sm px-space-md rounded-xl bg-surface-container-low cursor-pointer">
      <span class="min-w-0"><span class="block font-label-lg text-label-lg text-on-surface">Tienda abierta</span>
        <span class="block font-body-sm text-body-sm text-outline">Si la cierras, los clientes ven el aviso de abajo y sus pedidos quedan en espera hasta que abras.</span></span>
      <input type="checkbox" name="abierta" class="interruptor" ${cfg.abierta === false ? '' : 'checked'}></label>
    <div>
      <div class="flex items-center justify-between gap-2 mb-1.5"><label class="etiqueta mb-0" for="cfgCerrado">Aviso de tienda cerrada</label><span data-cuenta="cfgCerrado" class="font-label-sm text-label-sm text-outline tnum"></span></div>
      <textarea id="cfgCerrado" name="mensaje_cerrado" class="campo" rows="2" maxlength="200" data-contar="200" placeholder="Ej: Estamos fuera de horario. Deja tu pedido y te respondemos al abrir.">${esc(cfg.mensaje_cerrado || '')}</textarea>
      <p class="ayuda">Vista previa del aviso en la tienda:</p>
      <div data-vista-cerrado class="mt-1.5"></div>
    </div>`;
}

function cuerpoEnvios() {
  const moneda = esc(cfg.moneda || 'USD');
  return `<div class="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
      ${entrada({ id: 'cfgGratis', nombre: 'envio_gratis_desde', etiqueta: 'Envío gratis desde', valor: cfg.envio_gratis_desde ?? '', tipo: 'number', attrs: 'min="0" step="0.01" inputmode="decimal" placeholder="Sin envío gratis"', sufijo: moneda, ayuda: 'Pedidos desde este monto (después de descuentos) no pagan envío. Vacío = no ofreces envío gratis.' })}
      ${entrada({ id: 'cfgCosto', nombre: 'costo_envio', etiqueta: 'Costo de envío', valor: cfg.costo_envio ?? '', tipo: 'number', attrs: 'min="0" step="0.01" inputmode="decimal" placeholder="A coordinar"', sufijo: moneda, ayuda: 'Vacío = «a coordinar por WhatsApp». 0 = envío siempre gratis.' })}
      <div class="sm:col-span-2 flex items-start gap-2 py-space-sm px-space-md rounded-xl bg-surface-container-low font-body-sm text-body-sm text-on-surface-variant">${ico('local_shipping', 'text-[18px] text-primary shrink-0')}<span data-vista-envio></span></div>
      <div class="sm:col-span-2">${entrada({ id: 'cfgNota', nombre: 'nota_precios', etiqueta: 'Nota bajo el precio', valor: cfg.nota_precios, attrs: 'maxlength="140" placeholder="Ej: Precio con IVA incluido y garantía de satisfacción"', icono: 'verified_user', ayuda: 'Aparece debajo del precio en la ficha de cada producto. Déjala vacía para ocultarla.' })}</div>
      ${entrada({ id: 'cfgUmbral', nombre: 'stock_bajo_umbral', etiqueta: 'Aviso de «Pocas unidades»', valor: cfg.stock_bajo_umbral ?? 10, tipo: 'number', obligatorio: true, attrs: 'min="0" step="1" inputmode="numeric"', sufijo: 'u.', ayuda: 'Con este stock o menos, la tienda muestra «Pocas unidades».' })}
      ${entrada({ id: 'cfgBodega', nombre: 'bodega', etiqueta: 'Nombre de la bodega', valor: cfg.bodega, obligatorio: true, attrs: 'maxlength="60" placeholder="Bodega Principal"', icono: 'warehouse', ayuda: 'Tu almacén principal (inventario y movimientos).' })}
    </div>`;
}

function bloquePlantilla(nombre, etiqueta, ayuda, filas) {
  const marcas = MARCADORES[nombre];
  return `<div class="flex flex-col gap-2">
    <div class="flex items-center justify-between gap-2"><label class="etiqueta mb-0" for="pl-${nombre}">${etiqueta}</label>
      <button type="button" data-restaurar="${nombre}" class="font-label-md text-label-md text-primary hover:underline flex items-center gap-1 shrink-0">${ico('restart_alt', 'text-[16px]')}<span>Texto original</span></button></div>
    ${marcas.length ? `<div class="flex flex-wrap gap-1.5" role="group" aria-label="Insertar un dato en el mensaje">${marcas.map(([m, d]) => `<button type="button" data-insertar="{${m}}" data-en="pl-${nombre}" title="${esc(d)}" class="px-2 py-1 rounded-lg bg-surface-container text-primary font-label-md text-label-md hover:bg-surface-container-high">{${m}}</button>`).join('')}</div>` : ''}
    <textarea id="pl-${nombre}" name="${nombre}" rows="${filas}" maxlength="600" class="campo">${esc(cfg[nombre] || '')}</textarea>
    <p class="ayuda mt-0">${ayuda}</p>
    <p data-aviso-plantilla="${nombre}" class="hidden font-label-md text-label-md text-[#92400E] flex items-start gap-1"></p>
  </div>`;
}

function cuerpoMensajes() {
  return `<div class="grid grid-cols-1 xl:grid-cols-5 gap-space-lg items-start">
    <div class="xl:col-span-3 flex flex-col gap-space-lg">
      ${bloquePlantilla('plantilla_producto', 'Consulta desde la ficha de un producto', 'Toca un dato para insertarlo donde está el cursor. {opciones} ya incluye la coma inicial.', 4)}
      ${bloquePlantilla('plantilla_pedido_inicio', 'Inicio del mensaje de «Mi Pedido»', 'Después se agregan solos la lista de productos, el envío, el total y los datos del cliente.', 2)}
      ${bloquePlantilla('plantilla_pedido_cierre', 'Cierre del mensaje de «Mi Pedido»', 'Texto fijo al final del pedido (no admite datos).', 2)}
    </div>
    <div class="xl:col-span-2 xl:sticky xl:top-24">
      <p class="font-label-sm text-label-sm uppercase tracking-wider text-outline mb-2">Vista previa con datos de ejemplo</p>
      <div class="rounded-2xl overflow-hidden border border-surface-container shadow-sm">
        <div class="bg-wa-oscuro text-white px-3 py-2.5 flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">${ico('storefront', 'text-[20px]')}</div>
          <div class="min-w-0"><p class="font-label-lg text-label-lg truncate">${esc(cfg.nombre || 'MI TIENDA')}</p><p class="text-[11px] leading-tight text-white/70">en línea</p></div></div>
        <div class="bg-[#EFEAE2] p-3 flex flex-col gap-2.5 min-h-[220px]">
          <span class="self-center px-2 py-0.5 rounded-md bg-white/80 text-[11px] text-on-surface-variant">Desde la ficha de producto</span>
          <div data-burbuja="producto" class="self-end max-w-[90%] bg-wa-burbuja text-wa-oscuro rounded-lg rounded-tr-sm px-3 pt-2 pb-1.5 shadow-sm text-[13px] leading-snug whitespace-pre-wrap break-words"></div>
          <span class="self-center px-2 py-0.5 rounded-md bg-white/80 text-[11px] text-on-surface-variant">Desde «Mi Pedido»</span>
          <div data-burbuja="pedido" class="self-end max-w-[90%] bg-wa-burbuja text-wa-oscuro rounded-lg rounded-tr-sm px-3 pt-2 pb-1.5 shadow-sm text-[13px] leading-snug whitespace-pre-wrap break-words"></div>
        </div></div>
      <p class="ayuda">Usa *asteriscos* para negrita y _guiones bajos_ para cursiva, como en WhatsApp.</p>
    </div></div>`;
}

function cuerpoContacto() {
  const redes = cfg.redes && typeof cfg.redes === 'object' ? cfg.redes : {};
  return `<div class="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
      ${entrada({ id: 'cfgEmail', nombre: 'email', etiqueta: 'Correo', valor: cfg.email, tipo: 'email', icono: 'mail', attrs: 'maxlength="120" autocomplete="off" placeholder="ventas@tutienda.com"' })}
      ${entrada({ id: 'cfgTelefono', nombre: 'telefono', etiqueta: 'Teléfono', valor: cfg.telefono, tipo: 'tel', icono: 'call', attrs: 'maxlength="30" autocomplete="off" placeholder="Ej: +1 305 555 0118"' })}
      <div class="sm:col-span-2">${entrada({ id: 'cfgDireccion', nombre: 'direccion', etiqueta: 'Dirección', valor: cfg.direccion, icono: 'location_on', attrs: 'maxlength="160" placeholder="Calle, número, local…"', ayuda: 'Si la completas, Soporte muestra un enlace a Google Maps.' })}</div>
      ${entrada({ id: 'cfgCiudad', nombre: 'ciudad', etiqueta: 'Ciudad', valor: cfg.ciudad, attrs: 'maxlength="80"' })}
      ${entrada({ id: 'cfgPais', nombre: 'pais', etiqueta: 'País', valor: cfg.pais, attrs: 'maxlength="80"' })}
    </div>
    <div class="pt-space-sm">
      <p class="font-label-lg text-label-lg text-on-surface">Redes sociales</p>
      <p class="font-body-sm text-body-sm text-outline mb-space-sm">Aparecen como iconos en el pie de la tienda. Pega el enlace completo (https://…) o tu @usuario.</p>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-space-md">
        ${REDES.map((r) => entrada({ id: `cfgRed-${r.id}`, nombre: r.id, etiqueta: r.nombre, valor: redes[r.id] || '', tipo: 'url', icono: r.icono, attrs: `maxlength="200" autocomplete="off" inputmode="url" placeholder="https://${r.dominio}/tutienda"` })).join('')}
      </div>
    </div>`;
}

function cuerpoDatos() {
  return `<div class="grid grid-cols-1 lg:grid-cols-2 gap-space-md">
    <div class="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-space-sm">
      <div class="flex items-center gap-2">${ico('delete_sweep', 'text-[22px] text-error')}<h3 class="font-subheading text-subheading text-on-surface">Datos de ejemplo</h3></div>
      <p class="font-body-sm text-body-sm text-on-surface-variant">La tienda trae pedidos, clientes, visitas, movimientos de inventario, actividad y reseñas de muestra para que veas cómo funciona. Bórralos antes de empezar a vender: tus datos reales no se tocan.</p>
      <div data-conteo-ejemplos class="font-body-sm text-body-sm text-on-surface-variant"><div class="h-10 esqueleto"></div></div>
      <div class="flex flex-col sm:flex-row flex-wrap gap-2">
        <button type="button" data-borrar-ejemplos class="btn-peligro-suave">${ico('delete_sweep', 'text-[18px]')}<span>Borrar actividad de ejemplo</span></button>
        <button type="button" data-borrar-catalogo class="btn-peligro">${ico('delete_forever', 'text-[18px]')}<span>Borrar también el catálogo de ejemplo</span></button>
      </div>
      <div data-resultado-borrado></div>
    </div>
    <div class="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-space-sm">
      <div class="flex items-center gap-2">${ico('backup', 'text-[22px] text-primary')}<h3 class="font-subheading text-subheading text-on-surface">Respaldo</h3></div>
      <p class="font-body-sm text-body-sm text-on-surface-variant">Descarga en un archivo JSON la configuración, categorías, productos (con costos internos), banners, promociones, reseñas, contenido, clientes y pedidos.</p>
      <p class="flex items-start gap-1.5 font-body-sm text-body-sm text-[#92400E]">${ico('lock', 'text-[16px] shrink-0')}<span>Incluye datos personales de tus clientes: guárdalo en un lugar seguro y no lo compartas.</span></p>
      <button type="button" data-respaldo class="btn-primario self-start">${ico('download', 'text-[18px]')}<span>Descargar respaldo (JSON)</span></button>
      <p class="ayuda mt-0">Las imágenes no se incluyen (sólo sus enlaces).</p>
    </div></div>`;
}

const CUERPOS = { tienda: cuerpoTienda, whatsapp: cuerpoWhatsapp, horario: cuerpoHorario, envios: cuerpoEnvios, mensajes: cuerpoMensajes, contacto: cuerpoContacto, datos: cuerpoDatos };

function interior(s) {
  const n = SECCIONES.findIndex((x) => x.id === s.id) + 1;
  const conGuardar = s.id !== 'datos';
  return `<div class="flex items-start justify-between gap-space-sm pb-space-sm mb-space-md">
      <div class="flex items-start gap-space-sm min-w-0">
        <div class="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">${ico(s.icono, 'text-[18px]')}</div>
        <div class="min-w-0"><h2 class="font-headline-sm text-headline-sm text-on-surface">${n}. ${s.titulo}</h2>
          <p class="font-body-sm text-body-sm text-outline">${s.texto}</p></div></div>
      ${conGuardar ? '<span data-sucio class="chip-ambar hidden shrink-0">Sin guardar</span>' : ''}
    </div>
    <div class="space-y-space-md">${CUERPOS[s.id]()}</div>
    ${conGuardar ? `<p data-error role="alert" class="hidden mt-space-md px-3 py-2 rounded-lg bg-[#FEF2F2] text-[#991B1B] font-label-md text-label-md border border-[#FECACA]"></p>
    <div class="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-space-md mt-space-md border-t border-surface-container">
      <button type="button" data-descartar class="btn-fantasma" disabled>${ico('undo', 'text-[18px]')}<span>Descartar</span></button>
      <button type="submit" data-enviar class="btn-primario" disabled>${ico('save', 'text-[18px]')}<span>Guardar cambios</span></button>
    </div>` : ''}`;
}

const claseSeccion = 'bg-surface-container-lowest rounded-xl p-space-md sm:p-space-lg shadow-[0_1px_3px_rgba(15,23,42,0.04)] scroll-mt-32 lg:scroll-mt-24 transition-shadow';

// ---------------- Lectura, validación y estado ----------------
const LECTORES = {
  tienda: (f) => ({ nombre: val(f, 'nombre'), eslogan: val(f, 'eslogan') || null, logo_url: val(f, 'logo_url') || null, moneda: val(f, 'moneda'), locale: val(f, 'locale'), zona_horaria: val(f, 'zona_horaria') }),
  whatsapp: (f) => ({ whatsapp: soloDigitos(val(f, 'whatsapp')), soporte_whatsapp: soloDigitos(val(f, 'soporte_whatsapp')) }),
  horario: (f) => ({ horario: val(f, 'horario') || null, abierta: !!f.elements.abierta?.checked, mensaje_cerrado: val(f, 'mensaje_cerrado') || null }),
  envios: (f) => ({ envio_gratis_desde: numONulo(val(f, 'envio_gratis_desde')), costo_envio: numONulo(val(f, 'costo_envio')), nota_precios: val(f, 'nota_precios') || null, stock_bajo_umbral: numONulo(val(f, 'stock_bajo_umbral')), bodega: val(f, 'bodega') }),
  mensajes: (f) => ({ plantilla_producto: val(f, 'plantilla_producto'), plantilla_pedido_inicio: val(f, 'plantilla_pedido_inicio'), plantilla_pedido_cierre: val(f, 'plantilla_pedido_cierre') }),
  contacto: (f) => ({
    email: val(f, 'email').toLowerCase() || null, telefono: val(f, 'telefono') || null, direccion: val(f, 'direccion') || null, ciudad: val(f, 'ciudad') || null, pais: val(f, 'pais') || null,
    redes: { ...(cfg.redes && typeof cfg.redes === 'object' ? cfg.redes : {}), ...Object.fromEntries(REDES.map((r) => [r.id, val(f, r.id)])) },
  }),
};

const VALIDAR = {
  tienda(c) {
    if (!c.nombre) return ['nombre', 'Escribe el nombre de la tienda.'];
    if (c.nombre.length > 60) return ['nombre', 'El nombre puede tener hasta 60 caracteres.'];
    if (!/^[A-Z]{3}$/.test(c.moneda)) return ['moneda', 'Elige una moneda.'];
    try { new Intl.NumberFormat(c.locale); } catch { return ['locale', 'Ese formato regional no es válido.']; }
    try { new Intl.DateTimeFormat('es', { timeZone: c.zona_horaria }); } catch { return ['zona_horaria', 'Esa zona horaria no es válida.']; }
    return null;
  },
  whatsapp(c) {
    for (const [k, quien] of [['whatsapp', 'de ventas'], ['soporte_whatsapp', 'de soporte']]) {
      if (c[k] && (c[k].length < 8 || c[k].length > 15)) return [k, `El número ${quien} debe tener entre 8 y 15 dígitos, con el código de país (ej.: 13055550118).`];
    }
    return null;
  },
  envios(c) {
    if (c.envio_gratis_desde != null && !(c.envio_gratis_desde >= 0)) return ['envio_gratis_desde', 'El monto para envío gratis debe ser un número igual o mayor que 0.'];
    if (c.costo_envio != null && !(c.costo_envio >= 0)) return ['costo_envio', 'El costo de envío debe ser un número igual o mayor que 0.'];
    if (!Number.isInteger(c.stock_bajo_umbral) || c.stock_bajo_umbral < 0) return ['stock_bajo_umbral', 'Escribe un número entero (0 o más).'];
    if (!c.bodega) return ['bodega', 'Escribe el nombre de tu bodega o almacén.'];
    return null;
  },
  mensajes(c) {
    for (const [k, que] of [['plantilla_producto', 'de consulta de producto'], ['plantilla_pedido_inicio', 'de inicio del pedido'], ['plantilla_pedido_cierre', 'de cierre del pedido']]) {
      if (!c[k]) return [k, `Escribe el mensaje ${que} (o usa «Texto original»).`];
    }
    return null;
  },
  contacto(c) {
    if (c.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) return ['email', 'Revisa el correo: no parece válido.'];
    for (const r of REDES) {
      const u = c.redes[r.id];
      if (!u) continue;
      let ok = false;
      try { const url = new URL(u); ok = url.protocol === 'https:' && url.hostname.includes('.'); } catch { ok = false; }
      if (!ok) return [r.id, `El enlace de ${r.nombre} debe empezar con https:// (ej.: https://${r.dominio}/tutienda).`];
    }
    return null;
  },
};

const inicial = {};
const instantanea = (s) => { const f = formulario(s); if (f && LECTORES[s]) inicial[s] = JSON.stringify(LECTORES[s](f)); };
const estaSucio = (s) => { const f = formulario(s); return !!(f && LECTORES[s] && JSON.stringify(LECTORES[s](f)) !== inicial[s]); };

function marcarSucio(s) {
  const f = formulario(s);
  if (!f) return;
  const sucio = estaSucio(s);
  $('[data-sucio]', f)?.classList.toggle('hidden', !sucio);
  const enviar = $('[data-enviar]', f);
  if (enviar) enviar.disabled = !sucio;
  const desc = $('[data-descartar]', f);
  if (desc) desc.disabled = !sucio;
  $$(`[data-ir="${s}"] [data-punto]`, raiz).forEach((p) => p.classList.toggle('hidden', !sucio));
}

function mostrarError(f, campo, mensaje) {
  const caja = $('[data-error]', f);
  if (caja) { caja.textContent = mensaje; caja.classList.remove('hidden'); }
  const el = campo ? f.elements[campo] : null;
  if (el) { el.classList.add('campo-error'); el.focus(); }
  toast(mensaje, { tipo: 'error', duracion: 5000 });
}

// ---------------- Vistas previas en vivo ----------------
function vistaNumero(f, nombre) {
  const caja = $(`[data-vista-wa="${nombre}"]`, f);
  if (!caja) return;
  const d = soloDigitos(f.elements[nombre].value);
  if (!d) { caja.innerHTML = `<span class="chip-ambar">${ico('warning', 'text-[13px]')}${nombre === 'whatsapp' ? 'Sin número: el cliente elige el contacto' : 'Sin número de soporte'}</span>`; return; }
  const ok = d.length >= 8 && d.length <= 15;
  caja.innerHTML = `<div class="flex flex-wrap items-center gap-2"><span class="font-label-lg text-label-lg text-on-surface tnum">${esc(telefonoBonito(d))}</span>
    ${ok ? `<a href="${esc(urlWhatsApp(d, `Prueba de ${cfg.nombre || 'MI TIENDA'}`))}" target="_blank" rel="noopener" class="btn-wa btn-sm">${ico('chat', 'text-[16px]', true)}<span>Probar enlace</span></a>`
    : `<span class="chip-rojo">${d.length < 8 ? 'Faltan dígitos' : 'Demasiados dígitos'}</span>`}</div>`;
}

function textoEnvio(gratis, costo) {
  const f = (n) => dinero(n, cfg);
  const partes = [];
  if (costo == null || Number.isNaN(costo)) partes.push('El envío se coordina por WhatsApp: el pedido dirá «Envío: a coordinar».');
  else if (costo === 0) partes.push('El envío es gratis en todos los pedidos.');
  else partes.push(`Cada pedido suma ${f(costo)} de envío.`);
  if (gratis != null && !Number.isNaN(gratis) && costo !== 0) partes.push(`Desde ${f(gratis)} el envío es gratis y las fichas de producto lo anuncian.`);
  return partes.join(' ');
}

const ahoraHora = () => new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(new Date());
const burbuja = (texto) => `${formatoWa(texto)}<span class="flex items-center justify-end gap-0.5 mt-1 text-[10px] leading-none text-wa-oscuro/60">${esc(ahoraHora())}${ico('done_all', 'text-[14px] text-[#53BDEB]')}</span>`;

function mensajeProducto(tpl) {
  const f = (n) => dinero(n, cfg);
  return plantilla(tpl || ORIGINALES.plantilla_producto, {
    tienda: cfg.nombre || 'MI TIENDA', producto: 'Auriculares Inalámbricos Pro ANC', sku: 'AUD-PRO-094', opciones: ', color: Negro Grafito',
    cantidad: 2, total: f(96), precio: f(48), enlace: ruta('producto.html?p=auriculares-inalambricos-pro-anc'),
  });
}

function mensajePedido(inicioTpl, cierre) {
  const f = (n) => dinero(n, cfg);
  const inicio = plantilla(inicioTpl || ORIGINALES.plantilla_pedido_inicio, { tienda: `*${cfg.nombre || 'MI TIENDA'}*`, numero: 'WA-1024' }).replace(/\s+:/, ':').replace(/\s{2,}/g, ' ');
  const subtotal = 108;
  const umbral = cfg.envio_gratis_desde;
  const gratis = umbral != null && subtotal >= Number(umbral);
  const envio = gratis ? 0 : cfg.costo_envio;
  const total = subtotal + (envio == null ? 0 : Number(envio));
  return [inicio, `• 1x Auriculares Inalámbricos Pro ANC (Negro Grafito) (${f(48)})`, `• 2x Cargador Rápido 30W (${f(60)})`,
    `Envío: ${envio == null ? 'a coordinar' : gratis ? 'bonificado' : f(envio)}`, `*Total estimado: ${f(total)}*`, 'Cliente: Ana Pérez (Miami)', cierre || ORIGINALES.plantilla_pedido_cierre].join('\n');
}

function avisoPlantilla(nombre, texto) {
  const usados = [...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  const validos = MARCADORES[nombre].map(([m]) => m);
  const raros = [...new Set(usados.filter((u) => !validos.includes(u)))];
  const avisos = [];
  if (raros.length) avisos.push(`${raros.map((r) => `{${r}}`).join(', ')} no se reemplaza: se enviará tal cual.`);
  if (nombre === 'plantilla_producto' && texto && !usados.includes('producto')) avisos.push('Incluye {producto} para saber qué artículo le interesa al cliente.');
  if (nombre === 'plantilla_pedido_inicio' && texto && !usados.includes('numero')) avisos.push('Incluye {numero} para encontrar el pedido en el panel.');
  return avisos.join(' ');
}

const VISTAS = {
  tienda(f) {
    const precio = $('[data-vista-precio]', f);
    if (precio) precio.textContent = dinero(1234.5, { moneda: f.elements.moneda.value, locale: f.elements.locale.value });
    const hora = $('[data-vista-hora]', f);
    if (hora) { const h = horaEn(f.elements.zona_horaria.value); hora.textContent = h ? `Ahora allí: ${h}.` : ''; }
    const url = f.elements.logo_url.value;
    $('[data-logo-vista]', f).innerHTML = url ? `<img src="${esc(urlImagen(url))}" alt="Logo de la tienda" class="w-full h-full object-contain">` : ico('storefront', 'text-[36px] text-outline');
    $('[data-quitar-logo]', f).classList.toggle('hidden', !url);
  },
  whatsapp(f) { vistaNumero(f, 'whatsapp'); vistaNumero(f, 'soporte_whatsapp'); },
  horario(f) {
    const caja = $('[data-vista-cerrado]', f);
    if (!caja) return;
    const abierta = f.elements.abierta.checked;
    caja.innerHTML = `<div class="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A] font-label-md text-label-md ${abierta ? 'opacity-60' : ''}">${ico('schedule', 'text-[18px] shrink-0')}<span>${esc(val(f, 'mensaje_cerrado') || 'Estamos fuera de horario.')}</span></div>
      <p class="ayuda">${abierta ? 'Sólo se muestra cuando la tienda está cerrada.' : '<strong class="text-[#92400E]">La tienda está marcada como cerrada:</strong> este aviso se verá al guardar.'}</p>`;
  },
  envios(f) {
    const caja = $('[data-vista-envio]', f);
    if (caja) caja.textContent = textoEnvio(numONulo(val(f, 'envio_gratis_desde')), numONulo(val(f, 'costo_envio')));
  },
  mensajes(f) {
    const prod = $('[data-burbuja="producto"]', f);
    if (prod) prod.innerHTML = burbuja(mensajeProducto(val(f, 'plantilla_producto')));
    const ped = $('[data-burbuja="pedido"]', f);
    if (ped) ped.innerHTML = burbuja(mensajePedido(val(f, 'plantilla_pedido_inicio'), val(f, 'plantilla_pedido_cierre')));
    for (const nombre of Object.keys(MARCADORES)) {
      const aviso = $(`[data-aviso-plantilla="${nombre}"]`, f);
      if (!aviso) continue;
      const t = avisoPlantilla(nombre, val(f, nombre));
      aviso.innerHTML = t ? `${ico('warning', 'text-[16px] shrink-0')}<span>${esc(t)}</span>` : '';
      aviso.classList.toggle('hidden', !t);
    }
  },
};

function prepararSeccion(s) {
  const f = formulario(s);
  if (!f) return;
  $$('[data-contar]', f).forEach(contar);
  VISTAS[s]?.(f);
  instantanea(s);
  marcarSucio(s);
}

function repintar(s) {
  const f = formulario(s);
  if (!f) return;
  f.innerHTML = interior(SECCIONES.find((x) => x.id === s));
  prepararSeccion(s);
}

// ---------------- Guardar ----------------
const DESPUES = {
  tienda() {
    document.title = `Configuración · ${cfg.nombre || 'MI TIENDA'} Admin`;
    try {
      const marca = $('#menuLateral a[href="dashboard.html"]');
      const nombre = marca?.querySelector('.font-headline-sm');
      if (nombre) nombre.textContent = cfg.nombre;
      const caja = marca?.firstElementChild;
      if (caja) caja.innerHTML = cfg.logo_url ? `<img src="${esc(urlImagen(cfg.logo_url))}" alt="" class="w-full h-full object-cover">` : ico('storefront', 'text-[24px]');
    } catch { /* el menú se actualiza al recargar */ }
    // La moneda y el nombre también cambian las vistas previas de otras tarjetas
    ['envios', 'mensajes'].forEach((s) => { const f = formulario(s); if (f && !estaSucio(s)) repintar(s); else if (f) VISTAS[s](f); });
  },
  horario() {
    const sw = $('[data-tienda-abierta]');
    if (sw) sw.checked = cfg.abierta !== false;
    const t = $('[data-texto-abierta]');
    if (t) t.textContent = cfg.abierta === false ? 'Tienda cerrada' : 'Tienda abierta';
  },
  envios() { const f = formulario('mensajes'); if (f) VISTAS.mensajes(f); },
};

async function guardarSeccion(f) {
  const s = f.dataset.form;
  const caja = $('[data-error]', f);
  caja?.classList.add('hidden');
  const cambios = LECTORES[s](f);
  const error = VALIDAR[s]?.(cambios);
  if (error) { mostrarError(f, error[0], error[1]); return; }
  const boton = $('[data-enviar]', f);
  const antes = boton.innerHTML;
  boton.disabled = true;
  boton.innerHTML = `${spinner()}<span>Guardando…</span>`;
  try {
    const r = await db.actualizar('mt_config', 'id=eq.1', cambios);
    // Sólo se copian las columnas de esta tarjeta: dos guardados seguidos de tarjetas distintas no se pisan.
    const fila = (Array.isArray(r) && r[0]) || {};
    for (const k of Object.keys(cambios)) cfg[k] = k in fila ? fila[k] : cambios[k];
    if (fila.actualizado_en) cfg.actualizado_en = fila.actualizado_en;
    repintar(s);
    DESPUES[s]?.();
    toast(`${SECCIONES.find((x) => x.id === s).titulo}: cambios guardados`);
  } catch (e) {
    boton.innerHTML = antes;
    boton.disabled = false;
    mostrarError(f, null, e.message);
  }
}

// ---------------- Datos de ejemplo y respaldo ----------------
async function contarEjemplos() {
  const caja = $('[data-conteo-ejemplos]', raiz);
  if (!caja) return;
  const tablas = [
    ['mt_pedidos', 'pedido', 'pedidos'], ['mt_clientes', 'cliente', 'clientes'], ['mt_testimonios', 'reseña', 'reseñas'], ['mt_actividad', 'registro de actividad', 'registros de actividad'],
    ['mt_productos', 'producto', 'productos'], ['mt_categorias', 'categoría', 'categorías'], ['mt_banners', 'banner', 'banners'], ['mt_promociones', 'promoción', 'promociones'],
  ];
  const r = await Promise.allSettled(tablas.map(([t]) => db.contar(t, 'ejemplo=eq.true')));
  const texto = (desde, hasta) => tablas.slice(desde, hasta).map(([, uno, varios], i) => {
    const x = r[desde + i];
    return x.status === 'fulfilled' && x.value ? `${numero(x.value)} ${x.value === 1 ? uno : varios}` : '';
  }).filter(Boolean).join(' · ');
  const actividad = texto(0, 4);
  const catalogo = texto(4, 8);
  caja.innerHTML = actividad || catalogo
    ? `<ul class="flex flex-col gap-1">
        <li class="flex items-start gap-1.5">${ico('receipt_long', 'text-[16px] text-outline shrink-0')}<span><strong class="text-on-surface">Actividad:</strong> ${esc(actividad || 'nada')}${actividad ? ' (más visitas y movimientos de inventario)' : ''}</span></li>
        <li class="flex items-start gap-1.5">${ico('inventory_2', 'text-[16px] text-outline shrink-0')}<span><strong class="text-on-surface">Catálogo:</strong> ${esc(catalogo || 'nada')}</span></li></ul>`
    : `<span class="chip-verde">${ico('task_alt', 'text-[13px]')}No quedan datos de ejemplo</span>`;
}

function htmlResultado(r) {
  const filas = Object.entries(r || {}).filter(([, n]) => Number(n) > 0)
    .map(([k, n]) => `<li class="flex items-center justify-between gap-3 py-0.5"><span>${esc((ETIQUETAS_BORRADO[k] || [k, k])[Number(n) === 1 ? 0 : 1])}</span><span class="font-label-lg text-label-lg text-on-surface tnum">${numero(n)}</span></li>`);
  return `<div class="p-space-sm px-space-md rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46] font-body-sm text-body-sm">
    <p class="font-label-lg text-label-lg flex items-center gap-1.5">${ico('task_alt', 'text-[18px]')}${filas.length ? 'Listo. Se eliminaron:' : 'No había datos de ejemplo para borrar.'}</p>
    ${filas.length ? `<ul class="mt-1 divide-y divide-[#A7F3D0]">${filas.join('')}</ul>` : ''}</div>`;
}

async function borrarEjemplos(conCatalogo) {
  let r;
  if (conCatalogo) {
    r = await modal({
      titulo: 'Borrar también el catálogo de ejemplo', icono: 'delete_forever', peligro: true, textoEnviar: 'Borrar todo lo de ejemplo',
      subtitulo: 'Además de la actividad de ejemplo se eliminarán los productos, categorías, banners y promociones de muestra. No se puede deshacer.',
      contenido: `<div class="flex flex-col gap-3">
        <div class="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] font-body-sm text-body-sm">Los productos que creaste tú no se tocan. Las categorías de ejemplo que ya usan tus propios productos se conservan.</div>
        <div><label class="etiqueta" for="confirmaBorrar">Escribe <strong>BORRAR</strong> para confirmar</label>
          <input id="confirmaBorrar" name="confirmacion" class="campo uppercase tracking-widest" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="BORRAR"></div></div>`,
      alEnviar: async (form) => {
        if (form.elements.confirmacion.value.trim().toUpperCase() !== 'BORRAR') throw new Error('Escribe BORRAR para confirmar.');
        return db.rpc('mt_borrar_ejemplos', { p_catalogo: true });
      },
    });
    if (!r || r === true) return;
  } else {
    const ok = await confirmar({
      titulo: 'Borrar actividad de ejemplo', peligro: true, boton: 'Borrar ejemplos', icono: 'delete_sweep',
      mensaje: 'Se eliminarán los pedidos, clientes, visitas, movimientos de inventario, registros de actividad y reseñas de ejemplo. Tus datos reales y el catálogo no se tocan. No se puede deshacer.',
    });
    if (!ok) return;
    const boton = $('[data-borrar-ejemplos]', raiz);
    const antes = boton.innerHTML;
    boton.disabled = true;
    boton.innerHTML = `${spinner()}<span>Borrando…</span>`;
    try { r = await db.rpc('mt_borrar_ejemplos', { p_catalogo: false }); } catch (e) { toastError(e); return; } finally { boton.disabled = false; boton.innerHTML = antes; }
  }
  $('[data-resultado-borrado]', raiz).innerHTML = htmlResultado(r);
  toast('Datos de ejemplo eliminados');
  contarEjemplos();
}

async function leerTodo(tabla, orden) {
  const { filas, total } = await db.leerConTotal(tabla, `select=*&order=${orden}&limit=1000`);
  const todo = [...filas];
  while (todo.length < total) {
    const mas = await db.leer(tabla, `select=*&order=${orden}&limit=1000&offset=${todo.length}`);
    if (!mas.length) break;
    todo.push(...mas);
  }
  return todo;
}

async function descargarRespaldo(boton) {
  const antes = boton.innerHTML;
  boton.disabled = true;
  try {
    const respaldo = { tipo: 'respaldo-mi-tienda', version: 1, generado_en: new Date().toISOString(), tienda: cfg.nombre, tablas: {} };
    let total = 0;
    for (const [i, [tabla, orden]] of TABLAS_RESPALDO.entries()) {
      boton.innerHTML = `${spinner()}<span>Preparando… (${i + 1}/${TABLAS_RESPALDO.length})</span>`;
      respaldo.tablas[tabla] = await leerTodo(tabla, orden);
      total += respaldo.tablas[tabla].length;
    }
    const hoy = new Date();
    const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    descargar(`respaldo-${slug(cfg.nombre) || 'mi-tienda'}-${fecha}.json`, JSON.stringify(respaldo, null, 2), 'application/json;charset=utf-8');
    toast(`Respaldo descargado: ${numero(total)} registros`);
  } catch (e) { toastError(e); } finally { boton.disabled = false; boton.innerHTML = antes; }
}

// ---------------- Navegación entre secciones ----------------
const claseNav = (activa) => `flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all ${activa ? 'bg-primary-container text-on-primary-container font-semibold' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'}`;
const claseChip = (activa) => `shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full font-label-md text-label-md transition-all ${activa ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface-container-lowest text-on-surface-variant shadow-sm'}`;
const puntoNav = '<span data-punto class="hidden w-2 h-2 rounded-full bg-[#F59E0B] shrink-0" title="Cambios sin guardar"></span>';

function marcarNav(id) {
  $$('[data-ir]', raiz).forEach((a) => {
    const on = a.dataset.ir === id;
    a.className = a.dataset.tipo === 'chip' ? claseChip(on) : claseNav(on);
    if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
  });
}

function irA(id, { suave = true } = {}) {
  const el = document.getElementById(id);
  if (!el || !raiz.contains(el)) return;
  el.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
  el.classList.add('ring-2', 'ring-primary/40');
  setTimeout(() => el.classList.remove('ring-2', 'ring-primary/40'), 1800);
  if (id === 'soporte') $('#cfgSoporte')?.focus({ preventScroll: true });
  marcarNav(id === 'soporte' ? 'whatsapp' : id);
}

// ---------------- Armado de la página ----------------
raiz.innerHTML = `
  <div class="flex flex-col xl:flex-row xl:items-end justify-between gap-space-md">
    <div><span class="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-bold">Sistema • Ajustes generales</span>
      <h1 class="font-headline-lg-mobile text-headline-lg-mobile lg:font-headline-lg lg:text-headline-lg text-on-surface tracking-tight">Configuración</h1>
      <p class="font-body-md text-body-md text-on-surface-variant">Datos de tu tienda, WhatsApp, horario, envíos y mensajes automáticos. Cada tarjeta se guarda por separado.</p></div>
    <a href="${esc(ruta('index.html'))}" target="_blank" rel="noopener" class="self-start xl:self-auto flex items-center gap-space-xs px-3.5 py-2 rounded-xl bg-surface-container-lowest hover:bg-surface-container-low text-on-surface font-label-md text-label-md shadow-sm transition-all">${ico('storefront', 'text-[18px] text-primary')}<span>Ver la tienda</span>${ico('open_in_new', 'text-[16px] text-outline')}</a>
  </div>
  <nav class="lg:hidden sticky top-16 z-20 -mx-4 px-4 py-2 bg-surface/90 backdrop-blur flex gap-2 overflow-x-auto no-scrollbar" aria-label="Secciones de configuración">
    ${SECCIONES.map((s) => `<a href="#${s.id}" data-ir="${s.id}" data-tipo="chip" class="${claseChip(false)}">${ico(s.icono, 'text-[16px]')}<span>${s.titulo}</span>${puntoNav}</a>`).join('')}
  </nav>
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
    <aside class="hidden lg:block lg:col-span-3 lg:sticky lg:top-24">
      <nav class="bg-surface-container-lowest rounded-xl p-2 shadow-sm flex flex-col gap-0.5" aria-label="Secciones de configuración">
        ${SECCIONES.map((s, i) => `<a href="#${s.id}" data-ir="${s.id}" class="${claseNav(false)}">${ico(s.icono, 'text-[20px]')}<span class="flex-1 font-body-md text-body-md">${i + 1}. ${s.titulo}</span>${puntoNav}</a>`).join('')}
      </nav>
      <p class="mt-space-sm px-2 font-body-sm text-body-sm text-outline">Los cambios se ven en la tienda en cuanto guardas cada tarjeta.</p>
    </aside>
    <div class="lg:col-span-9 flex flex-col gap-space-lg">
      ${SECCIONES.map((s) => (s.id === 'datos'
    ? `<section id="datos" data-form="datos" class="${claseSeccion}">${interior(s)}</section>`
    : `<form id="${s.id}" data-form="${s.id}" novalidate class="${claseSeccion}">${interior(s)}</form>`)).join('')}
    </div>
  </div>`;

SECCIONES.forEach((s) => prepararSeccion(s.id));
contarEjemplos();

// ---------------- Eventos ----------------
raiz.addEventListener('input', (e) => {
  const f = e.target.closest?.('form[data-form]');
  if (!f) return;
  const s = f.dataset.form;
  e.target.classList?.remove('campo-error');
  $('[data-error]', f)?.classList.add('hidden');
  if (e.target.dataset?.contar) contar(e.target);
  VISTAS[s]?.(f);
  marcarSucio(s);
});
raiz.addEventListener('change', (e) => {
  const f = e.target.closest?.('form[data-form]');
  if (!f) return;
  if (e.target.name === 'moneda') {
    // Sugerir el formato regional de la nueva moneda si se usaba el sugerido de la anterior
    const loc = f.elements.locale;
    const anterior = Object.entries(LOCALE_SUGERIDO).find(([, l]) => l === loc.value)?.[0];
    if (anterior && LOCALE_SUGERIDO[e.target.value] && [...loc.options].some((o) => o.value === LOCALE_SUGERIDO[e.target.value])) loc.value = LOCALE_SUGERIDO[e.target.value];
  }
  VISTAS[f.dataset.form]?.(f);
  marcarSucio(f.dataset.form);
});
// Normaliza números de WhatsApp y enlaces de redes al salir del campo
raiz.addEventListener('focusout', (e) => {
  const el = e.target;
  if (!el.name) return;
  let nuevo = null;
  if (el.name === 'whatsapp' || el.name === 'soporte_whatsapp') nuevo = soloDigitos(el.value);
  else if (REDES.some((r) => r.id === el.name)) nuevo = normalizarRed(el.name, el.value);
  if (nuevo != null && nuevo !== el.value) { el.value = nuevo; el.dispatchEvent(new Event('input', { bubbles: true })); }
});
raiz.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  guardarSeccion(f);
});
raiz.addEventListener('mousedown', (e) => { if (e.target.closest('[data-insertar]')) e.preventDefault(); });
raiz.addEventListener('click', async (e) => {
  const t = e.target;
  const nav = t.closest('[data-ir]');
  if (nav) { e.preventDefault(); history.replaceState(null, '', `#${nav.dataset.ir}`); irA(nav.dataset.ir); return; }
  const ins = t.closest('[data-insertar]');
  if (ins) { insertar($(`#${ins.dataset.en}`, raiz), ins.dataset.insertar); return; }
  const rest = t.closest('[data-restaurar]');
  if (rest) {
    const ta = $(`#pl-${rest.dataset.restaurar}`, raiz);
    if (ta) { ta.value = ORIGINALES[rest.dataset.restaurar]; ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); }
    return;
  }
  const f = t.closest('form[data-form]');
  if (t.closest('[data-descartar]') && f) { repintar(f.dataset.form); toast('Cambios descartados', { tipo: 'info' }); return; }
  if (t.closest('[data-elegir-logo]') && f) {
    const r = await elegirImagenes({ carpeta: 'tienda', titulo: 'Logo de la tienda' });
    if (Array.isArray(r) && r[0]?.url) { f.elements.logo_url.value = r[0].url; f.elements.logo_url.dispatchEvent(new Event('input', { bubbles: true })); }
    return;
  }
  if (t.closest('[data-quitar-logo]') && f) { f.elements.logo_url.value = ''; f.elements.logo_url.dispatchEvent(new Event('input', { bubbles: true })); return; }
  if (t.closest('[data-borrar-ejemplos]')) { borrarEjemplos(false); return; }
  if (t.closest('[data-borrar-catalogo]')) { borrarEjemplos(true); return; }
  const resp = t.closest('[data-respaldo]');
  if (resp) descargarRespaldo(resp);
});

// El interruptor "Tienda abierta" del encabezado guarda al instante: reflejarlo aquí si no hay cambios pendientes.
$('[data-tienda-abierta]')?.addEventListener('change', () => setTimeout(() => { if (!estaSucio('horario')) repintar('horario'); }, 1500));

// Sección activa en el índice según el desplazamiento
if ('IntersectionObserver' in window) {
  const observador = new IntersectionObserver((entradas) => {
    entradas.forEach((en) => { if (en.isIntersecting) marcarNav(en.target.id); });
  }, { rootMargin: '-35% 0px -60% 0px' });
  SECCIONES.forEach((s) => { const el = document.getElementById(s.id); if (el) observador.observe(el); });
}

window.addEventListener('hashchange', () => irA(location.hash.slice(1)));
window.addEventListener('beforeunload', (e) => {
  if (SECCIONES.some((s) => estaSucio(s.id))) { e.preventDefault(); e.returnValue = ''; }
});
if (location.hash.length > 1) setTimeout(() => irA(location.hash.slice(1), { suave: false }), 80);
else marcarNav('tienda');
