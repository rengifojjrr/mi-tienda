// Página de inicio: banners, búsqueda rápida, categorías, destacados, beneficios, reseñas y FAQ.
import { $, esc, ico, debounce, ofertaVigente, plantilla } from '../util.js';
import { urlImagen, ruta } from '../api.js';
import { iniciarTienda, buscar, enlaceWhatsApp, textoTienda } from './base.js';
import { registrar } from './estado.js';
import { tarjetaInicio, conectarTarjetas, esqueletoTarjetas } from './tarjetas.js';
import { faqHtml, conectarFaq, resenasSeccionHtml, beneficiosHtml } from './secciones.js';

$('#destacados').innerHTML = esqueletoTarjetas(4);
const d = await iniciarTienda({ pagina: 'inicio', subtitulo: 'Inicio' });
const c = d.cfg;

// ---------------- 1. Banners ----------------
function bannerHtml(b) {
  const msg = plantilla(b.mensaje_whatsapp || 'Hola {tienda}, quiero conocer las ofertas activas', { tienda: c.nombre });
  return `<div class="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary via-primary-container to-inverse-surface text-on-primary p-space-lg lg:p-10 shadow-lg w-full shrink-0 snap-center">
    <div class="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-secondary-fixed/20 blur-2xl pointer-events-none"></div>
    <div class="absolute right-4 bottom-0 w-36 h-36 rounded-full bg-primary-fixed/15 blur-xl pointer-events-none"></div>
    <div class="relative z-10 flex flex-col lg:grid lg:grid-cols-2 lg:items-center gap-space-md lg:gap-10">
      <div class="flex flex-col gap-space-md">
        ${b.etiqueta ? `<div class="inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-full bg-surface-container-lowest/20 backdrop-blur-md">${ico('verified', 'text-secondary-fixed text-[16px]', true)}<span class="font-label-sm text-label-sm tracking-wide text-surface-bright uppercase">${esc(b.etiqueta)}</span></div>` : ''}
        <div class="flex flex-col gap-space-xs">
          <h1 class="font-headline-lg-mobile text-headline-lg-mobile lg:font-display-hero lg:text-display-hero text-on-primary">${esc(b.titulo)}</h1>
          ${b.subtitulo ? `<p class="font-body-sm text-body-sm lg:text-body-lg text-on-primary-container/90 max-w-md">${esc(b.subtitulo)}</p>` : ''}
        </div>
        <div class="hidden lg:flex flex-row items-center gap-space-xs pt-space-xs">${botonesBanner(b, msg)}</div>
      </div>
      ${b.imagen_url ? `<div class="relative w-full h-40 lg:h-64 rounded-lg overflow-hidden shadow-md">
        <img class="w-full h-full object-cover" src="${esc(urlImagen(b.imagen_url))}" alt="" ${d.banners[0] === b ? 'fetchpriority="high"' : 'loading="lazy"'}>
        ${b.nota_imagen ? `<div class="absolute inset-0 bg-gradient-to-t from-inverse-surface/80 via-transparent to-transparent flex items-end p-space-sm">
          <span class="font-label-sm text-label-sm text-surface-bright flex items-center gap-1.5"><span class="relative flex w-2 h-2"><span class="absolute inline-flex h-full w-full rounded-full bg-wa opacity-75 animate-ping"></span><span class="relative inline-flex rounded-full w-2 h-2 bg-wa"></span></span>${esc(b.nota_imagen)}</span></div>` : ''}
      </div>` : ''}
      <div class="flex lg:hidden flex-col sm:flex-row items-stretch sm:items-center gap-space-xs pt-space-xs">${botonesBanner(b, msg)}</div>
    </div></div>`;
}
function botonesBanner(b, msg) {
  return `${b.boton_texto ? `<a class="h-12 px-space-md rounded-lg bg-surface-container-lowest text-primary font-label-lg text-label-lg flex items-center justify-center gap-2 shadow-md hover:bg-surface-container-low active:scale-[0.98] transition-all" href="${esc(/^https?:/.test(b.boton_enlace || '') ? b.boton_enlace : ruta(b.boton_enlace || 'catalogo.html'))}">${ico('storefront', 'text-[20px]')}<span>${esc(b.boton_texto)}</span></a>` : ''}
    ${b.boton_whatsapp ? `<a data-wa-general class="h-12 px-space-md rounded-lg bg-wa hover:bg-wa-hover text-white font-label-lg text-label-lg flex items-center justify-center gap-2 shadow-[0_8px_20px_-4px_rgba(37,211,102,0.4)] active:scale-[0.98] transition-all" href="${esc(enlaceWhatsApp(msg))}" target="_blank" rel="noopener">${ico('chat', 'text-[20px]', true)}<span>Comprar por WhatsApp</span></a>` : ''}`;
}

const hero = $('#hero');
if (!d.banners.length) {
  hero.innerHTML = bannerHtml({ titulo: `Bienvenido a ${c.nombre}`, subtitulo: c.eslogan, boton_texto: 'Explorar Catálogo', boton_enlace: 'catalogo.html', boton_whatsapp: true });
} else {
  hero.innerHTML = `<div class="relative">
    <div id="carrusel" class="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth">${d.banners.map(bannerHtml).join('')}</div>
    ${d.banners.length > 1 ? `<div class="flex justify-center gap-1.5 mt-2" role="tablist">${d.banners.map((_, i) => `<button type="button" data-punto="${i}" aria-label="Ver promoción ${i + 1}" class="h-1.5 rounded-full transition-all ${i === 0 ? 'w-5 bg-primary' : 'w-1.5 bg-outline-variant'}"></button>`).join('')}</div>` : ''}
  </div>`;
  const carrusel = $('#carrusel');
  const puntos = [...hero.querySelectorAll('[data-punto]')];
  let actual = 0; let pausa = false;
  const ir = (i) => { actual = (i + d.banners.length) % d.banners.length; carrusel.scrollTo({ left: carrusel.children[actual].offsetLeft, behavior: 'smooth' }); };
  carrusel.addEventListener('scroll', debounce(() => {
    actual = Math.round(carrusel.scrollLeft / (carrusel.clientWidth + 12));
    puntos.forEach((p, i) => { p.classList.toggle('w-5', i === actual); p.classList.toggle('bg-primary', i === actual); p.classList.toggle('w-1.5', i !== actual); p.classList.toggle('bg-outline-variant', i !== actual); });
  }, 60));
  puntos.forEach((p) => p.addEventListener('click', () => { pausa = true; ir(Number(p.dataset.punto)); }));
  ['pointerdown', 'focusin'].forEach((ev) => carrusel.addEventListener(ev, () => { pausa = true; }));
  if (d.banners.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setInterval(() => { if (!pausa && !document.hidden) ir(actual + 1); }, 6500);
  }
}

// ---------------- 2. Búsqueda y filtros rápidos ----------------
const FILTROS = [
  { id: 'todos', texto: 'Todos', icono: 'stars', color: '' },
  { id: 'top', texto: 'Más Vendidos', icono: 'local_fire_department', color: 'text-tertiary' },
  { id: 'oferta', texto: 'En Oferta', icono: 'sell', color: 'text-primary' },
  { id: 'nuevos', texto: 'Nuevos', icono: 'new_releases', color: 'text-secondary' },
];
let filtro = 'todos';
const chips = $('#chips');
const pintarChips = () => {
  chips.innerHTML = FILTROS.map((f) => {
    const activo = f.id === filtro;
    return `<button type="button" role="tab" aria-selected="${activo}" data-filtro="${f.id}"
      class="px-3.5 py-1.5 rounded-full font-label-md text-label-md shrink-0 flex items-center gap-1 shadow-sm transition-all active:scale-95 ${activo ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'}">
      ${ico(f.icono, `text-[16px] ${activo ? '' : f.color}`)}<span>${f.texto}</span></button>`;
  }).join('');
};
pintarChips();

const publicados = d.productos;
function listaPorFiltro() {
  const base = publicados;
  switch (filtro) {
    case 'top': return [...base].sort((a, b) => b.ventas - a.ventas).slice(0, 8);
    case 'oferta': return base.filter((p) => ofertaVigente(p) || p.relampago).slice(0, 8);
    case 'nuevos': return [...base].filter((p) => p.novedad).concat([...base].filter((p) => !p.novedad).sort((a, b) => b.creado_en.localeCompare(a.creado_en))).slice(0, 8);
    default: {
      const dest = base.filter((p) => p.destacado);
      return (dest.length >= 4 ? dest : dest.concat([...base].filter((p) => !p.destacado).sort((a, b) => b.ventas - a.ventas))).slice(0, 8);
    }
  }
}

const grid = $('#destacados');
const input = $('#busquedaRapida');
const limpiar = $('#limpiarBusqueda');
function pintarDestacados() {
  const q = input.value.trim();
  let lista; let titulo; let nota;
  if (q.length >= 2) {
    lista = buscar(d, q);
    titulo = `Resultados para “${q}”`;
    nota = `${lista.length} ${lista.length === 1 ? 'producto' : 'productos'}`;
    $('#iconoDestacados').textContent = 'search';
  } else {
    lista = listaPorFiltro();
    titulo = { todos: 'Productos Destacados', top: 'Más Vendidos', oferta: 'En Oferta', nuevos: 'Nuevos' }[filtro];
    nota = 'Compra 1-clic';
    $('#iconoDestacados').textContent = 'auto_awesome';
  }
  $('#tituloDestacados').textContent = titulo;
  $('#notaDestacados').textContent = nota;
  grid.innerHTML = lista.length
    ? lista.slice(0, q ? 12 : 8).map(tarjetaInicio).join('')
    : `<div class="col-span-full py-10 text-center flex flex-col items-center gap-2 rounded-xl bg-surface-container-lowest">${ico('search_off', 'text-[36px] text-outline')}
        <p class="font-body-md text-body-md text-on-surface-variant">${q ? `No encontramos “${esc(q)}”.` : 'Pronto tendremos productos aquí.'}</p>
        ${q ? `<a class="btn-wa btn-sm" target="_blank" rel="noopener" href="${esc(enlaceWhatsApp(textoTienda(`Hola {tienda}, ¿tienen ${q}?`)))}">${ico('chat', 'text-[16px]', true)} Preguntar por WhatsApp</a>` : ''}</div>`;
  $('#verCatalogo').href = ruta(q ? `catalogo.html?q=${encodeURIComponent(q)}` : filtro === 'oferta' ? 'catalogo.html?oferta=1' : 'catalogo.html');
}
const registrarBusqueda = debounce((q) => { if (q.length >= 3) registrar('busqueda', { pagina: 'inicio', termino: q }); }, 1200);
input.addEventListener('input', debounce(() => {
  limpiar.classList.toggle('hidden', !input.value);
  pintarDestacados();
  registrarBusqueda(input.value.trim());
}, 150));
limpiar.addEventListener('click', () => { input.value = ''; limpiar.classList.add('hidden'); pintarDestacados(); input.focus(); });
$('#formBusqueda').addEventListener('submit', (e) => {
  e.preventDefault();
  if (input.value.trim()) location.href = ruta(`catalogo.html?q=${encodeURIComponent(input.value.trim())}`);
});
chips.addEventListener('click', (e) => {
  const b = e.target.closest('[data-filtro]');
  if (!b) return;
  filtro = b.dataset.filtro;
  input.value = ''; limpiar.classList.add('hidden');
  pintarChips(); pintarDestacados();
});
pintarDestacados();
conectarTarjetas(grid, { pagina: 'inicio' });

// ---------------- 3. Categorías ----------------
const contar = (cat) => d.productos.filter((p) => p.categoria_id === cat.id).length;
const cats = d.categorias.filter((x) => x.destacada);
$('#categorias').innerHTML = (cats.length ? cats : d.categorias).map((cat) => `<a href="${ruta(`catalogo.html?cat=${encodeURIComponent(cat.slug)}`)}"
    class="flex flex-col items-center shrink-0 w-28 lg:w-36 p-3 rounded-xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-all active:scale-95 group text-center">
    <div class="w-16 h-16 lg:w-20 lg:h-20 rounded-full overflow-hidden bg-surface-container-high p-1 mb-2 group-hover:scale-105 transition-transform flex items-center justify-center">
      ${cat.imagen_url ? `<img class="w-full h-full object-cover rounded-full" src="${esc(urlImagen(cat.imagen_url))}" alt="" loading="lazy">` : ico(cat.icono || 'category', 'text-primary text-[30px]')}
    </div>
    <span class="font-label-md text-label-md text-on-surface group-hover:text-primary transition-colors line-clamp-1">${esc(cat.nombre)}</span>
    <span class="font-label-sm text-label-sm text-on-surface-variant">${contar(cat)} productos</span></a>`).join('')
  || '<p class="font-body-sm text-body-sm text-on-surface-variant">Aún no hay categorías.</p>';

// ---------------- 5–7. Beneficios, reseñas y FAQ ----------------
$('#beneficios').innerHTML = beneficiosHtml(d.contenido.beneficios, c.nombre);
$('#resenas').innerHTML = resenasSeccionHtml(d.testimonios, 3);
const faq = $('#faq');
faq.innerHTML = faqHtml((d.contenido.faq || []).slice(0, 3));
conectarFaq(faq);
