// Estructura del panel: verificación de sesión, menú lateral (Stitch), encabezado con buscador,
// "Crear Nuevo", notificaciones, interruptor de tienda abierta y menú de usuario.
import { $, esc, ico, dinero, debounce, hace, iniciales, urlWhatsApp } from '../util.js';
import { db, usarSesion, token, guardarToken, ruta, urlImagen } from '../api.js';
import { toast, toastError, modal, ROLES, chipPedido } from './ui.js';

usarSesion(true);
let sesion = null;
let cfg = {};
export const admin = () => sesion;
export const tienda = () => cfg;
export const dineroPanel = (n) => dinero(n, cfg);

const PERMISOS = {
  leer: ['dueno', 'admin', 'editor', 'vendedor'],
  catalogo: ['dueno', 'admin', 'editor'],
  ventas: ['dueno', 'admin', 'vendedor'],
  config: ['dueno', 'admin'],
  usuarios: ['dueno'],
};
export const puede = (area) => !!sesion && (PERMISOS[area] || []).includes(sesion.rol);

const MENU = [
  { grupo: 'Principal', items: [{ id: 'dashboard', texto: 'Dashboard', icono: 'space_dashboard', href: 'dashboard.html', area: 'leer', insignia: 'vivo' }] },
  { grupo: 'Catálogo', items: [
    { id: 'productos', texto: 'Productos', icono: 'inventory_2', href: 'productos.html', area: 'catalogo', insignia: 'productos' },
    { id: 'categorias', texto: 'Categorías', icono: 'category', href: 'categorias.html', area: 'catalogo' },
    { id: 'inventario', texto: 'Inventario', icono: 'warehouse', href: 'inventario.html', area: 'catalogo', insignia: 'alertas' },
  ] },
  { grupo: 'Ventas & Leads', items: [
    { id: 'pedidos', texto: 'Pedidos & Chats', icono: 'chat', href: 'pedidos.html', area: 'ventas', insignia: 'pedidos' },
    { id: 'clientes', texto: 'Clientes CRM', icono: 'group', href: 'clientes.html', area: 'ventas' },
  ] },
  { grupo: 'Marketing', items: [
    { id: 'promos', texto: 'Banners & Promos', icono: 'campaign', href: 'promos.html', area: 'catalogo' },
    { id: 'galeria', texto: 'Galería Multimedia', icono: 'perm_media', href: 'galeria.html', area: 'catalogo' },
  ] },
  { grupo: 'Sistema', items: [
    { id: 'contenido', texto: 'Contenido Tienda', icono: 'desktop_windows', href: 'contenido.html', area: 'catalogo' },
    { id: 'configuracion', texto: 'Configuración', icono: 'settings', href: 'configuracion.html', area: 'config' },
    { id: 'usuarios', texto: 'Usuarios & Permisos', icono: 'manage_accounts', href: 'usuarios.html', area: 'leer' },
    { id: 'actividad', texto: 'Registro de Actividad', icono: 'history', href: 'actividad.html', area: 'leer' },
  ] },
];

const CREAR = [
  { texto: 'Producto', icono: 'add_box', href: 'producto.html', area: 'catalogo' },
  { texto: 'Categoría', icono: 'category', href: 'categorias.html#nueva', area: 'catalogo' },
  { texto: 'Pedido manual', icono: 'receipt_long', href: 'pedidos.html#nuevo', area: 'ventas' },
  { texto: 'Cliente', icono: 'person_add', href: 'clientes.html#nuevo', area: 'ventas' },
  { texto: 'Banner', icono: 'view_carousel', href: 'promos.html#banner', area: 'catalogo' },
  { texto: 'Promoción', icono: 'sell', href: 'promos.html#promo', area: 'catalogo' },
  { texto: 'Usuario', icono: 'manage_accounts', href: 'usuarios.html#nuevo', area: 'usuarios' },
];

// ---------------- Menú lateral ----------------
function htmlMenu(seccion) {
  return `<div class="p-space-lg">
    <a href="dashboard.html" class="flex items-center gap-space-sm mb-space-lg">
      <div class="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-on-primary shadow-sm overflow-hidden">
        ${cfg.logo_url ? `<img src="${esc(urlImagen(cfg.logo_url))}" alt="" class="w-full h-full object-cover">` : ico('storefront', 'text-[24px]')}</div>
      <div class="flex flex-col min-w-0"><span class="font-headline-sm text-headline-sm font-bold tracking-tight text-on-surface truncate">${esc(cfg.nombre || 'MI TIENDA')}</span>
        <span class="font-label-sm text-label-sm text-primary font-semibold uppercase tracking-wider bg-surface-container px-space-xs py-0.5 rounded self-start">Admin Suite v2.4</span></div>
    </a>
    <nav class="space-y-space-md" aria-label="Panel">
      ${MENU.map((g) => {
        const items = g.items.filter((it) => puede(it.area));
        if (!items.length) return '';
        return `<div class="space-y-1"><p class="px-space-sm font-label-sm text-label-sm uppercase tracking-wider text-outline mb-1">${g.grupo}</p>
          ${items.map((it) => {
            const activo = it.id === seccion;
            return `<a href="${it.href}" ${activo ? 'aria-current="page"' : ''} class="flex items-center justify-between px-space-sm py-2 rounded-xl transition-all ${activo ? 'bg-primary-container text-on-primary-container font-semibold' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'}">
              <span class="flex items-center gap-space-sm">${ico(it.icono, 'text-[20px]', activo)}<span class="font-body-md text-body-md">${it.texto}</span></span>
              ${it.insignia === 'vivo' ? '<span class="px-2 py-0.5 font-label-sm text-label-sm rounded-full bg-secondary-container text-on-secondary-container">En vivo</span>' : it.insignia ? `<span data-insignia="${it.insignia}"></span>` : ''}</a>`;
          }).join('')}</div>`;
      }).join('')}
    </nav></div>
  <div class="p-space-lg space-y-space-md">
    <a href="${ruta('index.html')}" target="_blank" rel="noopener" class="flex items-center justify-between p-space-sm rounded-xl bg-surface-container-low text-on-surface hover:bg-surface-container transition-all group">
      <span class="flex items-center gap-space-xs">${ico('store', 'text-primary text-[20px]')}<span class="font-label-md text-label-md font-semibold">Ver tienda pública</span></span>
      ${ico('open_in_new', 'text-[18px] text-on-surface-variant group-hover:translate-x-0.5 transition-transform')}</a>
    <div class="p-space-md rounded-xl bg-surface-container-high text-on-surface">
      <div class="flex items-center gap-space-xs text-primary mb-1">${ico('support_agent', 'text-[20px]')}<span class="font-label-lg text-label-lg font-bold">Asistencia WhatsApp</span></div>
      <p class="font-body-sm text-body-sm text-on-surface-variant mb-space-sm">¿Dudas con tu catálogo o sincronización?</p>
      <a ${cfg.soporte_whatsapp ? `href="${esc(urlWhatsApp(cfg.soporte_whatsapp, `Hola, necesito ayuda con el panel de ${cfg.nombre || 'mi tienda'}`))}" target="_blank" rel="noopener"` : 'href="configuracion.html#soporte"'}
        class="w-full py-2 px-3 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md flex items-center justify-center gap-space-xs transition-colors">${ico('chat', 'text-[16px]')}<span>Contactar Soporte</span></a>
    </div>
  </div>`;
}

// ---------------- Encabezado ----------------
function htmlEncabezado(migas) {
  const crear = CREAR.filter((c) => puede(c.area));
  return `<header class="fixed top-0 left-0 lg:left-72 right-0 h-16 bg-surface-container-lowest/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-40 flex items-center justify-between gap-2 px-3 lg:px-margin-desktop">
    <div class="flex items-center gap-2 lg:gap-space-lg flex-1 min-w-0 max-w-xl">
      <button type="button" data-abrir-menu class="lg:hidden btn-icono" aria-label="Abrir menú">${ico('menu', 'text-[22px]')}</button>
      <div class="hidden sm:flex items-center gap-space-xs text-on-surface-variant font-label-md text-label-md whitespace-nowrap">
        <a href="dashboard.html" class="hover:text-on-surface">Panel</a>${migas.map((m, i) => `${ico('chevron_right', 'text-[14px]')}${m.href && i < migas.length - 1 ? `<a href="${m.href}" class="hover:text-on-surface">${esc(m.texto)}</a>` : `<span class="text-on-surface font-semibold truncate max-w-[220px]">${esc(m.texto)}</span>`}`).join('')}</div>
      <button type="button" data-buscar class="relative flex-1 hidden md:flex items-center text-left pl-9 pr-14 py-2 bg-surface-container-low rounded-xl font-body-sm text-body-sm text-outline hover:bg-surface-container transition-all min-w-[160px]">
        ${ico('search', 'absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]')}Buscar pedidos, productos, clientes...
        <span class="absolute right-2.5 top-1/2 -translate-y-1/2 font-label-sm text-label-sm bg-surface-container text-on-surface-variant px-1.5 py-0.5 rounded border border-outline-variant">${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'} K</span></button>
    </div>
    <div class="flex items-center gap-1.5 sm:gap-space-sm">
      <button type="button" data-buscar class="md:hidden btn-icono" aria-label="Buscar">${ico('search', 'text-[22px]')}</button>
      ${puede('config') ? `<label class="hidden xl:flex items-center gap-2 bg-surface-container-low px-space-sm py-1.5 rounded-xl cursor-pointer" title="Abre o cierra la tienda (muestra un aviso a los clientes)">
        <span class="font-label-md text-label-md" data-texto-abierta>${cfg.abierta === false ? 'Tienda cerrada' : 'Tienda abierta'}</span>
        <input type="checkbox" class="interruptor" data-tienda-abierta ${cfg.abierta === false ? '' : 'checked'}></label>` : ''}
      ${crear.length ? `<div class="relative">
        <button type="button" data-crear class="flex items-center gap-space-xs px-3 sm:px-space-md py-2 rounded-xl bg-primary text-on-primary hover:bg-primary-container font-label-lg text-label-lg shadow-sm transition-all" aria-haspopup="menu" aria-expanded="false">
          ${ico('add', 'text-[20px]')}<span class="hidden sm:inline">Crear Nuevo</span></button>
        <div data-menu-crear class="hidden absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-nivel3 border border-[#E2E8F0] p-1.5 z-50" role="menu">
          ${crear.map((c) => `<a role="menuitem" href="${c.href}" class="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[#F8FAFC] font-label-lg text-label-lg text-[#334155]">${ico(c.icono, 'text-[20px] text-primary')}${c.texto}</a>`).join('')}
        </div></div>` : ''}
      <div class="relative">
        <button type="button" data-notificaciones class="relative w-10 h-10 rounded-xl flex items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors" aria-label="Notificaciones" aria-haspopup="true">
          ${ico('notifications', 'text-[22px]')}<span data-punto-notif class="hidden absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-error ring-2 ring-white"></span></button>
        <div data-menu-notif class="hidden absolute right-0 mt-2 w-[min(92vw,360px)] bg-white rounded-2xl shadow-nivel3 border border-[#E2E8F0] z-50 overflow-hidden"></div>
      </div>
      <div class="relative">
        <button type="button" data-usuario class="flex items-center gap-space-xs pl-1 pr-1 sm:pr-2 py-1 rounded-xl hover:bg-surface-container transition-colors" aria-haspopup="menu">
          <span class="w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center font-label-lg text-label-lg">${esc(iniciales(sesion.nombre))}</span>
          <span class="hidden md:flex flex-col items-start leading-tight"><span class="font-label-lg text-label-lg text-on-surface">${esc(sesion.nombre)}</span>
            <span class="font-label-sm text-label-sm text-on-surface-variant">${esc(ROLES[sesion.rol] || sesion.rol)}</span></span>
          ${ico('expand_more', 'hidden md:inline text-[18px] text-outline')}</button>
        <div data-menu-usuario class="hidden absolute right-0 mt-2 w-60 bg-white rounded-2xl shadow-nivel3 border border-[#E2E8F0] p-1.5 z-50" role="menu">
          <div class="px-3 py-2 border-b border-[#F1F5F9] mb-1"><p class="font-label-lg text-label-lg text-[#0F172A] truncate">${esc(sesion.nombre)}</p><p class="font-body-sm text-body-sm text-[#64748B] truncate">${esc(sesion.email)}</p></div>
          <a role="menuitem" href="usuarios.html#perfil" class="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[#F8FAFC] font-label-lg text-label-lg text-[#334155]">${ico('person', 'text-[20px] text-primary')}Mi perfil</a>
          <button type="button" role="menuitem" data-cambiar-clave class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[#F8FAFC] font-label-lg text-label-lg text-[#334155]">${ico('key', 'text-[20px] text-primary')}Cambiar contraseña</button>
          <a role="menuitem" href="${ruta('index.html')}" target="_blank" rel="noopener" class="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[#F8FAFC] font-label-lg text-label-lg text-[#334155]">${ico('store', 'text-[20px] text-primary')}Ver tienda</a>
          <button type="button" role="menuitem" data-salir class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[#FEF2F2] font-label-lg text-label-lg text-error">${ico('logout', 'text-[20px]')}Cerrar sesión</button>
        </div>
      </div>
    </div></header>`;
}

// ---------------- Insignias y notificaciones ----------------
async function cargarInsignias() {
  try {
    const [productos, alertas, nuevos] = await Promise.all([
      puede('catalogo') ? db.contar('mt_productos', 'estado=neq.archivado') : null,
      puede('catalogo') ? db.leer('mt_productos', 'select=id,stock,stock_minimo&rastrear_stock=eq.true&estado=eq.publicado') : null,
      puede('ventas') ? db.contar('mt_pedidos', 'estado=eq.nuevo') : null,
    ]);
    const poner = (k, html) => document.querySelectorAll(`[data-insignia="${k}"]`).forEach((el) => { el.outerHTML = html; });
    if (productos != null) poner('productos', `<span class="font-label-sm text-label-sm text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-full tnum">${productos}</span>`);
    const nAlertas = (alertas || []).filter((p) => p.stock <= p.stock_minimo).length;
    poner('alertas', nAlertas ? `<span class="font-label-sm text-label-sm text-error bg-error-container px-2 py-0.5 rounded-full">${nAlertas} ${nAlertas === 1 ? 'alerta' : 'alertas'}</span>` : '');
    poner('pedidos', nuevos ? `<span class="font-label-sm text-label-sm text-on-secondary-fixed bg-secondary-fixed px-2 py-0.5 rounded-full font-bold">+${nuevos} WA</span>` : '');
    $('[data-punto-notif]')?.classList.toggle('hidden', !(nuevos || nAlertas));
  } catch { /* las insignias son opcionales */ }
}

async function abrirNotificaciones(cont) {
  cont.innerHTML = '<div class="p-4"><div class="h-12 esqueleto mb-2"></div><div class="h-12 esqueleto"></div></div>';
  try {
    const [pedidos, bajos, actividad] = await Promise.all([
      puede('ventas') ? db.leer('mt_pedidos', 'select=id,numero,cliente_nombre,total,estado,creado_en&estado=eq.nuevo&order=creado_en.desc&limit=5') : [],
      puede('catalogo') ? db.leer('mt_productos', 'select=id,nombre,stock,stock_minimo&rastrear_stock=eq.true&estado=eq.publicado&order=stock&limit=30') : [],
      db.leer('mt_actividad', 'select=autor,detalle,creado_en&accion=neq.login&order=creado_en.desc&limit=4'),
    ]);
    const criticos = bajos.filter((p) => p.stock <= p.stock_minimo).slice(0, 4);
    const fila = (href, icono, color, titulo, texto, cuando = '') => `<a href="${href}" class="flex items-start gap-3 px-4 py-3 hover:bg-[#F8FAFC]">
      <span class="w-8 h-8 rounded-full ${color} flex items-center justify-center shrink-0">${ico(icono, 'text-[18px]')}</span>
      <span class="flex-1 min-w-0"><span class="block font-label-lg text-label-lg text-[#0F172A] truncate">${titulo}</span>
      <span class="block font-body-sm text-body-sm text-[#64748B] line-clamp-2">${texto}</span>${cuando ? `<span class="block font-label-sm text-label-sm text-outline mt-0.5">${cuando}</span>` : ''}</span></a>`;
    const html = [
      ...pedidos.map((p) => fila(`pedidos.html#${p.numero}`, 'chat', 'bg-wa/15 text-wa-tinta', `Nuevo pedido ${esc(p.numero)}`, `${esc(p.cliente_nombre)} · ${dineroPanel(p.total)}`, hace(p.creado_en))),
      ...criticos.map((p) => fila(`inventario.html?filtro=bajo`, 'warning', 'bg-error-container text-error', 'Stock crítico', `"${esc(p.nombre)}" tiene ${p.stock} ${p.stock === 1 ? 'unidad' : 'unidades'}`)),
      ...actividad.map((a) => fila('actividad.html', 'history', 'bg-surface-container text-on-surface-variant', esc(a.autor), esc(a.detalle || ''), hace(a.creado_en))),
    ];
    cont.innerHTML = `<div class="flex items-center justify-between px-4 py-3 border-b border-[#F1F5F9]"><p class="font-label-lg text-label-lg text-[#0F172A]">Notificaciones</p>
      <a href="actividad.html" class="font-label-md text-label-md text-primary">Ver todo</a></div>
      <div class="max-h-[60vh] overflow-y-auto divide-y divide-[#F1F5F9]">${html.join('') || '<p class="p-6 text-center font-body-sm text-body-sm text-[#64748B]">Sin novedades por ahora.</p>'}</div>`;
  } catch (e) { cont.innerHTML = `<p class="p-4 text-error font-body-sm text-body-sm">${esc(e.message)}</p>`; }
}

// ---------------- Búsqueda global (Ctrl/⌘ K) ----------------
function abrirBusqueda() {
  const paginas = MENU.flatMap((g) => g.items).filter((it) => puede(it.area));
  modal({
    titulo: 'Buscar en el panel', icono: 'search', ancho: 'lg', botones: '',
    contenido: `<input type="search" data-q class="campo" placeholder="Producto, SKU, número de pedido (WA-1024), cliente o teléfono..." autocomplete="off" autofocus>
      <div data-res class="mt-3 flex flex-col gap-1 min-h-[160px]"></div>`,
    alAbrir: (capa, cerrar) => {
      const res = $('[data-res]', capa);
      const fila = (href, icono, titulo, sub) => `<a href="${href}" class="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#F8FAFC]">
        <span class="w-9 h-9 rounded-lg bg-surface-container-low text-primary flex items-center justify-center">${ico(icono, 'text-[20px]')}</span>
        <span class="min-w-0"><span class="block font-label-lg text-label-lg text-[#0F172A] truncate">${titulo}</span><span class="block font-body-sm text-body-sm text-[#64748B] truncate">${sub}</span></span></a>`;
      const pintarPaginas = (q = '') => paginas.filter((p) => !q || p.texto.toLowerCase().includes(q)).map((p) => fila(p.href, p.icono, p.texto, 'Ir a la sección')).join('');
      res.innerHTML = `<p class="px-3 font-label-sm text-label-sm uppercase tracking-wider text-outline">Secciones</p>${pintarPaginas()}`;
      const buscar = debounce(async (q) => {
        if (q.length < 2) { res.innerHTML = `<p class="px-3 font-label-sm text-label-sm uppercase tracking-wider text-outline">Secciones</p>${pintarPaginas()}`; return; }
        const t = encodeURIComponent(`*${q.replace(/[,()*]/g, ' ')}*`);
        const dig = q.replace(/\D/g, '');
        try {
          const [prods, peds, clis] = await Promise.all([
            puede('catalogo') ? db.leer('mt_productos', `select=id,nombre,sku,estado&or=(nombre.ilike.${t},sku.ilike.${t},marca.ilike.${t})&limit=6`) : [],
            puede('ventas') ? db.leer('mt_pedidos', `select=id,numero,cliente_nombre,total,estado&or=(numero.ilike.${t},cliente_nombre.ilike.${t}${dig.length >= 4 ? `,cliente_telefono.ilike.*${dig}*` : ''})&order=creado_en.desc&limit=6`) : [],
            puede('ventas') ? db.leer('mt_clientes', `select=id,nombre,telefono,ciudad&or=(nombre.ilike.${t}${dig.length >= 4 ? `,telefono.ilike.*${dig}*` : ''})&limit=5`) : [],
          ]);
          const html = [
            pintarPaginas(q.toLowerCase()),
            ...prods.map((p) => fila(`producto.html?id=${p.id}`, 'inventory_2', esc(p.nombre), `SKU ${esc(p.sku)} · ${esc(p.estado)}`)),
            ...peds.map((p) => fila(`pedidos.html#${p.numero}`, 'receipt_long', `${esc(p.numero)} · ${esc(p.cliente_nombre)}`, `${dineroPanel(p.total)} · ${chipPedido(p.estado)}`)),
            ...clis.map((c) => fila(`clientes.html#${c.id}`, 'person', esc(c.nombre), esc([c.telefono, c.ciudad].filter(Boolean).join(' · ')))),
          ].join('');
          res.innerHTML = html || '<p class="py-8 text-center font-body-sm text-body-sm text-[#64748B]">Sin resultados.</p>';
        } catch (e) { res.innerHTML = `<p class="text-error">${esc(e.message)}</p>`; }
      }, 220);
      $('[data-q]', capa).addEventListener('input', (e) => buscar(e.target.value.trim()));
      res.addEventListener('click', (e) => { if (e.target.closest('a')) cerrar(null); });
    },
  });
}

// ---------------- Contraseña ----------------
export function cambiarClave() {
  return modal({
    titulo: 'Cambiar contraseña', icono: 'key', textoEnviar: 'Cambiar contraseña',
    contenido: `<div class="flex flex-col gap-3">
      <div><label class="etiqueta" for="claveActual">Contraseña actual</label><input id="claveActual" name="actual" type="password" class="campo" autocomplete="current-password" required></div>
      <div><label class="etiqueta" for="claveNueva">Nueva contraseña</label><input id="claveNueva" name="nueva" type="password" class="campo" autocomplete="new-password" minlength="8" required><p class="ayuda">Mínimo 8 caracteres. Mezcla letras y números.</p></div>
      <div><label class="etiqueta" for="claveNueva2">Repite la nueva contraseña</label><input id="claveNueva2" name="nueva2" type="password" class="campo" autocomplete="new-password" required></div></div>`,
    alEnviar: async (form) => {
      const { actual, nueva, nueva2 } = Object.fromEntries(new FormData(form));
      if (nueva.length < 8) throw new Error('La nueva contraseña debe tener al menos 8 caracteres.');
      if (nueva !== nueva2) throw new Error('Las contraseñas nuevas no coinciden.');
      const r = await db.rpc('mt_cambiar_clave', { p_actual: actual, p_nueva: nueva });
      if (!r?.ok) throw new Error(r?.error || 'No se pudo cambiar la contraseña');
      sesion.debe_cambiar_clave = false;
      $('#aviso-clave')?.remove();
      toast('Contraseña actualizada. Se cerraron tus otras sesiones.');
      return true;
    },
  });
}

async function salir() {
  try { await db.rpc('mt_logout'); } catch { /* igual se borra localmente */ }
  guardarToken(null);
  location.replace('index.html');
}

const irAlLogin = () => location.replace(`index.html?volver=${encodeURIComponent(location.pathname.split('/').pop() + location.search + location.hash)}`);

// ---------------- Arranque ----------------
/**
 * Verifica la sesión y dibuja el armazón del panel.
 * @param {{seccion: string, migas?: {texto: string, href?: string}[], area?: string}} op
 */
export async function iniciarPanel({ seccion, migas = [], area = 'leer' }) {
  if (!token()) { irAlLogin(); throw new Error('Sin sesión'); }
  window.addEventListener('mt:sesion-vencida', () => { guardarToken(null); irAlLogin(); });
  try {
    const [s, c] = await Promise.all([db.rpc('mt_sesion'), db.leer('mt_config', 'select=*&id=eq.1')]);
    sesion = s;
    cfg = c[0] || {};
  } catch (e) {
    document.body.innerHTML = `<div class="min-h-screen flex items-center justify-center p-6 text-center"><div><p class="font-headline-sm text-headline-sm mb-2">No se pudo conectar</p><p class="text-[#64748B] mb-4">${esc(e.message)}</p><button class="btn-primario" onclick="location.reload()">Reintentar</button></div></div>`;
    throw e;
  }
  if (!sesion) { guardarToken(null); irAlLogin(); throw new Error('Sesión vencida'); }

  const raiz = $('#panel');
  raiz.innerHTML = `
    <aside id="menuLateral" class="fixed left-0 top-0 h-screen w-72 bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-[60] flex flex-col justify-between overflow-y-auto no-scrollbar -translate-x-full lg:translate-x-0 transition-transform duration-300">${htmlMenu(seccion)}</aside>
    <div id="velo" class="hidden fixed inset-0 bg-[#0F172A]/40 z-[55] lg:hidden"></div>
    ${htmlEncabezado(migas)}`;
  document.title = `${migas[migas.length - 1]?.texto || 'Panel'} · ${cfg.nombre || 'MI TIENDA'} Admin`;

  // Avisos importantes arriba del contenido
  const contenido = $('#contenido');
  const avisos = [];
  if (sesion.debe_cambiar_clave) avisos.push(`<div id="aviso-clave" class="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E]">
      ${ico('key', 'text-[22px]')}<p class="flex-1 font-label-lg text-label-lg">Estás usando una contraseña temporal. Cámbiala por una que sólo tú conozcas.</p>
      <button type="button" data-cambiar-clave class="btn-sm btn bg-[#92400E] text-white hover:bg-[#78350F]">Cambiar ahora</button></div>`);
  if (!cfg.whatsapp && puede('config') && seccion !== 'configuracion') avisos.push(`<div class="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 rounded-2xl bg-wa/10 border border-wa/30 text-[#136633]">
      ${ico('chat', 'text-[22px]', true)}<p class="flex-1 font-label-lg text-label-lg">Configura el número de WhatsApp de la tienda para que los pedidos te lleguen directo.</p>
      <a href="configuracion.html#whatsapp" class="btn-sm btn bg-wa text-white hover:bg-wa-hover">Configurar</a></div>`);
  if (avisos.length && contenido) contenido.insertAdjacentHTML('beforebegin', `<div class="px-4 lg:px-space-lg pt-4 max-w-[1600px] mx-auto w-full flex flex-col gap-2">${avisos.join('')}</div>`);

  // Eventos del armazón
  const cerrarMenus = (excepto) => ['[data-menu-crear]', '[data-menu-notif]', '[data-menu-usuario]'].forEach((s) => { if (s !== excepto) $(s)?.classList.add('hidden'); });
  document.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-abrir-menu]')) { $('#menuLateral').classList.remove('-translate-x-full'); $('#velo').classList.remove('hidden'); return; }
    if (t.closest('#velo')) { $('#menuLateral').classList.add('-translate-x-full'); $('#velo').classList.add('hidden'); return; }
    if (t.closest('[data-buscar]')) { abrirBusqueda(); return; }
    if (t.closest('[data-cambiar-clave]')) { cerrarMenus(); cambiarClave(); return; }
    if (t.closest('[data-salir]')) { salir(); return; }
    const pares = [['[data-crear]', '[data-menu-crear]'], ['[data-notificaciones]', '[data-menu-notif]'], ['[data-usuario]', '[data-menu-usuario]']];
    for (const [boton, menu] of pares) {
      if (t.closest(boton)) {
        const m = $(menu);
        const abrir = m.classList.contains('hidden');
        cerrarMenus(menu);
        m.classList.toggle('hidden', !abrir);
        t.closest(boton).setAttribute('aria-expanded', String(abrir));
        if (abrir && menu === '[data-menu-notif]') abrirNotificaciones(m);
        return;
      }
    }
    if (!t.closest('[data-menu-crear],[data-menu-notif],[data-menu-usuario]')) cerrarMenus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); abrirBusqueda(); }
    if (e.key === 'Escape') cerrarMenus();
  });
  $('[data-tienda-abierta]')?.addEventListener('change', async (e) => {
    const abierta = e.target.checked;
    try {
      await db.actualizar('mt_config', 'id=eq.1', { abierta });
      cfg.abierta = abierta;
      $('[data-texto-abierta]').textContent = abierta ? 'Tienda abierta' : 'Tienda cerrada';
      toast(abierta ? 'La tienda está abierta' : 'Tienda cerrada: los clientes verán un aviso de fuera de horario', { tipo: abierta ? 'ok' : 'info' });
    } catch (err) { e.target.checked = !abierta; toastError(err); }
  });

  cargarInsignias();
  if (!puede(area)) {
    if (contenido) contenido.innerHTML = `<div class="tarjeta">${(await import('./ui.js')).vacio({ icono: 'lock', titulo: 'No tienes acceso a esta sección', texto: `Tu rol (${ROLES[sesion.rol]}) no incluye esta parte del panel. Pide acceso al dueño de la tienda.`, accion: '<a href="dashboard.html" class="btn-primario">Ir al dashboard</a>' })}</div>`;
    throw new Error('Sin permiso');
  }
  return { admin: sesion, cfg };
}
