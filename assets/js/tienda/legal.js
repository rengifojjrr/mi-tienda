// Garantía & Legal (pantalla nueva): devoluciones, términos y privacidad. Textos editables en el panel.
import { $, ico, markdown } from '../util.js';
import { iniciarTienda } from './base.js';

const d = await iniciarTienda({ pagina: 'soporte', subtitulo: 'Garantía & Legal' });
const SECCIONES = [['devoluciones', 'assignment_return', 'Devoluciones'], ['terminos', 'description', 'Términos'], ['privacidad', 'shield', 'Privacidad']];
const legal = d.contenido.legal || {};
const actual = () => (SECCIONES.some(([id]) => `#${id}` === location.hash) ? location.hash.slice(1) : 'devoluciones');

function pintar() {
  const sec = actual();
  $('#contenido').innerHTML = `<div class="max-w-3xl mx-auto pt-3">
    <div class="flex gap-2 overflow-x-auto no-scrollbar" role="tablist">
      ${SECCIONES.map(([id, icono, t]) => `<a href="#${id}" role="tab" aria-selected="${sec === id}" class="px-4 py-2 rounded-full font-label-lg text-label-lg shrink-0 flex items-center gap-1.5 transition-all ${sec === id ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface-container text-on-surface-variant hover:text-on-surface'}">${ico(icono, 'text-[18px]')}${t}</a>`).join('')}
    </div>
    <article class="mt-space-md bg-surface-container-lowest rounded-2xl shadow-sm p-space-md lg:p-8 prosa">${markdown(legal[sec] || 'Contenido en preparación.')}</article>
    <p class="mt-3 font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1">${ico('info', 'text-[16px]')} ¿Dudas sobre estas condiciones? Escríbenos por WhatsApp y te ayudamos.</p>
  </div>`;
  document.title = `${SECCIONES.find(([id]) => id === sec)[2]} · ${d.cfg.nombre}`;
}
window.addEventListener('hashchange', () => { pintar(); window.scrollTo({ top: 0 }); });
pintar();
