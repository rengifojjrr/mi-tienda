// Catálogo general: búsqueda, filtros, categorías, orden, vista cuadrícula/lista y "cargar más".
import { $, esc, ico, debounce, ofertaVigente, precioVigente, disponibilidad } from '../util.js';
import { iniciarTienda, buscar, enlaceWhatsApp, textoTienda, precio } from './base.js';
import { registrar, params, leerFavoritos } from './estado.js';
import { tarjetaCatalogo, filaCatalogo, conectarTarjetas, esqueletoTarjetas } from './tarjetas.js';

const POR_PAGINA = 12;
const RANGOS = [
  { id: '', texto: 'Cualquier precio' },
  { id: '0-25', min: 0, max: 25 },
  { id: '25-50', min: 25, max: 50 },
  { id: '50-100', min: 50, max: 100 },
  { id: '100-', min: 100, max: Infinity },
];

const estado = {
  q: params.get('q') || '',
  cat: params.get('cat') || '',
  orden: params.get('orden') || 'populares',
  precio: params.get('precio') || '',
  oferta: params.get('oferta') === '1',
  disp: params.get('disp') === '1',
  envio: params.get('envio') === '1',
  vista: params.get('vista') || (() => { try { return localStorage.getItem('mt_vista') || 'cuadricula'; } catch { return 'cuadricula'; } })(),
  mostrar: POR_PAGINA,
};

$('#productos').innerHTML = esqueletoTarjetas(8);
const d = await iniciarTienda({ pagina: 'catalogo', subtitulo: 'Catálogo' });
const umbral = d.cfg.stock_bajo_umbral ?? 10;

const textoRango = (r) => (r.id === '' ? r.texto : r.max === Infinity ? `Más de ${precio(r.min)}` : r.min === 0 ? `Menor a ${precio(r.max)}` : `${precio(r.min)} – ${precio(r.max)}`);
const rangoActual = () => RANGOS.find((r) => r.id === estado.precio) || RANGOS[0];

// ---------------- Filtrado ----------------
function filtrar({ sinCategoria = false } = {}) {
  let lista = estado.q ? buscar(d, estado.q) : [...d.productos];
  if (!sinCategoria && estado.cat) {
    const cat = d.catPorSlug.get(estado.cat);
    lista = lista.filter((p) => cat && p.categoria_id === cat.id);
  }
  const r = rangoActual();
  if (r.id) lista = lista.filter((p) => { const v = precioVigente(p); return v >= r.min && v < r.max; });
  if (estado.oferta) lista = lista.filter((p) => ofertaVigente(p) || p.relampago);
  if (estado.disp) lista = lista.filter((p) => disponibilidad(p, null, umbral).codigo !== 'agotado');
  if (estado.envio) lista = lista.filter((p) => p.envio_gratis || (d.cfg.envio_gratis_desde != null && precioVigente(p) >= d.cfg.envio_gratis_desde));
  return lista;
}
function ordenar(lista) {
  const agotadoAlFinal = (a, b) => (disponibilidad(a, null, umbral).codigo === 'agotado') - (disponibilidad(b, null, umbral).codigo === 'agotado');
  const criterios = {
    populares: (a, b) => agotadoAlFinal(a, b) || (estado.q ? 0 : (b.destacado - a.destacado) || (b.ventas - a.ventas)),
    menor: (a, b) => precioVigente(a) - precioVigente(b),
    mayor: (a, b) => precioVigente(b) - precioVigente(a),
    nuevos: (a, b) => (b.novedad - a.novedad) || b.creado_en.localeCompare(a.creado_en),
    nombre: (a, b) => a.nombre.localeCompare(b.nombre, 'es'),
  };
  return [...lista].sort(criterios[estado.orden] || criterios.populares);
}

// ---------------- URL ----------------
function sincronizarUrl() {
  const u = new URLSearchParams();
  if (estado.q) u.set('q', estado.q);
  if (estado.cat) u.set('cat', estado.cat);
  if (estado.orden !== 'populares') u.set('orden', estado.orden);
  if (estado.precio) u.set('precio', estado.precio);
  if (estado.oferta) u.set('oferta', '1');
  if (estado.disp) u.set('disp', '1');
  if (estado.envio) u.set('envio', '1');
  if (params.get('vista_previa')) u.set('vista_previa', '1');
  history.replaceState(null, '', `${location.pathname}${u.toString() ? `?${u}` : ''}`);
}

// ---------------- Pintado ----------------
const contFiltros = () => [estado.precio, estado.oferta, estado.disp, estado.envio].filter(Boolean).length;

function pintarCategorias() {
  const base = filtrar({ sinCategoria: true });
  const total = base.length;
  const pill = (slug, icono, texto, n, colorIcono = 'text-on-surface-variant') => {
    const activo = estado.cat === slug;
    return `<button type="button" data-cat="${esc(slug)}" aria-pressed="${activo}" class="px-3.5 py-2 rounded-full font-label-md text-label-md shadow-sm active:scale-95 transition-all flex items-center gap-1.5 ${activo ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-high'}">
      ${ico(icono, `text-[16px] ${activo ? '' : colorIcono}`)}<span>${esc(texto)}</span>
      <span class="text-[11px] px-1.5 rounded-full font-bold tnum ${activo ? 'bg-white/20' : 'bg-surface-container text-on-surface-variant'}">${n}</span></button>`;
  };
  $('#categorias').innerHTML = pill('', 'all_inclusive', 'Todos', total, '')
    + d.categorias.map((c, i) => pill(c.slug, c.icono || 'category', c.nombre, base.filter((p) => p.categoria_id === c.id).length, i === 0 ? 'text-tertiary' : 'text-on-surface-variant')).join('');
}

function pintarRapidos() {
  const chip = (clave, icono, texto, colorIcono) => {
    const activo = estado[clave];
    return `<button type="button" data-rapido="${clave}" aria-pressed="${activo}" class="px-2.5 py-1 rounded-full font-label-sm text-label-sm flex items-center gap-1 active:scale-95 transition-transform shrink-0 ${activo ? 'bg-surface-container text-primary font-bold ring-1 ring-primary/30' : 'bg-surface-container-lowest text-on-surface-variant shadow-xs'}">
      ${ico(icono, `text-[13px] ${activo ? '' : colorIcono}`)}${texto}</button>`;
  };
  $('#rapidos').innerHTML = chip('disp', 'check_circle', 'Solo Disponibles', 'text-secondary') + chip('oferta', 'sell', 'En Oferta', 'text-tertiary-container') + chip('envio', 'local_shipping', 'Envío gratis', 'text-primary');
}

function pintarPanel() {
  const activos = [];
  if (estado.precio) activos.push(['precio', textoRango(rangoActual())]);
  if (estado.oferta) activos.push(['oferta', 'En Oferta']);
  if (estado.disp) activos.push(['disp', 'Solo disponibles']);
  if (estado.envio) activos.push(['envio', 'Envío gratis']);
  $('#panelFiltros').innerHTML = `<div class="p-3.5 rounded-xl bg-surface-container-low shadow-sm flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <span class="font-label-md text-label-md text-on-surface font-semibold">${activos.length ? 'Filtros Activos' : 'Filtrar productos'}</span>
      <button type="button" data-limpiar class="font-label-sm text-label-sm text-primary hover:underline">Limpiar todo</button>
    </div>
    ${activos.length ? `<div class="flex flex-wrap gap-1.5">${activos.map(([k, t], i) => `<span class="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full ${i === 0 ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface'} font-label-sm text-label-sm shadow-xs">${esc(t)}
      <button type="button" data-quitar="${k}" aria-label="Quitar filtro ${esc(t)}" class="w-5 h-5 rounded-full flex items-center justify-center hover:bg-black/10">${ico('close', 'text-[14px]')}</button></span>`).join('')}</div>` : ''}
    <div><p class="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant mb-1.5">Precio</p>
      <div class="flex flex-wrap gap-1.5">${RANGOS.map((r) => `<button type="button" data-precio="${r.id}" aria-pressed="${estado.precio === r.id}" class="px-3 py-1.5 rounded-full font-label-md text-label-md transition-colors ${estado.precio === r.id ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container'}">${esc(textoRango(r))}</button>`).join('')}</div></div>
    <div><p class="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant mb-1.5">Disponibilidad y envío</p>
      <div class="flex flex-wrap gap-1.5">
        ${[['disp', 'Solo disponibles'], ['oferta', 'En oferta'], ['envio', 'Envío gratis']].map(([k, t]) => `<button type="button" data-rapido="${k}" aria-pressed="${estado[k]}" class="px-3 py-1.5 rounded-full font-label-md text-label-md flex items-center gap-1 transition-colors ${estado[k] ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container'}">${estado[k] ? ico('check', 'text-[16px]') : ''}${t}</button>`).join('')}
      </div></div>
  </div>`;
  const n = contFiltros();
  const cont = $('#contadorFiltros');
  cont.textContent = n;
  cont.classList.toggle('hidden', n === 0);
}

function pintarVista() {
  const lista = estado.vista === 'lista';
  $('#vistaCuadricula').className = `w-8 h-8 rounded-md flex items-center justify-center transition-colors ${lista ? 'text-on-surface-variant hover:text-on-surface' : 'bg-surface-container text-primary'}`;
  $('#vistaLista').className = `w-8 h-8 rounded-md flex items-center justify-center transition-colors ${lista ? 'bg-surface-container text-primary' : 'text-on-surface-variant hover:text-on-surface'}`;
  $('#vistaCuadricula').setAttribute('aria-pressed', String(!lista));
  $('#vistaLista').setAttribute('aria-pressed', String(lista));
  $('#productos').className = lista
    ? 'px-margin lg:px-margin-desktop pt-3 grid grid-cols-1 md:grid-cols-2 gap-3 lg:gap-4'
    : 'px-margin lg:px-margin-desktop pt-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 lg:gap-5';
}

function pintar() {
  const lista = ordenar(filtrar());
  const visibles = lista.slice(0, estado.mostrar);
  const favs = leerFavoritos();
  const cat = d.catPorSlug.get(estado.cat);
  $('#tituloCatalogo').textContent = estado.q ? `Resultados para “${estado.q}”` : cat ? cat.nombre : 'Nuestro Catálogo Completo';
  const disponibles = d.productos.filter((p) => disponibilidad(p, null, umbral).codigo !== 'agotado').length;
  $('#subtituloCatalogo').textContent = cat?.descripcion && !estado.q ? cat.descripcion
    : `Explora ${disponibles > 1 ? `más de ${Math.max(1, Math.floor(disponibles / 5) * 5 || disponibles)}` : disponibles} artículos disponibles para envío inmediato y atención por WhatsApp.`;
  $('#contador').textContent = `${visibles.length} de ${lista.length}`;
  $('#productos').innerHTML = visibles.length
    ? visibles.map((p) => (estado.vista === 'lista' ? filaCatalogo(p, favs) : tarjetaCatalogo(p, favs))).join('')
    : `<div class="col-span-full py-14 px-6 text-center flex flex-col items-center gap-2 rounded-2xl bg-surface-container-lowest shadow-sm">
        ${ico('inventory_2', 'text-[40px] text-outline')}
        <p class="font-subheading text-subheading text-on-surface">No hay productos con estos filtros</p>
        <p class="font-body-sm text-body-sm text-on-surface-variant max-w-xs">Prueba con otra búsqueda o quita algunos filtros. También puedes preguntarnos por WhatsApp.</p>
        <div class="flex gap-2 mt-2"><button type="button" data-limpiar class="btn-secundario btn-sm">Quitar filtros</button>
          <a class="btn-wa btn-sm" data-wa-general target="_blank" rel="noopener" href="${esc(enlaceWhatsApp(textoTienda(`Hola {tienda}, estoy buscando ${estado.q || 'un producto'}. ¿Lo tienen?`)))}">${ico('chat', 'text-[16px]', true)} Preguntar</a></div></div>`;
  const restantes = lista.length - visibles.length;
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  $('#paginacion').innerHTML = lista.length ? `${restantes > 0 ? `<button type="button" id="cargarMas" class="w-full max-w-sm h-12 rounded-xl bg-surface-container-lowest shadow-sm hover:bg-surface-container-low text-on-surface font-label-lg text-label-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
      <span>Cargar más productos (${restantes} restantes)</span>${ico('expand_more', 'text-[18px] text-on-surface-variant')}</button>` : ''}
    <div class="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm">
      <span>Página ${Math.ceil(visibles.length / POR_PAGINA)} de ${paginas}</span><span class="w-1 h-1 rounded-full bg-outline-variant"></span><span>${visibles.length} artículos cargados</span></div>` : '';
  pintarCategorias();
  pintarRapidos();
  pintarPanel();
  pintarVista();
  sincronizarUrl();
}

// ---------------- Eventos ----------------
const input = $('#buscar');
input.value = estado.q;
$('#limpiarBuscar').classList.toggle('hidden', !estado.q);
$('#orden').value = estado.orden;
const registrarBusqueda = debounce((q) => { if (q.length >= 3) registrar('busqueda', { pagina: 'catalogo', termino: q }); }, 1200);
input.addEventListener('input', debounce(() => {
  estado.q = input.value.trim();
  estado.mostrar = POR_PAGINA;
  $('#limpiarBuscar').classList.toggle('hidden', !estado.q);
  pintar();
  registrarBusqueda(estado.q);
}, 180));
$('#formBuscar').addEventListener('submit', (e) => { e.preventDefault(); input.blur(); });
$('#limpiarBuscar').addEventListener('click', () => { input.value = ''; estado.q = ''; $('#limpiarBuscar').classList.add('hidden'); pintar(); input.focus(); });
$('#orden').addEventListener('change', (e) => { estado.orden = e.target.value; pintar(); });
$('#botonFiltros').addEventListener('click', () => {
  const panel = $('#panelFiltros');
  const abrir = panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !abrir);
  $('#botonFiltros').setAttribute('aria-expanded', String(abrir));
});
$('#vistaCuadricula').addEventListener('click', () => { estado.vista = 'cuadricula'; try { localStorage.setItem('mt_vista', 'cuadricula'); } catch { /* nada */ } pintar(); });
$('#vistaLista').addEventListener('click', () => { estado.vista = 'lista'; try { localStorage.setItem('mt_vista', 'lista'); } catch { /* nada */ } pintar(); });

document.addEventListener('click', (e) => {
  const cat = e.target.closest('[data-cat]');
  if (cat) { estado.cat = cat.dataset.cat; estado.mostrar = POR_PAGINA; pintar(); return; }
  const rapido = e.target.closest('[data-rapido]');
  if (rapido) { estado[rapido.dataset.rapido] = !estado[rapido.dataset.rapido]; estado.mostrar = POR_PAGINA; pintar(); return; }
  const pr = e.target.closest('[data-precio]');
  if (pr) { estado.precio = pr.dataset.precio; estado.mostrar = POR_PAGINA; pintar(); return; }
  const quitar = e.target.closest('[data-quitar]');
  if (quitar) { const k = quitar.dataset.quitar; estado[k] = k === 'precio' ? '' : false; pintar(); return; }
  if (e.target.closest('[data-limpiar]')) {
    Object.assign(estado, { precio: '', oferta: false, disp: false, envio: false, q: '', cat: '', mostrar: POR_PAGINA });
    input.value = ''; $('#limpiarBuscar').classList.add('hidden');
    pintar(); return;
  }
  if (e.target.closest('#cargarMas')) {
    const boton = e.target.closest('#cargarMas');
    boton.innerHTML = `<svg class="animate-spin h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" d="M4 12a8 8 0 018-8v8H4z" fill="currentColor"></path></svg><span>Cargando catálogo...</span>`;
    setTimeout(() => { estado.mostrar += POR_PAGINA; pintar(); }, 250);
  }
});

$('#cotizar').href = enlaceWhatsApp(textoTienda('Hola {tienda}, estoy buscando un producto específico. ¿Me ayudan a cotizarlo?'));
conectarTarjetas($('#productos'), { pagina: 'catalogo' });
if (contFiltros()) { $('#panelFiltros').classList.remove('hidden'); $('#botonFiltros').setAttribute('aria-expanded', 'true'); }
pintar();
