// "Mi Pedido": lista, resumen económico, datos para el asesor, vista previa del mensaje y envío por WhatsApp.
// El pedido se registra en el panel (mt_crear_pedido recalcula precios en el servidor) y luego se abre WhatsApp.
import { $, esc, ico, num, debounce, plantilla, hora, maximoPedido, soloDigitos } from '../util.js';
import { db, urlImagen, ruta } from '../api.js';
import { iniciarTienda, precio, abrirWhatsApp, toast } from './base.js';
import {
  leerPedido, cambiarCantidad, vaciarPedido, detallarPedido, mejorPromocion, alCambiarPedido,
  leerCliente, guardarCliente, guardarMiPedido, visitante, olvidarCache, cargarDatos,
} from './estado.js';
import { urlProducto } from './tarjetas.js';

let d = await iniciarTienda({ pagina: 'pedido', subtitulo: 'Mi Pedido' });
const contenido = $('#contenido');
const cliente = leerCliente();
let codigoExtra = null;
let errorEnvio = '';
let enviando = false;

// ---------------- Cálculos ----------------
function resumen() {
  const det = detallarPedido(d);
  const promo = mejorPromocion(d.promociones, det.subtotal, codigoExtra);
  const base = det.subtotal - promo.descuento;
  const umbral = d.cfg.envio_gratis_desde;
  const todosGratis = det.validas.length > 0 && det.validas.every((l) => l.producto.envio_gratis);
  const gratis = todosGratis || (umbral != null && base >= num(umbral));
  const envio = gratis ? 0 : d.cfg.costo_envio;
  return { ...det, promo, base, gratis, envio, umbral, total: base + (envio == null ? 0 : num(envio)) };
}

function mensaje(r, numero = null) {
  const c = d.cfg;
  const inicio = plantilla(c.plantilla_pedido_inicio || 'Hola {tienda}, quiero confirmar la disponibilidad de mi pedido {numero}:', { tienda: `*${c.nombre}*`, numero: numero || '' })
    .replace(/\s+:/, ':').replace(/\s{2,}/g, ' ');
  const lineas = r.validas.map((l) => `• ${l.cantidad}x ${l.producto.nombre}${l.variante ? ` (${l.variante})` : ''}${l.garantiaObj && num(l.garantiaObj.precio_extra) ? ` + ${l.garantiaObj.nombre}` : ''} (${precio(l.subtotal)})`);
  const partes = [inicio, ...lineas];
  if (r.promo.descuento > 0) partes.push(`${r.promo.nombre}: -${precio(r.promo.descuento)}`);
  partes.push(`Envío: ${r.envio == null ? 'a coordinar' : r.gratis ? 'bonificado' : precio(r.envio)}`);
  partes.push(`*Total estimado: ${precio(r.total)}*`);
  const nombre = $('#cliNombre')?.value.trim() ?? cliente.nombre;
  const ciudad = $('#cliCiudad')?.value.trim() ?? cliente.ciudad;
  const nota = $('#cliNota')?.value.trim() ?? cliente.nota;
  if (nombre) partes.push(`Cliente: ${nombre}${ciudad ? ` (${ciudad})` : ''}`);
  if (nota) partes.push(`Nota: ${nota}`);
  partes.push(c.plantilla_pedido_cierre || '¿Me indican los datos para coordinar el envío?');
  return partes.join('\n');
}

// ---------------- Plantillas ----------------
function htmlVacio() {
  return `<div class="max-w-md mx-auto py-16 text-center flex flex-col items-center gap-3">
    <div class="w-20 h-20 rounded-full bg-surface-container-low flex items-center justify-center">${ico('shopping_bag', 'text-[40px] text-primary')}</div>
    <h1 class="font-headline-md text-headline-md text-on-surface">Tu lista de pedido está vacía</h1>
    <p class="font-body-md text-body-md text-on-surface-variant">Agrega productos desde el catálogo y envíanos tu pedido completo por WhatsApp en un solo mensaje.</p>
    <div class="flex flex-col sm:flex-row gap-2 mt-2">
      <a href="${ruta('catalogo.html')}" class="btn-primario h-12">${ico('grid_view', 'text-[18px]')} Explorar catálogo</a>
      <a href="${ruta('cuenta.html#favoritos')}" class="btn-secundario h-12">${ico('favorite', 'text-[18px]')} Ver mis favoritos</a>
    </div></div>`;
}

function htmlLinea(l) {
  if (!l.valida) {
    return `<div class="flex items-center gap-space-sm bg-surface-container-lowest p-space-sm rounded-xl shadow-sm opacity-70">
      <div class="w-20 h-20 rounded-lg bg-surface-container flex items-center justify-center shrink-0">${ico('hide_image', 'text-outline')}</div>
      <div class="flex-1 min-w-0"><h3 class="font-label-lg text-label-lg text-on-surface truncate">${esc(l.producto?.nombre || 'Producto no disponible')}</h3>
        <p class="font-body-sm text-body-sm text-error">${esc(l.motivo)}</p></div>
      <button type="button" data-quitar="${l.indice}" aria-label="Quitar" class="text-on-surface-variant hover:text-error p-1">${ico('delete', 'text-[18px]')}</button></div>`;
  }
  const p = l.producto;
  const max = maximoPedido(p, l.varianteObj);
  const detalle = [l.variante, l.garantiaObj && num(l.garantiaObj.precio_extra) ? l.garantiaObj.nombre : '', `SKU: ${l.varianteObj?.sku || p.sku}`].filter(Boolean).join(' • ');
  const excede = l.cantidad > max;
  return `<div class="flex items-start gap-space-sm bg-surface-container-lowest p-space-sm rounded-xl shadow-sm relative group">
    <a href="${urlProducto(p)}" class="shrink-0"><img class="w-20 h-20 rounded-lg object-cover bg-surface-container" src="${esc(urlImagen(p.imagenes?.[0]?.mini || p.imagenes?.[0]?.url))}" alt="${esc(p.nombre)}" loading="lazy"></a>
    <div class="flex-1 min-w-0 flex flex-col justify-between min-h-20">
      <div class="flex justify-between items-start">
        <div class="min-w-0 pr-2"><h3 class="font-label-lg text-label-lg text-on-surface truncate"><a href="${urlProducto(p)}">${esc(p.nombre)}</a></h3>
          <p class="font-label-sm text-label-sm text-on-surface-variant truncate">${esc(detalle)}</p>
          ${excede ? `<p class="font-label-sm text-label-sm text-error mt-0.5">Sólo quedan ${max}. Ajusta la cantidad.</p>` : ''}</div>
        <button type="button" data-quitar="${l.indice}" aria-label="Eliminar ${esc(p.nombre)}" class="text-on-surface-variant hover:text-error transition-colors p-1">${ico('delete', 'text-[18px]')}</button>
      </div>
      <div class="flex items-center justify-between mt-auto pt-1">
        <div class="flex items-center bg-surface-container rounded-lg p-0.5 shadow-inner">
          <button type="button" data-menos="${l.indice}" aria-label="Quitar una unidad" class="w-7 h-7 flex items-center justify-center text-on-surface hover:bg-surface-container-highest rounded transition-colors text-sm font-bold">-</button>
          <span class="px-2 font-label-md text-label-md text-on-surface tnum min-w-[24px] text-center">${l.cantidad}</span>
          <button type="button" data-mas="${l.indice}" aria-label="Agregar una unidad" ${l.cantidad >= max ? 'disabled' : ''} class="w-7 h-7 flex items-center justify-center text-on-surface hover:bg-surface-container-highest rounded transition-colors text-sm font-bold disabled:opacity-30">+</button>
        </div>
        <div class="flex flex-col items-end"><span class="font-headline-sm text-headline-sm text-primary tnum">${precio(l.subtotal)}</span>
          ${l.cantidad > 1 ? `<span class="font-label-sm text-label-sm text-on-surface-variant tnum">${precio(l.unit)} c/u</span>` : ''}</div>
      </div>
    </div></div>`;
}

function htmlBarraEnvio(r) {
  if (r.umbral == null || r.envio == null && !r.gratis) return '';
  const pct = r.gratis ? 100 : Math.min(100, Math.round((r.base / num(r.umbral)) * 100));
  const falta = Math.max(0, num(r.umbral) - r.base);
  return `<div class="bg-surface-container p-space-sm rounded-xl space-y-1.5 shadow-sm">
    <div class="flex items-center justify-between text-on-surface gap-2">
      <div class="flex items-center gap-1.5">${ico('local_shipping', 'text-secondary text-[18px]')}
        <span class="font-label-md text-label-md">${r.gratis ? '¡Tu pedido tiene Envío Gratis!' : `¡Agrega ${precio(falta)} más para obtener Envío Gratis!`}</span></div>
      <span class="font-label-sm text-label-sm font-bold text-secondary tnum">${pct}%</span></div>
    <div class="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
      <div class="bg-secondary h-full rounded-full transition-all duration-500 ease-out" style="width:${pct}%"></div></div></div>`;
}

function htmlResumen(r) {
  return `<div class="bg-surface-container-lowest p-space-md rounded-xl shadow-sm space-y-space-sm">
    <h3 class="font-subheading text-subheading text-on-surface">Resumen Económico</h3>
    <div class="space-y-2 text-on-surface">
      <div class="flex justify-between items-center font-body-sm text-body-sm"><span class="text-on-surface-variant">Subtotal productos (${r.unidades} ${r.unidades === 1 ? 'unidad' : 'unidades'})</span><span class="font-label-lg text-label-lg tnum">${precio(r.subtotal)}</span></div>
      ${r.promo.descuento > 0 ? `<div class="flex justify-between items-center font-body-sm text-body-sm"><span class="flex items-center gap-1 text-secondary">${ico('local_offer', 'text-[16px]')}<span>${esc(r.promo.nombre)}</span></span><span class="font-label-lg text-label-lg text-secondary tnum">-${precio(r.promo.descuento)}</span></div>` : ''}
      <div class="flex justify-between items-center font-body-sm text-body-sm"><span class="text-on-surface-variant">Envío estimado</span>
        ${r.envio == null ? '<span class="font-label-md text-label-md text-on-surface-variant">A coordinar por WhatsApp</span>'
          : r.gratis ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm">Bonificado (${precio(0)})</span>`
          : `<span class="font-label-lg text-label-lg tnum">${precio(r.envio)}</span>`}</div>
      <div class="pt-2 mt-1 flex justify-between items-baseline bg-surface-container-low p-space-sm rounded-lg">
        <div class="flex flex-col"><span class="font-label-md text-label-md text-on-surface">Total Estimado a Cotizar</span><span class="font-label-sm text-label-sm text-on-surface-variant">Sin cargos sorpresa</span></div>
        <span class="font-headline-md text-headline-md text-primary tnum">${precio(r.total)}</span></div>
    </div>
    <details class="group" ${codigoExtra ? 'open' : ''}>
      <summary class="list-none cursor-pointer flex items-center gap-1 font-label-md text-label-md text-primary select-none">${ico('confirmation_number', 'text-[18px]')} ¿Tienes un código de descuento?${ico('expand_more', 'text-[18px] transition-transform group-open:rotate-180')}</summary>
      ${codigoExtra
        ? `<div class="mt-2 flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-secondary-fixed/40 text-on-secondary-fixed-variant"><span class="font-label-md text-label-md">${ico('check_circle', 'text-[16px] align-[-3px]', true)} Código ${esc(codigoExtra.codigo)} aplicado${r.promo.codigo === codigoExtra.codigo ? '' : ' (ya tienes un descuento mejor)'}</span>
           <button type="button" id="quitarCodigo" class="font-label-sm text-label-sm underline">Quitar</button></div>`
        : `<form id="formCodigo" class="mt-2 flex gap-2"><input id="codigo" class="campo h-11 uppercase" maxlength="20" placeholder="Ej. BIENVENIDO" aria-label="Código de descuento" autocomplete="off">
           <button class="btn-secundario h-11" type="submit">Aplicar</button></form><p id="errorCodigo" class="ayuda text-error hidden"></p>`}
    </details>
  </div>`;
}

const campo = (id, etiqueta, icono, valor, placeholder, extra = '') => `<div class="flex flex-col space-y-1">
    <label class="font-label-sm text-label-sm text-on-surface-variant" for="${id}">${etiqueta}</label>
    <div class="relative">${ico(icono, 'absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant pointer-events-none')}
      <input id="${id}" class="w-full h-12 pl-9 pr-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface focus:outline-none focus:bg-surface-container-highest focus:ring-2 focus:ring-primary/20 transition-colors" value="${esc(valor)}" placeholder="${esc(placeholder)}" ${extra}></div></div>`;

function htmlFormulario() {
  return `<div class="bg-surface-container-lowest p-space-md rounded-xl shadow-sm space-y-space-sm">
    <div class="flex items-center space-x-2">${ico('person_pin_circle', 'text-primary text-[20px]')}
      <div><h3 class="font-subheading text-subheading text-on-surface">Datos para tu Asesor</h3>
        <p class="font-label-sm text-label-sm text-on-surface-variant">Agiliza la respuesta sin necesidad de contraseñas</p></div></div>
    <div class="space-y-space-sm">
      ${campo('cliNombre', 'Nombre y Apellido *', 'person', cliente.nombre, 'Tu nombre', 'autocomplete="name" maxlength="80" required')}
      <p id="errorNombre" class="font-label-sm text-label-sm text-error hidden -mt-1">Escribe tu nombre para que el asesor sepa quién eres.</p>
      ${campo('cliCiudad', 'Ciudad / Municipio de entrega', 'location_on', cliente.ciudad, 'Ej. Zapopan, Monterrey...', 'autocomplete="address-level2" maxlength="80"')}
      ${campo('cliTelefono', 'Tu WhatsApp (opcional)', 'call', cliente.telefono, 'Con código de país, ej. +52 33 1234 5678', 'type="tel" inputmode="tel" autocomplete="tel" maxlength="20"')}
      <p id="errorTelefono" class="font-label-sm text-label-sm text-error hidden -mt-1">Revisa el número: de 7 a 15 dígitos con código de país.</p>
      ${campo('cliNota', 'Nota u horario preferido (opcional)', 'chat_bubble', cliente.nota, 'Alguna indicación especial', 'maxlength="300"')}
    </div></div>`;
}

function htmlVistaPrevia(r) {
  const lineas = mensaje(r, 'WA-····').split('\n');
  const html = lineas.map((l) => esc(l).replace(/\*(.+?)\*/g, '<strong>$1</strong>')).join('<br>');
  return `<div class="flex flex-col space-y-1.5">
    <div class="flex items-center justify-between px-1">
      <span class="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Así se verá tu mensaje al enviar</span>
      <span class="flex items-center text-wa font-label-sm text-label-sm gap-0.5">${ico('lock', 'text-[14px]')} Vista previa</span></div>
    <div class="bg-wa-burbuja text-wa-oscuro p-space-sm rounded-2xl rounded-tr-none shadow-sm space-y-1.5">
      <div class="flex items-center space-x-1.5 pb-1 opacity-80">${ico('qr_code_2', 'text-[16px]')}<span class="font-label-sm text-label-sm font-bold">Mensaje Pre-configurado</span></div>
      <p id="textoVistaPrevia" class="font-body-sm text-body-sm leading-snug break-words">${html}</p>
      <div class="flex justify-end items-center gap-1 opacity-60 text-right pt-0.5"><span class="font-label-sm text-[10px]">${esc(hora(new Date()))}</span>${ico('done_all', 'text-[14px]')}</div>
    </div></div>`;
}

function htmlAcciones(r) {
  return `<div class="flex flex-col space-y-space-sm pt-2">
    ${errorEnvio ? `<div class="flex items-start gap-2 p-3 rounded-xl bg-error-container text-on-error-container" role="alert">${ico('error', 'text-[20px]')}
      <div class="flex-1"><p class="font-label-lg text-label-lg">${esc(errorEnvio)}</p>
      <button type="button" id="enviarSinRegistro" class="mt-1 font-label-md text-label-md underline">Enviar igual por WhatsApp</button></div></div>` : ''}
    ${d.cfg.abierta === false ? `<p class="font-label-md text-label-md text-[#92400E] flex items-center gap-1">${ico('schedule', 'text-[16px]')} Fuera de horario: tu pedido se atenderá al abrir.</p>` : ''}
    <button type="button" id="enviar" ${enviando || !r.validas.length ? 'disabled' : ''} class="w-full min-h-14 py-2 bg-wa hover:bg-wa-hover active:scale-[0.99] text-white rounded-xl flex items-center justify-center gap-2 shadow-wa-fuerte transition-all disabled:opacity-60 disabled:pointer-events-none">
      ${enviando ? '<svg class="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" d="M4 12a8 8 0 018-8v8H4z" fill="currentColor"></path></svg>' : ico('chat', 'text-[26px]', true)}
      <span class="font-headline-sm text-headline-sm tracking-wide">${enviando ? 'Preparando tu pedido…' : 'Enviar Pedido Completo a WhatsApp'}</span></button>
    <div class="flex items-start space-x-2 px-1">${ico('verified_user', 'text-secondary text-[18px] shrink-0 mt-0.5')}
      <p class="font-label-sm text-label-sm text-on-surface-variant leading-tight">No requerimos tarjeta de crédito ahora. Un asesor te responderá de inmediato para confirmar existencias y entrega.</p></div>
    <a class="w-full py-3 text-center text-primary font-label-lg text-label-lg hover:bg-surface-container rounded-lg transition-colors flex items-center justify-center space-x-1" href="${ruta('catalogo.html')}">${ico('arrow_back', 'text-[18px]')}<span>Continuar explorando el catálogo</span></a>
  </div>`;
}

function pintar() {
  const items = leerPedido();
  if (!items.length) { contenido.innerHTML = htmlVacio(); return; }
  const r = resumen();
  contenido.innerHTML = `
    <div class="lg:grid lg:grid-cols-[1fr_420px] lg:gap-8 lg:items-start">
      <div class="flex flex-col space-y-space-md">
        <div class="flex flex-col space-y-space-sm">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-space-xs"><span class="w-2.5 h-2.5 rounded-full bg-secondary"></span>
              <h1 class="font-headline-sm text-headline-sm text-on-surface">Mi Lista de Pedido <span class="text-on-surface-variant font-label-md text-label-md">(${r.lineas.length} ${r.lineas.length === 1 ? 'producto' : 'productos'})</span></h1></div>
            <button type="button" id="vaciar" class="flex items-center space-x-1 text-on-surface-variant hover:text-error transition-colors px-2 py-1 rounded-lg">${ico('delete_sweep', 'text-[16px]')}<span class="font-label-sm text-label-sm">Vaciar lista</span></button>
          </div>
          ${htmlBarraEnvio(r)}
        </div>
        <div class="flex flex-col space-y-space-sm">${r.lineas.map(htmlLinea).join('')}</div>
        <div id="resumen">${htmlResumen(r)}</div>
      </div>
      <div class="flex flex-col space-y-space-md mt-space-md lg:mt-0 lg:sticky lg:top-20">
        ${htmlFormulario()}
        <div id="vistaPrevia">${htmlVistaPrevia(r)}</div>
        <div id="acciones">${htmlAcciones(r)}</div>
      </div>
    </div>`;
}

function refrescarParcial() {
  const r = resumen();
  if ($('#vistaPrevia')) $('#vistaPrevia').innerHTML = htmlVistaPrevia(r);
}

// ---------------- Envío ----------------
function validar() {
  const nombre = $('#cliNombre').value.trim();
  const tel = soloDigitos($('#cliTelefono').value);
  let ok = true;
  $('#errorNombre').classList.toggle('hidden', nombre.length >= 2);
  if (nombre.length < 2) { ok = false; $('#cliNombre').focus(); }
  const telMal = tel && (tel.length < 7 || tel.length > 15);
  $('#errorTelefono').classList.toggle('hidden', !telMal);
  if (telMal && ok) { ok = false; $('#cliTelefono').focus(); }
  return ok;
}

function datosCliente() {
  return { nombre: $('#cliNombre').value.trim(), ciudad: $('#cliCiudad').value.trim(), telefono: $('#cliTelefono').value.trim(), nota: $('#cliNota').value.trim() };
}

async function enviar() {
  if (enviando || !validar()) return;
  const r = resumen();
  if (r.validas.some((l) => l.cantidad > maximoPedido(l.producto, l.varianteObj))) { toast('Ajusta las cantidades marcadas en rojo', { icono: 'inventory_2', error: true }); return; }
  const cli = datosCliente();
  guardarCliente(cli);
  // La ventana se abre ya (gesto del usuario) para que el navegador no la bloquee; luego se le pone la dirección.
  const ventana = window.open('', '_blank');
  if (ventana) { try { ventana.document.write('<p style="font-family:sans-serif;padding:24px">Abriendo WhatsApp…</p>'); } catch { /* nada */ } }
  enviando = true; errorEnvio = '';
  $('#acciones').innerHTML = htmlAcciones(r);
  try {
    const res = await db.rpc('mt_crear_pedido', {
      p: {
        items: r.validas.map((l) => ({ producto_id: l.producto_id, variante: l.variante, garantia: l.garantiaObj?.nombre || null, cantidad: l.cantidad })),
        cliente: { nombre: cli.nombre, ciudad: cli.ciudad, telefono: cli.telefono, nota: cli.nota },
        codigo: codigoExtra?.codigo || null, visitante: visitante(), canal: 'carrito',
      },
    });
    const rServidor = {
      validas: res.items.map((i) => ({ cantidad: i.cantidad, producto: { nombre: i.nombre }, variante: i.variante, garantiaObj: i.garantia ? { nombre: i.garantia, precio_extra: 1 } : null, subtotal: num(i.subtotal) })),
      promo: { descuento: num(res.descuento), nombre: res.descuento_nombre }, envio: res.envio, gratis: res.envio != null && num(res.envio) === 0, total: num(res.total),
    };
    const texto = mensaje(rServidor, res.numero);
    guardarMiPedido({
      numero: res.numero, codigo: res.codigo, total: num(res.total), moneda: res.moneda, fecha: res.creado_en, estado: res.estado, mensaje: texto,
      items: res.items.map((i) => ({ producto_id: i.producto_id, nombre: i.nombre, cantidad: i.cantidad, variante: i.variante, garantia: i.garantia, imagen: i.imagen, subtotal: num(i.subtotal) })),
      unidades: res.unidades, subtotal: num(res.subtotal), descuento: num(res.descuento), descuento_nombre: res.descuento_nombre, envio: res.envio,
    });
    if (ventana) abrirWhatsApp(texto, { ventana, registrarClic: false });
    vaciarPedido();
    location.href = ruta(`pedido-enviado.html?n=${encodeURIComponent(res.numero)}${ventana ? '' : '&abrir=1'}`);
  } catch (e) {
    try { ventana?.close(); } catch { /* nada */ }
    enviando = false;
    errorEnvio = e.message || 'No pudimos registrar tu pedido.';
    if (/agotado|quedan|disponible|opción/i.test(errorEnvio)) {
      olvidarCache();
      d = await cargarDatos({ fresco: true });
    }
    pintar();
    $('#acciones')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// ---------------- Eventos ----------------
contenido.addEventListener('click', async (e) => {
  const t = e.target;
  const quitar = t.closest('[data-quitar]');
  if (quitar) { cambiarCantidad(Number(quitar.dataset.quitar), 0); toast('Producto quitado de tu pedido', { icono: 'delete' }); return; }
  const menos = t.closest('[data-menos]');
  if (menos) { const i = Number(menos.dataset.menos); cambiarCantidad(i, leerPedido()[i].cantidad - 1); return; }
  const mas = t.closest('[data-mas]');
  if (mas) { const i = Number(mas.dataset.mas); cambiarCantidad(i, leerPedido()[i].cantidad + 1); return; }
  if (t.closest('#vaciar')) {
    if (confirm('¿Vaciar toda tu lista de pedido?')) { vaciarPedido(); toast('Lista vaciada', { icono: 'delete_sweep' }); }
    return;
  }
  if (t.closest('#quitarCodigo')) { codigoExtra = null; pintar(); return; }
  if (t.closest('#enviar')) { await enviar(); return; }
  if (t.closest('#enviarSinRegistro')) {
    if (!validar()) return;
    guardarCliente(datosCliente());
    abrirWhatsApp(mensaje(resumen()), { canal: 'carrito', pagina: 'pedido' });
  }
});

contenido.addEventListener('submit', async (e) => {
  if (e.target.id !== 'formCodigo') return;
  e.preventDefault();
  const valor = $('#codigo').value.trim().toUpperCase();
  if (!valor) return;
  const boton = e.target.querySelector('button');
  boton.disabled = true;
  try {
    const res = await db.rpc('mt_validar_codigo', { p_codigo: valor, p_subtotal: resumen().subtotal });
    if (!res?.ok) throw new Error(res?.error || 'Código no válido');
    codigoExtra = { ...res, activa: true };
    toast(`Código ${res.codigo} aplicado`, { icono: 'confirmation_number' });
    pintar();
  } catch (err) {
    $('#errorCodigo').textContent = err.message;
    $('#errorCodigo').classList.remove('hidden');
    boton.disabled = false;
  }
});

const guardarFormulario = debounce(() => { guardarCliente(datosCliente()); refrescarParcial(); }, 250);
contenido.addEventListener('input', (e) => {
  if (e.target.id?.startsWith('cli')) {
    if (e.target.id === 'cliNombre' && e.target.value.trim().length >= 2) $('#errorNombre').classList.add('hidden');
    guardarFormulario();
  }
});

alCambiarPedido(() => { if (!enviando) pintar(); });
pintar();
