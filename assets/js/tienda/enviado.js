// Confirmación después de enviar el pedido (pantalla nueva).
import { $, esc, ico, num, fechaHora, copiar } from '../util.js';
import { db, urlImagen, ruta } from '../api.js';
import { iniciarTienda, precio, abrirWhatsApp, toast } from './base.js';
import { params, leerMisPedidos, guardarMiPedido } from './estado.js';
import { chipEstado, LINEA_TIEMPO, pasoDe } from './estados-pedido.js';

await iniciarTienda({ pagina: 'pedido', subtitulo: 'Pedido enviado', registrarVisita: false });
const numero = (params.get('n') || '').toUpperCase();
const pedido = leerMisPedidos().find((p) => p.numero === numero);
const debeAbrir = params.get('abrir') === '1';
const contenido = $('#contenido');

if (!pedido) {
  contenido.innerHTML = `<div class="max-w-md mx-auto py-16 text-center flex flex-col items-center gap-3">
    ${ico('receipt_long', 'text-[44px] text-outline')}
    <h1 class="font-headline-md text-headline-md">No encontramos ese pedido en este dispositivo</h1>
    <p class="font-body-md text-body-md text-on-surface-variant">Si lo hiciste desde otro teléfono, puedes consultarlo en Soporte con su número.</p>
    <div class="flex gap-2 mt-2"><a class="btn-primario" href="${ruta('soporte.html#rastreo')}">${ico('search', 'text-[18px]')} Rastrear pedido</a>
      <a class="btn-secundario" href="${ruta('catalogo.html')}">Ir al catálogo</a></div></div>`;
} else {
  pintar(pedido.estado || 'nuevo');
  db.rpc('mt_estado_pedidos', { p: [{ numero: pedido.numero, codigo: pedido.codigo }] })
    .then(([r]) => { if (r) { guardarMiPedido({ ...pedido, estado: r.estado }); pintar(r.estado); } })
    .catch(() => {});
}

function pintar(estado) {
  const paso = pasoDe(estado);
  contenido.innerHTML = `<div class="max-w-2xl mx-auto flex flex-col gap-space-md py-space-sm">
    <div class="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary via-primary-container to-inverse-surface text-on-primary p-space-lg shadow-lg text-center flex flex-col items-center gap-2">
      <div class="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-secondary-fixed/20 blur-2xl"></div>
      <div class="relative w-16 h-16 rounded-full bg-wa text-white flex items-center justify-center shadow-wa animate-rebote">${ico('check', 'text-[36px]')}</div>
      <h1 class="relative font-headline-lg-mobile text-headline-lg-mobile">¡Pedido ${debeAbrir ? 'registrado' : 'enviado'}!</h1>
      <p class="relative font-body-md text-body-md text-on-primary-container/90 max-w-md">${debeAbrir
        ? 'Tu navegador bloqueó la ventana de WhatsApp. Toca el botón para enviar el mensaje con tu pedido.'
        : 'Termina de enviar el mensaje en WhatsApp. Un asesor confirmará existencias, pago y entrega.'}</p>
      <button type="button" id="copiarNumero" class="relative mt-1 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-container-lowest/20 backdrop-blur-md font-headline-sm text-headline-sm tnum">
        ${esc(pedido.numero)} ${ico('content_copy', 'text-[18px]')}</button>
      <span class="relative">${chipEstado(estado)}</span>
    </div>

    <button type="button" id="abrirWa" class="w-full h-14 ${debeAbrir ? 'bg-wa hover:bg-wa-hover text-white shadow-wa-fuerte' : 'bg-wa/15 text-[#136633] hover:bg-wa/25'} rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.99]">
      ${ico('chat', 'text-[24px]', true)}<span class="font-headline-sm text-headline-sm">${debeAbrir ? 'Abrir WhatsApp y enviar' : 'Abrir WhatsApp de nuevo'}</span></button>

    <section class="bg-surface-container-lowest p-space-md rounded-xl shadow-sm">
      <h2 class="font-subheading text-subheading text-on-surface mb-3">¿Qué sigue?</h2>
      <ol class="flex flex-col gap-0">
        ${LINEA_TIEMPO.map((x, i) => {
          const hecho = paso >= i && estado !== 'cancelado';
          return `<li class="flex gap-3">
            <div class="flex flex-col items-center"><span class="w-8 h-8 rounded-full flex items-center justify-center ${hecho ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}">${ico(hecho ? 'check' : x.icono, 'text-[18px]')}</span>
              ${i < LINEA_TIEMPO.length - 1 ? `<span class="w-0.5 flex-1 min-h-6 ${paso > i ? 'bg-primary' : 'bg-surface-container-high'}"></span>` : ''}</div>
            <div class="pb-4"><p class="font-label-lg text-label-lg ${hecho ? 'text-on-surface' : 'text-on-surface-variant'}">${x.titulo}</p>
              <p class="font-body-sm text-body-sm text-on-surface-variant">${x.texto}</p></div></li>`;
        }).join('')}
      </ol>
      ${estado === 'cancelado' ? `<p class="mt-1 font-label-md text-label-md text-error">Este pedido fue cancelado. Escríbenos si quieres retomarlo.</p>` : ''}
    </section>

    <section class="bg-surface-container-lowest p-space-md rounded-xl shadow-sm">
      <div class="flex items-center justify-between mb-2"><h2 class="font-subheading text-subheading text-on-surface">Resumen</h2>
        <span class="font-label-sm text-label-sm text-on-surface-variant">${esc(fechaHora(pedido.fecha))}</span></div>
      <div class="flex flex-col divide-y divide-surface-container">
        ${pedido.items.map((i) => `<div class="flex items-center gap-3 py-2">
          <img src="${esc(urlImagen(i.imagen))}" alt="" class="w-12 h-12 rounded-lg object-cover bg-surface-container" loading="lazy">
          <div class="flex-1 min-w-0"><p class="font-label-lg text-label-lg text-on-surface truncate">${esc(i.nombre)}</p>
            <p class="font-body-sm text-body-sm text-on-surface-variant">${i.cantidad} ${i.cantidad === 1 ? 'unidad' : 'unidades'}${i.variante ? ` · ${esc(i.variante)}` : ''}</p></div>
          <span class="font-label-lg text-label-lg tnum">${precio(i.subtotal)}</span></div>`).join('')}
      </div>
      <div class="mt-2 pt-2 border-t border-surface-container flex flex-col gap-1 font-body-sm text-body-sm">
        ${num(pedido.descuento) > 0 ? `<div class="flex justify-between text-secondary"><span>${esc(pedido.descuento_nombre || 'Descuento')}</span><span class="tnum">-${precio(pedido.descuento)}</span></div>` : ''}
        <div class="flex justify-between text-on-surface-variant"><span>Envío</span><span class="tnum">${pedido.envio == null ? 'A coordinar' : num(pedido.envio) === 0 ? 'Bonificado' : precio(pedido.envio)}</span></div>
        <div class="flex justify-between items-baseline mt-1"><span class="font-label-lg text-label-lg">Total estimado</span><span class="font-headline-md text-headline-md text-primary tnum">${precio(pedido.total)}</span></div>
      </div>
    </section>

    <div class="grid grid-cols-2 gap-2">
      <a href="${ruta('cuenta.html#pedidos')}" class="btn-secundario h-12">${ico('receipt_long', 'text-[18px]')} Mis pedidos</a>
      <a href="${ruta('catalogo.html')}" class="btn-primario h-12">${ico('storefront', 'text-[18px]')} Seguir comprando</a>
    </div>
  </div>`;
}

contenido.addEventListener('click', async (e) => {
  if (e.target.closest('#abrirWa')) abrirWhatsApp(pedido.mensaje, { canal: 'carrito', pagina: 'enviado', registrarClic: false });
  if (e.target.closest('#copiarNumero') && await copiar(pedido.numero)) toast('Número de pedido copiado', { icono: 'content_copy' });
});
