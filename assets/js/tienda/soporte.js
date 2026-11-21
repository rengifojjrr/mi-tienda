// Centro de soporte (pantalla nueva): contacto, rastreo de pedido, preguntas frecuentes y políticas.
import { $, esc, ico, telefonoBonito, fechaHora } from '../util.js';
import { db, ruta } from '../api.js';
import { iniciarTienda, enlaceWhatsApp, textoTienda, precio } from './base.js';
import { leerMisPedidos } from './estado.js';
import { faqHtml, conectarFaq } from './secciones.js';
import { chipEstado, LINEA_TIEMPO, pasoDe } from './estados-pedido.js';

const d = await iniciarTienda({ pagina: 'soporte', subtitulo: 'Soporte' });
const c = d.cfg;
const soporte = d.contenido.soporte || {};

const tarjetaContacto = (icono, titulo, valor, href, clases = 'bg-primary/10 text-primary') => `<${href ? `a href="${esc(href)}" ${/^https?:/.test(href) ? 'target="_blank" rel="noopener"' : ''}` : 'div'}
    class="flex items-center gap-3 p-3.5 rounded-xl bg-surface-container-lowest shadow-sm ${href ? 'hover:shadow-md transition-shadow' : ''}">
    <span class="w-11 h-11 rounded-full ${clases} flex items-center justify-center shrink-0">${ico(icono, 'text-[22px]', icono === 'chat')}</span>
    <span class="min-w-0"><span class="block font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">${titulo}</span>
      <span class="block font-label-lg text-label-lg text-on-surface truncate">${esc(valor)}</span></span></${href ? 'a' : 'div'}>`;

$('#contenido').innerHTML = `
  <div class="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary via-primary-container to-inverse-surface text-on-primary p-space-lg lg:p-10 shadow-lg mt-space-sm">
    <div class="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-secondary-fixed/20 blur-2xl"></div>
    <div class="relative flex flex-col gap-space-sm max-w-xl">
      <div class="inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-full bg-surface-container-lowest/20 backdrop-blur-md">${ico('support_agent', 'text-secondary-fixed text-[16px]', true)}<span class="font-label-sm text-label-sm tracking-wide uppercase text-surface-bright">Centro de soporte</span></div>
      <h1 class="font-headline-lg-mobile text-headline-lg-mobile lg:font-headline-lg lg:text-headline-lg">${esc(soporte.titulo || '¿En qué te ayudamos?')}</h1>
      <p class="font-body-md text-body-md text-on-primary-container/90">${esc(soporte.texto || '')}</p>
      <div class="flex flex-col sm:flex-row gap-space-xs pt-1">
        <a data-wa-general target="_blank" rel="noopener" href="${esc(enlaceWhatsApp(textoTienda('Hola {tienda}, necesito ayuda con')))}" class="h-12 px-space-md rounded-lg bg-wa hover:bg-wa-hover text-white font-label-lg text-label-lg flex items-center justify-center gap-2 shadow-[0_8px_20px_-4px_rgba(37,211,102,0.4)]">${ico('chat', 'text-[20px]', true)} Escríbenos por WhatsApp</a>
        <a href="#rastreo" class="h-12 px-space-md rounded-lg bg-surface-container-lowest text-primary font-label-lg text-label-lg flex items-center justify-center gap-2 shadow-md">${ico('local_shipping', 'text-[20px]')} Rastrear mi pedido</a>
      </div>
    </div>
  </div>

  <section class="mt-space-lg grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5" aria-label="Contacto">
    ${tarjetaContacto('chat', 'WhatsApp', c.whatsapp ? telefonoBonito(c.whatsapp) : 'Escríbenos aquí', enlaceWhatsApp(textoTienda('Hola {tienda}')), 'bg-wa/15 text-wa-hover')}
    ${tarjetaContacto('schedule', 'Horario de atención', c.horario || 'Consultar por WhatsApp', null)}
    ${c.email ? tarjetaContacto('mail', 'Correo', c.email, `mailto:${c.email}`, 'bg-tertiary/10 text-tertiary') : ''}
    ${c.telefono ? tarjetaContacto('call', 'Teléfono', telefonoBonito(c.telefono) || c.telefono, `tel:+${String(c.telefono).replace(/\D/g, '')}`, 'bg-secondary/10 text-secondary') : ''}
    ${c.direccion || c.ciudad ? tarjetaContacto('location_on', 'Dirección', [c.direccion, c.ciudad, c.pais].filter(Boolean).join(', '), `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([c.direccion, c.ciudad, c.pais].filter(Boolean).join(', '))}`, 'bg-error/10 text-error') : ''}
  </section>

  <div class="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-start">
    <section id="rastreo" class="mt-space-lg scroll-mt-24" aria-labelledby="tituloRastreo">
      <div class="flex items-center gap-2 mb-space-sm">${ico('local_shipping', 'text-primary text-[22px]')}<h2 id="tituloRastreo" class="font-headline-sm text-headline-sm text-on-surface">Rastrea tu pedido</h2></div>
      <form id="formRastreo" class="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col gap-3">
        <div class="grid grid-cols-2 gap-2">
          <div><label class="etiqueta" for="numPedido">Número de pedido</label><input id="numPedido" class="campo uppercase" placeholder="WA-1024" required autocomplete="off"></div>
          <div><label class="etiqueta" for="telPedido">Últimos 4 dígitos de tu WhatsApp</label><input id="telPedido" class="campo" inputmode="numeric" maxlength="4" placeholder="1234" autocomplete="off"></div>
        </div>
        <p class="ayuda -mt-1">Si hiciste el pedido desde este dispositivo, basta con el número.</p>
        <button class="btn-primario h-11" type="submit">${ico('search', 'text-[18px]')} Consultar estado</button>
        <div id="resultadoRastreo" aria-live="polite"></div>
      </form>
    </section>

    <section id="preguntas" class="mt-space-lg scroll-mt-24" aria-labelledby="tituloPreguntas">
      <div class="flex items-center gap-2 mb-space-sm">${ico('help', 'text-primary text-[22px]')}<h2 id="tituloPreguntas" class="font-headline-sm text-headline-sm text-on-surface">Preguntas Frecuentes</h2></div>
      <div id="faq" class="flex flex-col gap-space-xs"></div>
    </section>
  </div>

  <section class="mt-space-lg" aria-labelledby="tituloPoliticas">
    <div class="flex items-center gap-2 mb-space-sm">${ico('gavel', 'text-primary text-[22px]')}<h2 id="tituloPoliticas" class="font-headline-sm text-headline-sm text-on-surface">Garantía y políticas</h2></div>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
      ${[['devoluciones', 'assignment_return', 'Política de Devolución', 'Cambios y garantías'], ['terminos', 'description', 'Términos del Servicio', 'Cómo funciona tu pedido'], ['privacidad', 'shield', 'Privacidad y Datos', 'Qué datos usamos']]
        .map(([id, icono, t, s]) => `<a href="${ruta(`legal.html#${id}`)}" class="flex items-center gap-3 p-3.5 rounded-xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-shadow">
          <span class="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary">${ico(icono, 'text-[20px]')}</span>
          <span class="flex-1"><span class="block font-label-lg text-label-lg">${t}</span><span class="block font-body-sm text-body-sm text-on-surface-variant">${s}</span></span>${ico('chevron_right', 'text-outline')}</a>`).join('')}
    </div>
  </section>`;

const faq = $('#faq');
faq.innerHTML = faqHtml(d.contenido.faq || []);
conectarFaq(faq);

$('#formRastreo').addEventListener('submit', async (e) => {
  e.preventDefault();
  const numero = $('#numPedido').value.trim().toUpperCase().replace(/^(\d)/, 'WA-$1');
  const tel = $('#telPedido').value.trim();
  const local = leerMisPedidos().find((p) => p.numero === numero);
  const salida = $('#resultadoRastreo');
  if (!local && tel.replace(/\D/g, '').length < 4) {
    salida.innerHTML = `<p class="font-label-md text-label-md text-error">Escribe los últimos 4 dígitos del WhatsApp que usaste en el pedido.</p>`;
    return;
  }
  salida.innerHTML = '<div class="h-16 esqueleto"></div>';
  try {
    const [r] = await db.rpc('mt_estado_pedidos', { p: [{ numero, codigo: local?.codigo || null, telefono: tel || null }] });
    if (!r) {
      salida.innerHTML = `<div class="p-3 rounded-xl bg-surface-container-low font-body-md text-body-md text-on-surface-variant">No encontramos el pedido <strong>${esc(numero)}</strong> con esos datos. Revisa el número o
        <a class="text-primary underline" target="_blank" rel="noopener" href="${esc(enlaceWhatsApp(textoTienda(`Hola {tienda}, quiero saber el estado de mi pedido ${numero}`)))}">pregúntanos por WhatsApp</a>.</div>`;
      return;
    }
    const paso = pasoDe(r.estado);
    salida.innerHTML = `<div class="p-3.5 rounded-xl bg-surface-container-low flex flex-col gap-3">
      <div class="flex items-center justify-between gap-2"><div><p class="font-headline-sm text-headline-sm tnum">${esc(r.numero)}</p>
        <p class="font-body-sm text-body-sm text-on-surface-variant">${r.unidades} u. · ${precio(r.total)} · actualizado ${esc(fechaHora(r.actualizado_en))}</p></div>${chipEstado(r.estado)}</div>
      ${r.estado === 'cancelado' ? '' : `<div class="flex items-center gap-1">${LINEA_TIEMPO.map((x, i) => `<div class="flex-1 h-1.5 rounded-full ${i <= paso ? 'bg-primary' : 'bg-surface-container-high'}" title="${esc(x.titulo)}"></div>`).join('')}</div>
        <p class="font-label-md text-label-md text-on-surface">${esc(LINEA_TIEMPO[Math.max(0, paso)].titulo)}: <span class="font-body-sm text-body-sm text-on-surface-variant">${esc(LINEA_TIEMPO[Math.max(0, paso)].texto)}</span></p>`}
    </div>`;
  } catch (err) {
    salida.innerHTML = `<p class="font-label-md text-label-md text-error">${esc(err.message)}</p>`;
  }
});

if (location.hash) setTimeout(() => document.querySelector(location.hash)?.scrollIntoView({ behavior: 'smooth' }), 150);
