// Mi cuenta (pantalla nueva): pedidos enviados desde este dispositivo, favoritos y datos guardados.
// Sin contraseñas: todo vive en el navegador del cliente; el estado del pedido se consulta al servidor.
import { $, esc, ico, num, fechaHora, iniciales, soloDigitos } from '../util.js';
import { db, urlImagen, ruta } from '../api.js';
import { iniciarTienda, precio, abrirWhatsApp, toast, textoTienda } from './base.js';
import { leerMisPedidos, guardarMiPedido, leerFavoritos, leerCliente, guardarCliente, olvidarMisDatos, agregarAlPedido } from './estado.js';
import { tarjetaCatalogo, conectarTarjetas } from './tarjetas.js';
import { chipEstado } from './estados-pedido.js';

const d = await iniciarTienda({ pagina: 'cuenta', subtitulo: 'Mi cuenta' });
const contenido = $('#contenido');
const PESTANAS = [['pedidos', 'receipt_long', 'Mis pedidos'], ['favoritos', 'favorite', 'Favoritos'], ['datos', 'badge', 'Mis datos']];
let pestana = PESTANAS.some(([id]) => `#${id}` === location.hash) ? location.hash.slice(1) : 'pedidos';
let estados = {};

function encabezado() {
  const cli = leerCliente();
  return `<div class="flex items-center gap-3 pt-3">
      <div class="w-14 h-14 rounded-full bg-surface-container-high ring-2 ring-primary/20 flex items-center justify-center font-headline-sm text-headline-sm text-primary">${cli.nombre ? esc(iniciales(cli.nombre)) : ico('person', 'text-[28px]')}</div>
      <div class="min-w-0"><h1 class="font-headline-md text-headline-md text-on-surface truncate">${cli.nombre ? `Hola, ${esc(cli.nombre.split(' ')[0])}` : 'Mi cuenta'}</h1>
        <p class="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1">${ico('lock', 'text-[14px]')} Sin contraseñas: tus datos se guardan sólo en este dispositivo.</p></div>
    </div>
    <div class="flex gap-2 mt-space-md overflow-x-auto no-scrollbar" role="tablist">
      ${PESTANAS.map(([id, icono, t]) => `<button type="button" role="tab" data-pestana="${id}" aria-selected="${pestana === id}" class="px-4 py-2 rounded-full font-label-lg text-label-lg shrink-0 flex items-center gap-1.5 transition-all ${pestana === id ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface-container text-on-surface-variant hover:text-on-surface'}">${ico(icono, 'text-[18px]', pestana === id)}${t}</button>`).join('')}
    </div>`;
}

function vistaPedidos() {
  const lista = leerMisPedidos();
  if (!lista.length) {
    return `<div class="py-14 text-center flex flex-col items-center gap-2 rounded-2xl bg-surface-container-lowest shadow-sm mt-space-md">${ico('receipt_long', 'text-[40px] text-outline')}
      <p class="font-subheading text-subheading">Aún no has enviado pedidos desde aquí</p>
      <p class="font-body-sm text-body-sm text-on-surface-variant max-w-xs">Cuando envíes tu lista por WhatsApp la verás en esta sección con su estado.</p>
      <a href="${ruta('catalogo.html')}" class="btn-primario mt-2">${ico('grid_view', 'text-[18px]')} Ir al catálogo</a></div>`;
  }
  return `<div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-space-md">${lista.map((p) => `<article class="bg-surface-container-lowest rounded-2xl shadow-sm p-space-md flex flex-col gap-3">
      <div class="flex items-start justify-between gap-2"><div>
        <p class="font-headline-sm text-headline-sm tnum">${esc(p.numero)}</p>
        <p class="font-body-sm text-body-sm text-on-surface-variant">${esc(fechaHora(p.fecha))} · ${num(p.unidades) || p.items.reduce((s, i) => s + i.cantidad, 0)} u.</p></div>
        ${chipEstado(estados[p.numero] || p.estado)}</div>
      <div class="flex -space-x-2">${p.items.slice(0, 5).map((i) => `<img src="${esc(urlImagen(i.imagen))}" alt="${esc(i.nombre)}" title="${esc(i.nombre)}" class="w-11 h-11 rounded-full object-cover ring-2 ring-white bg-surface-container" loading="lazy">`).join('')}
        ${p.items.length > 5 ? `<span class="w-11 h-11 rounded-full ring-2 ring-white bg-surface-container flex items-center justify-center font-label-md text-label-md">+${p.items.length - 5}</span>` : ''}</div>
      <p class="font-body-sm text-body-sm text-on-surface-variant line-clamp-2">${p.items.map((i) => `${i.cantidad}x ${esc(i.nombre)}`).join(' · ')}</p>
      <div class="flex items-center justify-between gap-2 pt-1 border-t border-surface-container">
        <span class="font-headline-sm text-headline-sm text-primary tnum pt-2">${precio(p.total)}</span>
        <div class="flex gap-1.5 pt-2">
          <button type="button" data-repetir="${esc(p.numero)}" class="btn-secundario btn-sm">${ico('replay', 'text-[16px]')} Repetir</button>
          <button type="button" data-consultar="${esc(p.numero)}" class="btn-wa btn-sm">${ico('chat', 'text-[16px]', true)} Consultar</button>
        </div></div>
    </article>`).join('')}</div>`;
}

function vistaFavoritos() {
  const favs = leerFavoritos();
  const lista = [...favs].map((id) => d.porId.get(id)).filter(Boolean);
  if (!lista.length) {
    return `<div class="py-14 text-center flex flex-col items-center gap-2 rounded-2xl bg-surface-container-lowest shadow-sm mt-space-md">${ico('favorite', 'text-[40px] text-outline')}
      <p class="font-subheading text-subheading">Todavía no tienes favoritos</p>
      <p class="font-body-sm text-body-sm text-on-surface-variant max-w-xs">Toca el corazón en cualquier producto del catálogo para guardarlo aquí.</p>
      <a href="${ruta('catalogo.html')}" class="btn-primario mt-2">${ico('grid_view', 'text-[18px]')} Explorar catálogo</a></div>`;
  }
  return `<div id="gridFavoritos" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 lg:gap-5 mt-space-md">${lista.map((p) => tarjetaCatalogo(p, favs)).join('')}</div>`;
}

function vistaDatos() {
  const cli = leerCliente();
  const campo = (id, etiqueta, valor, extra = '') => `<div><label class="etiqueta" for="${id}">${etiqueta}</label><input id="${id}" class="campo" value="${esc(valor)}" ${extra}></div>`;
  return `<form id="formDatos" class="bg-surface-container-lowest rounded-2xl shadow-sm p-space-md mt-space-md flex flex-col gap-3 max-w-xl">
      <p class="font-body-sm text-body-sm text-on-surface-variant">Usamos estos datos para llenar tu pedido más rápido. No se envían a ningún lado hasta que mandas un pedido.</p>
      ${campo('datNombre', 'Nombre y apellido', cli.nombre, 'autocomplete="name" maxlength="80"')}
      ${campo('datCiudad', 'Ciudad / municipio de entrega', cli.ciudad, 'autocomplete="address-level2" maxlength="80"')}
      ${campo('datTelefono', 'Tu WhatsApp (opcional)', cli.telefono, 'type="tel" inputmode="tel" maxlength="20"')}
      ${campo('datNota', 'Nota u horario preferido', cli.nota, 'maxlength="300"')}
      <div class="flex flex-col sm:flex-row gap-2 pt-1">
        <button class="btn-primario h-11" type="submit">${ico('save', 'text-[18px]')} Guardar mis datos</button>
        <button class="btn-peligro-suave h-11" type="button" id="olvidar">${ico('delete', 'text-[18px]')} Borrar todo de este dispositivo</button>
      </div>
    </form>`;
}

function pintar() {
  const vistas = { pedidos: vistaPedidos, favoritos: vistaFavoritos, datos: vistaDatos };
  contenido.innerHTML = `${encabezado()}<div role="tabpanel">${vistas[pestana]()}</div>`;
  if ($('#gridFavoritos')) conectarTarjetas($('#gridFavoritos'), { pagina: 'cuenta', alCambiarFavorito: (p, activo) => { if (!activo) setTimeout(pintar, 400); } });
}

async function actualizarEstados() {
  const lista = leerMisPedidos();
  if (!lista.length) return;
  try {
    const res = await db.rpc('mt_estado_pedidos', { p: lista.slice(0, 20).map((p) => ({ numero: p.numero, codigo: p.codigo })) });
    estados = Object.fromEntries(res.map((r) => [r.numero, r.estado]));
    lista.forEach((p) => { if (estados[p.numero] && estados[p.numero] !== p.estado) guardarMiPedido({ ...p, estado: estados[p.numero] }); });
    if (pestana === 'pedidos') pintar();
  } catch { /* sin conexión: se muestran los últimos estados guardados */ }
}

contenido.addEventListener('click', (e) => {
  const pest = e.target.closest('[data-pestana]');
  if (pest) { pestana = pest.dataset.pestana; history.replaceState(null, '', `#${pestana}`); pintar(); return; }
  const rep = e.target.closest('[data-repetir]');
  if (rep) {
    const p = leerMisPedidos().find((x) => x.numero === rep.dataset.repetir);
    let agregados = 0;
    for (const i of p?.items || []) {
      const prod = d.porId.get(i.producto_id);
      if (!prod) continue;
      agregarAlPedido({ producto_id: prod.id, variante: i.variante || null, garantia: i.garantia || null, cantidad: i.cantidad });
      agregados++;
    }
    if (agregados) { toast(`${agregados} ${agregados === 1 ? 'producto agregado' : 'productos agregados'} a tu pedido`); setTimeout(() => { location.href = ruta('pedido.html'); }, 700); }
    else toast('Esos productos ya no están disponibles', { icono: 'info', error: true });
    return;
  }
  const con = e.target.closest('[data-consultar]');
  if (con) { abrirWhatsApp(textoTienda(`Hola {tienda}, quiero consultar el estado de mi pedido ${con.dataset.consultar}.`), { canal: 'general', pagina: 'cuenta' }); return; }
  if (e.target.closest('#olvidar') && confirm('¿Borrar tus datos, favoritos, lista de pedido e historial de este dispositivo?')) {
    olvidarMisDatos();
    toast('Listo, borramos tus datos de este dispositivo', { icono: 'delete' });
    pintar();
  }
});

contenido.addEventListener('submit', (e) => {
  if (e.target.id !== 'formDatos') return;
  e.preventDefault();
  const tel = $('#datTelefono').value.trim();
  if (tel && (soloDigitos(tel).length < 7 || soloDigitos(tel).length > 15)) { toast('Revisa el teléfono: 7 a 15 dígitos con código de país', { icono: 'error', error: true }); return; }
  guardarCliente({ nombre: $('#datNombre').value.trim(), ciudad: $('#datCiudad').value.trim(), telefono: tel, nota: $('#datNota').value.trim() });
  toast('Datos guardados en este dispositivo', { icono: 'save' });
  pintar();
});

pintar();
actualizarEstados();
