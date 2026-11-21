// Usuarios & Permisos (Sistema): mi perfil (todos los roles), el equipo con acceso al panel
// (sólo el dueño lo administra) y la matriz de permisos por rol. Anclas: #perfil y #nuevo.
import { $, $$, esc, ico, hace, iniciales, copiar, fecha } from '../util.js';
import { db, ruta } from '../api.js';
import { iniciarPanel, puede, admin, tienda, cambiarClave } from './base.js';
import { modal, confirmar, toast, toastError, ROLES, vacio, spinner } from './ui.js';

await iniciarPanel({ seccion: 'usuarios', migas: [{ texto: 'Sistema' }, { texto: 'Usuarios & Permisos' }], area: 'leer' });
const raiz = $('#contenido');
const yo = admin();
const esDueno = puede('usuarios');
let equipo = null; // null = cargando
let errorEquipo = '';

// ---------------- Roles y permisos ----------------
const INFO_ROL = {
  dueno: { icono: 'workspace_premium', clase: 'chip-violeta', texto: 'Control total de la tienda, incluidos los usuarios y sus permisos.' },
  admin: { icono: 'admin_panel_settings', clase: 'chip-azul', texto: 'Todo el panel (catálogo, ventas y configuración) excepto administrar usuarios.' },
  editor: { icono: 'edit_note', clase: 'chip-verde', texto: 'Productos, categorías, inventario, banners, galería y contenido de la tienda.' },
  vendedor: { icono: 'point_of_sale', clase: 'chip-ambar', texto: 'Pedidos, chats de WhatsApp y clientes.' },
};
// Mismas reglas que assets/js/admin/base.js (puede) y las políticas RLS de la base.
const PERMISOS = {
  leer: ['dueno', 'admin', 'editor', 'vendedor'], catalogo: ['dueno', 'admin', 'editor'], ventas: ['dueno', 'admin', 'vendedor'],
  config: ['dueno', 'admin'], usuarios: ['dueno'],
};
const MATRIZ = [
  { seccion: 'Dashboard', icono: 'space_dashboard', area: 'leer' },
  { seccion: 'Productos, categorías e inventario', icono: 'inventory_2', area: 'catalogo' },
  { seccion: 'Banners & galería', icono: 'campaign', area: 'catalogo' },
  { seccion: 'Contenido de la tienda', icono: 'desktop_windows', area: 'catalogo' },
  { seccion: 'Pedidos & clientes', icono: 'chat', area: 'ventas' },
  { seccion: 'Configuración', icono: 'settings', area: 'config' },
  { seccion: 'Usuarios', icono: 'manage_accounts', area: 'usuarios', parcial: 'Sólo ve el equipo y edita su propio perfil' },
  { seccion: 'Registro de actividad', icono: 'history', area: 'leer' },
];
const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const COLORES_AVATAR = ['bg-secondary-fixed text-on-secondary-fixed', 'bg-tertiary-fixed text-on-tertiary-fixed', 'bg-primary-fixed text-on-primary-fixed', 'bg-surface-container-high text-primary'];

// ---------------- Piezas ----------------
const claseTarjeta = 'bg-surface-container-lowest rounded-xl p-space-md sm:p-space-lg shadow-[0_1px_3px_rgba(15,23,42,0.04)]';
const encabezadoTarjeta = (icono, titulo, texto, extra = '') => `<div class="flex items-start justify-between gap-space-sm pb-space-sm mb-space-sm">
    <div class="flex items-start gap-space-sm min-w-0">
      <div class="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">${ico(icono, 'text-[18px]')}</div>
      <div class="min-w-0"><h2 class="font-headline-sm text-headline-sm text-on-surface">${titulo}</h2><p class="font-body-sm text-body-sm text-outline">${texto}</p></div></div>
    ${extra}</div>`;
const chipRol = (rol) => `<span class="${INFO_ROL[rol]?.clase || 'chip-gris'}">${ico(INFO_ROL[rol]?.icono || 'person', 'text-[13px]')}${esc(ROLES[rol] || rol)}</span>`;
const colorAvatar = (clave) => COLORES_AVATAR[[...String(clave || '')].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORES_AVATAR.length];
const avatar = (u) => `<span class="w-10 h-10 rounded-full ${colorAvatar(u.id || u.email)} flex items-center justify-center font-label-lg text-label-lg shrink-0 ${u.activo === false ? 'opacity-50' : ''}" aria-hidden="true">${esc(iniciales(u.nombre))}</span>`;
const fechaLarga = (d) => fecha(d, { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const chipsEstado = (u) => `${u.activo ? '<span class="chip-verde">Activo</span>' : '<span class="chip-gris">Inactivo</span>'}${u.debe_cambiar_clave ? '<span class="chip-ambar" title="Todavía usa una contraseña temporal">Debe cambiar contraseña</span>' : ''}`;
const sesionesTexto = (n) => `${n || 0} ${n === 1 ? 'sesión activa' : 'sesiones activas'}`;

/** Contraseña temporal de 12 caracteres sin letras ambiguas (crypto.getRandomValues, sin sesgo de módulo). */
function generarClave(largo = 12) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const limite = Math.floor(0x100000000 / abc.length) * abc.length;
  let clave = '';
  do {
    clave = '';
    while (clave.length < largo) {
      const lote = crypto.getRandomValues(new Uint32Array(largo));
      for (const x of lote) if (x < limite && clave.length < largo) clave += abc[x % abc.length];
    }
  } while (!(/[a-z]/.test(clave) && /[A-Z]/.test(clave) && /\d/.test(clave)));
  return clave;
}

// ---------------- Mi perfil ----------------
function misSesiones() {
  const mio = (equipo || []).find((u) => u.id === yo.id);
  if (!mio) return '';
  return `<ul class="flex flex-col gap-1.5">
    <li class="flex items-center gap-2">${ico('devices', 'text-[18px] text-outline')}<span>${sesionesTexto(mio.sesiones)} (este y otros dispositivos)</span></li>
    <li class="flex items-center gap-2">${ico('login', 'text-[18px] text-outline')}<span>${mio.ultimo_acceso ? `Último inicio de sesión: ${esc(fechaLarga(mio.ultimo_acceso))}` : 'Sin inicios de sesión registrados'}</span></li>
    <li class="flex items-center gap-2">${ico('key', 'text-[18px] text-outline')}<span>Al cambiar tu contraseña se cierran tus otras sesiones.</span></li></ul>`;
}

function tarjetaPerfil() {
  return `<section id="perfil" class="${claseTarjeta} scroll-mt-24 transition-shadow">
    ${encabezadoTarjeta('person', 'Mi perfil', 'Tus datos para entrar al panel.')}
    <div class="flex items-center gap-space-sm p-space-sm rounded-xl bg-surface-container-low mb-space-md">
      <span data-perfil-avatar class="w-14 h-14 rounded-full bg-primary text-on-primary flex items-center justify-center font-headline-sm text-headline-sm shrink-0" aria-hidden="true">${esc(iniciales(yo.nombre))}</span>
      <div class="min-w-0 flex-1"><p data-perfil-nombre class="font-label-lg text-label-lg text-on-surface truncate">${esc(yo.nombre)}</p>
        <p data-perfil-email class="font-body-sm text-body-sm text-on-surface-variant truncate">${esc(yo.email)}</p>
        <div class="mt-1">${chipRol(yo.rol)}</div></div></div>
    <p class="font-body-sm text-body-sm text-on-surface-variant mb-space-md">${esc(INFO_ROL[yo.rol]?.texto || '')}</p>
    <div data-aviso-temporal class="${yo.debe_cambiar_clave ? '' : 'hidden'} flex items-start gap-2 p-3 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] font-body-sm text-body-sm mb-space-md">${ico('key', 'text-[18px] shrink-0')}<span>Entraste con una contraseña temporal. Cámbiala por una que sólo tú conozcas.</span></div>
    <form data-form-perfil novalidate class="flex flex-col gap-space-sm">
      <div><label class="etiqueta" for="perfilNombre">Nombre</label><input id="perfilNombre" name="nombre" class="campo" maxlength="60" required autocomplete="name" value="${esc(yo.nombre)}"></div>
      <div><label class="etiqueta" for="perfilEmail">Correo</label><input id="perfilEmail" name="email" type="email" class="campo" maxlength="120" required autocomplete="email" value="${esc(yo.email)}">
        <p class="ayuda">Es el correo con el que entras al panel.</p></div>
      <p data-error-perfil role="alert" class="hidden px-3 py-2 rounded-lg bg-[#FEF2F2] text-[#991B1B] font-label-md text-label-md border border-[#FECACA]"></p>
      <div class="flex flex-col sm:flex-row lg:flex-col xl:flex-row gap-2 pt-1">
        <button type="submit" data-guardar-perfil class="btn-primario flex-1" disabled>${ico('save', 'text-[18px]')}<span>Guardar perfil</span></button>
        <button type="button" data-mi-clave class="btn-secundario flex-1">${ico('key', 'text-[18px]')}<span>Cambiar contraseña</span></button>
      </div>
    </form>
    <div data-mis-sesiones class="hidden mt-space-md pt-space-md border-t border-surface-container font-body-sm text-body-sm text-on-surface-variant"></div>
  </section>`;
}

function refrescarPerfil() {
  const f = $('[data-form-perfil]', raiz);
  $('[data-perfil-nombre]', raiz).textContent = yo.nombre;
  $('[data-perfil-email]', raiz).textContent = yo.email;
  $('[data-perfil-avatar]', raiz).textContent = iniciales(yo.nombre);
  $('[data-aviso-temporal]', raiz)?.classList.toggle('hidden', !yo.debe_cambiar_clave);
  if (f) { f.elements.nombre.value = yo.nombre; f.elements.email.value = yo.email; $('[data-guardar-perfil]', f).disabled = true; }
}

/** Refleja el nuevo nombre/correo en el menú de usuario del encabezado (armado por base.js). */
function actualizarEncabezado() {
  try {
    const boton = $('[data-usuario]');
    if (boton) {
      if (boton.firstElementChild) boton.firstElementChild.textContent = iniciales(yo.nombre);
      const nombre = boton.querySelector('.flex-col > span');
      if (nombre) nombre.textContent = yo.nombre;
    }
    const lineas = $$('[data-menu-usuario] p');
    if (lineas[0]) lineas[0].textContent = yo.nombre;
    if (lineas[1]) lineas[1].textContent = yo.email;
  } catch { /* se actualiza al recargar */ }
}

async function guardarPerfil(f) {
  const nombre = f.elements.nombre.value.trim();
  const email = f.elements.email.value.trim().toLowerCase();
  const caja = $('[data-error-perfil]', f);
  const fallar = (mensaje, campo = null) => {
    caja.textContent = mensaje;
    caja.classList.remove('hidden');
    if (campo) { f.elements[campo].classList.add('campo-error'); f.elements[campo].focus(); }
  };
  caja.classList.add('hidden');
  if (!nombre) { fallar('Escribe tu nombre.', 'nombre'); return; }
  if (!CORREO.test(email)) { fallar('Revisa el correo: no parece válido.', 'email'); return; }
  const boton = $('[data-guardar-perfil]', f);
  const antes = boton.innerHTML;
  boton.disabled = true;
  boton.innerHTML = `${spinner()}<span>Guardando…</span>`;
  try {
    const r = await db.rpc('mt_actualizar_perfil', { p_nombre: nombre, p_email: email });
    yo.nombre = r?.nombre || nombre;
    yo.email = r?.email || email;
    const mio = (equipo || []).find((u) => u.id === yo.id);
    if (mio) { mio.nombre = yo.nombre; mio.email = yo.email; pintarEquipo(); }
    boton.innerHTML = antes;
    refrescarPerfil();
    actualizarEncabezado();
    toast('Perfil actualizado');
  } catch (e) {
    boton.innerHTML = antes;
    boton.disabled = false;
    fallar(e.message);
  }
}

// ---------------- Equipo ----------------
function acciones(u, vertical = false) {
  return `<div class="${vertical ? 'flex flex-col' : 'inline-flex items-center'} gap-1">
    <button type="button" data-editar="${esc(u.id)}" class="btn-icono" aria-label="Editar a ${esc(u.nombre)}" title="Editar">${ico('edit', 'text-[18px]')}</button>
    ${u.id === yo.id ? '' : `<button type="button" data-eliminar="${esc(u.id)}" class="btn-icono hover:text-error hover:bg-error-container" aria-label="Eliminar a ${esc(u.nombre)}" title="Eliminar">${ico('delete', 'text-[18px]')}</button>`}</div>`;
}

const nombreConTu = (u, clases) => `<div class="flex items-center gap-1.5 min-w-0"><span class="${clases} truncate">${esc(u.nombre)}</span>${u.id === yo.id ? '<span class="chip-azul shrink-0">Tú</span>' : ''}</div>`;

const filaTabla = (u) => `<tr class="${u.activo ? '' : 'bg-[#F8FAFC]'}">
    <td><div class="flex items-center gap-2.5 min-w-0 max-w-[320px]">${avatar(u)}<div class="min-w-0">${nombreConTu(u, 'font-label-lg text-label-lg text-[#0F172A]')}
      <p class="font-body-sm text-body-sm text-[#64748B] truncate">${esc(u.email)}</p></div></div></td>
    <td class="whitespace-nowrap">${chipRol(u.rol)}</td>
    <td><div class="flex flex-wrap gap-1">${chipsEstado(u)}</div></td>
    <td class="whitespace-nowrap">${u.ultimo_acceso ? `<span title="${esc(fechaLarga(u.ultimo_acceso))}">${esc(hace(u.ultimo_acceso))}</span>` : '<span class="text-outline">Nunca</span>'}</td>
    <td class="text-center tnum">${u.sesiones ? `<span class="inline-flex items-center gap-1" title="${esc(sesionesTexto(u.sesiones))}">${ico('devices', 'text-[16px] text-outline')}${Number(u.sesiones)}</span>` : '<span class="text-outline">—</span>'}</td>
    ${esDueno ? `<td class="text-right whitespace-nowrap">${acciones(u)}</td>` : ''}</tr>`;

const filaMovil = (u) => `<li class="p-space-sm rounded-xl bg-surface-container-low flex items-start gap-space-sm ${u.activo ? '' : 'opacity-80'}">
    ${avatar(u)}
    <div class="flex-1 min-w-0">
      ${nombreConTu(u, 'font-label-lg text-label-lg text-on-surface')}
      <p class="font-body-sm text-body-sm text-on-surface-variant truncate">${esc(u.email)}</p>
      <div class="flex flex-wrap gap-1 mt-1.5">${chipRol(u.rol)}${chipsEstado(u)}</div>
      <p class="font-body-sm text-body-sm text-outline mt-1.5">${u.ultimo_acceso ? `Último acceso: ${esc(hace(u.ultimo_acceso).toLowerCase())}` : 'Nunca entró'} · ${sesionesTexto(Number(u.sesiones))}</p>
    </div>
    ${esDueno ? acciones(u, true) : ''}</li>`;

function cuerpoEquipo() {
  if (!equipo) {
    return errorEquipo
      ? vacio({ icono: 'cloud_off', titulo: 'No se pudo cargar el equipo', texto: esc(errorEquipo), accion: '<button type="button" data-reintentar class="btn-secundario">Reintentar</button>' })
      : '<div class="flex flex-col gap-2"><div class="h-14 esqueleto"></div><div class="h-14 esqueleto"></div><div class="h-14 esqueleto"></div></div>';
  }
  if (!equipo.length) return vacio({ icono: 'group', titulo: 'Todavía no hay usuarios', texto: 'Agrega a las personas que te ayudan con la tienda.' });
  return `<div class="hidden md:block overflow-x-auto rounded-xl border border-[#E2E8F0]">
      <table class="tabla"><thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th class="text-center">Sesiones</th>${esDueno ? '<th class="text-right">Acciones</th>' : ''}</tr></thead>
        <tbody>${equipo.map(filaTabla).join('')}</tbody></table></div>
    <ul class="md:hidden flex flex-col gap-space-sm">${equipo.map(filaMovil).join('')}</ul>`;
}

function tarjetaEquipo() {
  return `<section class="${claseTarjeta}">
    ${encabezadoTarjeta('group', 'Equipo', 'Personas con acceso al panel de la tienda.', '<span data-resumen-equipo class="font-label-sm text-label-sm uppercase tracking-wider text-outline whitespace-nowrap shrink-0"></span>')}
    ${esDueno ? '' : `<div class="flex items-start gap-2 p-3 rounded-xl bg-surface-container-low font-body-sm text-body-sm text-on-surface-variant mb-space-md">${ico('lock', 'text-[18px] text-outline shrink-0')}<span>Sólo el dueño de la tienda puede agregar, editar o eliminar usuarios. Si necesitas otro acceso, pídeselo.</span></div>`}
    <div data-equipo>${cuerpoEquipo()}</div>
    ${esDueno ? `<button type="button" data-nuevo class="mt-space-md btn-secundario w-full sm:w-auto">${ico('person_add', 'text-[18px]')}<span>Agregar usuario</span></button>` : ''}
  </section>`;
}

function pintarEquipo() {
  const cont = $('[data-equipo]', raiz);
  if (cont) cont.innerHTML = cuerpoEquipo();
  const resumen = $('[data-resumen-equipo]', raiz);
  if (resumen) {
    const activos = (equipo || []).filter((u) => u.activo).length;
    resumen.textContent = equipo ? `${equipo.length} ${equipo.length === 1 ? 'usuario' : 'usuarios'} · ${activos} ${activos === 1 ? 'activo' : 'activos'}` : '';
  }
  const ses = $('[data-mis-sesiones]', raiz);
  if (ses) { const h = misSesiones(); ses.innerHTML = h; ses.classList.toggle('hidden', !h); }
}

async function cargarEquipo() {
  try {
    const r = await db.rpc('mt_equipo');
    equipo = Array.isArray(r) ? r : [];
    errorEquipo = '';
  } catch (e) {
    errorEquipo = e.message;
    if (equipo) toastError(e);
  }
  pintarEquipo();
}

// ---------------- Alta, edición y baja (sólo dueño) ----------------
const campoClave = (nuevo) => `<div>
    <label class="etiqueta" for="uClave">${nuevo ? 'Contraseña temporal <span class="text-error">*</span>' : 'Nueva contraseña temporal (opcional)'}</label>
    <div class="flex gap-2">
      <div class="relative flex-1 min-w-0">
        <input id="uClave" name="clave" type="text" class="campo pr-11 font-mono tracking-wide" maxlength="72" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${nuevo ? 'Mínimo 8 caracteres' : 'Vacío = no cambiarla'}">
        <button type="button" data-copiar-clave class="absolute right-1 top-1/2 -translate-y-1/2 btn-icono" aria-label="Copiar contraseña" title="Copiar">${ico('content_copy', 'text-[18px]')}</button></div>
      <button type="button" data-generar class="btn-secundario shrink-0">${ico('autorenew', 'text-[18px]')}<span>Generar</span></button>
    </div>
    <p class="ayuda">${nuevo ? 'Cópiala y envíasela por un canal privado (en persona o por mensaje directo). Al entrar, el panel le pedirá cambiarla.' : 'Si escribes una, se cerrarán sus sesiones y deberá cambiarla al entrar. Compártela por un canal privado.'}</p>
  </div>`;

function formularioUsuario(u, nuevo, esYo) {
  const rol = u?.rol || 'editor';
  return `<div class="flex flex-col gap-3">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div><label class="etiqueta" for="uNombre">Nombre <span class="text-error">*</span></label>
        <input id="uNombre" name="nombre" class="campo" maxlength="60" required autocomplete="off" value="${esc(u?.nombre || '')}" placeholder="Ej: Laura Gómez"></div>
      <div><label class="etiqueta" for="uEmail">Correo <span class="text-error">*</span></label>
        <input id="uEmail" name="email" type="email" class="campo" maxlength="120" required autocomplete="off" value="${esc(u?.email || '')}" placeholder="laura@tutienda.com"></div>
    </div>
    <div><label class="etiqueta" for="uRol">Rol</label>
      <select id="uRol" name="rol" class="campo" ${esYo ? 'disabled' : ''}>${Object.entries(ROLES).map(([k, t]) => `<option value="${k}" ${k === rol ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <p class="ayuda" data-rol-ayuda>${esc(INFO_ROL[rol]?.texto || '')}</p>
      ${esYo ? '<p class="ayuda">No puedes cambiar tu propio rol: pídeselo a otro dueño si hace falta.</p>' : ''}</div>
    ${nuevo ? '' : `<label class="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] ${esYo ? 'opacity-60' : 'cursor-pointer'}">
      <span class="min-w-0"><span class="block font-label-lg text-label-lg text-[#0F172A]">Cuenta activa</span>
        <span class="block font-body-sm text-body-sm text-[#64748B]">${esYo ? 'No puedes desactivar tu propia cuenta.' : 'Si la desactivas, no podrá entrar y se cerrarán sus sesiones.'}</span></span>
      <input type="checkbox" name="activo" class="interruptor" ${u.activo ? 'checked' : ''} ${esYo ? 'disabled' : ''}></label>`}
    ${esYo ? '<p class="ayuda">Para cambiar tu contraseña usa «Cambiar contraseña» en Mi perfil.</p>' : campoClave(nuevo)}
  </div>`;
}

function mostrarAcceso({ nombre, email, clave }, nuevo) {
  const urlPanel = ruta('admin/index.html');
  const texto = `Hola ${nombre.split(' ')[0]}, este es tu acceso al panel de ${tienda().nombre || 'la tienda'}:\nPanel: ${urlPanel}\nCorreo: ${email}\nContraseña temporal: ${clave}\nAl entrar, el panel te pedirá elegir tu propia contraseña.`;
  const fila = (etiqueta, valor) => `<div class="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-3 py-2"><dt class="font-label-md text-label-md text-[#64748B]">${etiqueta}</dt><dd class="font-mono text-[13px] text-[#0F172A] break-all sm:text-right">${esc(valor)}</dd></div>`;
  return modal({
    titulo: nuevo ? 'Usuario creado' : 'Contraseña temporal asignada', icono: 'how_to_reg',
    subtitulo: esc(`Comparte estos datos con ${nombre} por un canal privado. La contraseña no se vuelve a mostrar.`),
    contenido: `<dl class="px-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] divide-y divide-[#E2E8F0]">${fila('Panel', urlPanel)}${fila('Correo', email)}${fila('Contraseña temporal', clave)}</dl>`,
    botones: `<button type="button" data-copiar-acceso class="btn-secundario">${ico('content_copy', 'text-[18px]')}<span>Copiar datos de acceso</span></button><button type="button" data-cerrar class="btn-primario">Listo</button>`,
    alAbrir: (capa) => $('[data-copiar-acceso]', capa).addEventListener('click', async () => {
      const ok = await copiar(texto);
      toast(ok ? 'Datos copiados: pégalos en un mensaje privado' : 'No se pudo copiar', { tipo: ok ? 'ok' : 'error' });
    }),
  });
}

async function editarUsuario(u = null) {
  if (!esDueno) return;
  const nuevo = !u;
  const esYo = !!u && u.id === yo.id;
  const r = await modal({
    titulo: nuevo ? 'Nuevo usuario' : 'Editar usuario', icono: nuevo ? 'person_add' : 'manage_accounts', ancho: 'lg',
    subtitulo: nuevo ? 'Crea un acceso al panel con una contraseña temporal.' : esc(u.email),
    textoEnviar: nuevo ? 'Crear usuario' : 'Guardar cambios',
    contenido: formularioUsuario(u, nuevo, esYo),
    alAbrir: (capa) => {
      const rol = $('#uRol', capa);
      rol?.addEventListener('change', () => { $('[data-rol-ayuda]', capa).textContent = INFO_ROL[rol.value]?.texto || ''; });
      const clave = $('#uClave', capa);
      if (clave && nuevo) clave.value = generarClave();
      $('[data-generar]', capa)?.addEventListener('click', () => { clave.value = generarClave(); clave.focus(); clave.select(); });
      $('[data-copiar-clave]', capa)?.addEventListener('click', async () => {
        if (!clave.value) { toast('Primero escribe o genera una contraseña', { tipo: 'info' }); return; }
        const ok = await copiar(clave.value);
        toast(ok ? 'Contraseña copiada' : 'No se pudo copiar', { tipo: ok ? 'ok' : 'error' });
      });
    },
    alEnviar: async (form) => {
      const nombre = form.elements.nombre.value.trim();
      const email = form.elements.email.value.trim().toLowerCase();
      const rol = esYo ? u.rol : form.elements.rol.value;
      const activo = nuevo || esYo ? true : form.elements.activo.checked;
      const clave = esYo ? '' : (form.elements.clave?.value || '').trim();
      if (!nombre) throw new Error('Escribe el nombre.');
      if (!CORREO.test(email)) throw new Error('Revisa el correo: no parece válido.');
      if (!ROLES[rol]) throw new Error('Elige un rol.');
      if (nuevo && !clave) throw new Error('Asigna una contraseña temporal (usa «Generar»).');
      if (clave && clave.length < 8) throw new Error('La contraseña temporal debe tener al menos 8 caracteres.');
      const p = { email, nombre, rol, activo, ...(u ? { id: u.id } : {}), ...(clave ? { clave } : {}) };
      const res = await db.rpc('mt_guardar_admin', { p });
      return { id: res?.id || u?.id, nombre, email, rol, clave };
    },
  });
  if (!r || r === true) return;
  if (esYo) { yo.nombre = r.nombre; yo.email = r.email; refrescarPerfil(); actualizarEncabezado(); }
  await cargarEquipo();
  if (r.clave) await mostrarAcceso(r, nuevo);
  else toast(nuevo ? 'Usuario creado' : 'Usuario actualizado');
}

async function eliminarUsuario(u) {
  const ok = await confirmar({
    titulo: 'Eliminar usuario', peligro: true, boton: 'Eliminar usuario',
    mensaje: `<strong>${esc(u.nombre)}</strong> (${esc(u.email)}) ya no podrá entrar al panel y se cerrarán sus sesiones. Su historial en el registro de actividad se conserva. Si sólo quieres quitarle el acceso por un tiempo, edítalo y desactiva la cuenta.`,
  });
  if (!ok) return;
  try {
    await db.rpc('mt_eliminar_admin', { p_id: u.id });
    toast(`Se eliminó la cuenta de ${u.nombre}`);
    await cargarEquipo();
  } catch (e) { toastError(e); } // p. ej. "Debe quedar al menos un dueño activo"
}

// ---------------- Matriz de permisos ----------------
function tarjetaMatriz() {
  const roles = Object.keys(ROLES);
  const celda = (fila, rol) => {
    if (PERMISOS[fila.area].includes(rol)) return `<span class="inline-flex w-7 h-7 rounded-full bg-[#ECFDF5] text-[#047857] items-center justify-center" title="Acceso completo">${ico('check', 'text-[18px]')}<span class="sr-only">Acceso completo</span></span>`;
    if (fila.parcial) return `<span class="inline-flex w-7 h-7 rounded-full bg-surface-container text-on-surface-variant items-center justify-center" title="${esc(fila.parcial)}">${ico('visibility', 'text-[17px]')}<span class="sr-only">${esc(fila.parcial)}</span></span>`;
    return `<span class="inline-flex w-7 h-7 rounded-full bg-[#FEF2F2] text-[#DC2626] items-center justify-center" title="Sin acceso">${ico('close', 'text-[18px]')}<span class="sr-only">Sin acceso</span></span>`;
  };
  const resaltar = (rol) => (rol === yo.rol ? 'bg-primary/5' : '');
  return `<section class="${claseTarjeta}">
    ${encabezadoTarjeta('shield', 'Roles y permisos', 'Qué puede hacer cada rol en el panel. La base de datos aplica las mismas reglas.')}
    <div class="overflow-x-auto -mx-space-md px-space-md sm:mx-0 sm:px-0">
      <table class="w-full min-w-[500px] text-left border-collapse">
        <caption class="sr-only">Permisos por rol</caption>
        <thead><tr>
          <th scope="col" class="sticky left-0 z-10 bg-surface-container-lowest py-2 pr-3 align-bottom font-label-sm text-label-sm uppercase tracking-wider text-outline">Sección</th>
          ${roles.map((r) => `<th scope="col" class="py-2 px-2 text-center align-bottom rounded-t-lg ${resaltar(r)}"><span class="flex flex-col items-center gap-1">${ico(INFO_ROL[r].icono, 'text-[20px] text-primary')}
            <span class="font-label-md text-label-md text-on-surface leading-tight">${esc(ROLES[r])}</span>${r === yo.rol ? '<span class="font-label-sm text-label-sm text-primary uppercase tracking-wider">Tu rol</span>' : ''}</span></th>`).join('')}
        </tr></thead>
        <tbody>${MATRIZ.map((f) => `<tr class="border-t border-surface-container">
          <th scope="row" class="sticky left-0 z-10 bg-surface-container-lowest py-2.5 pr-3 font-body-md text-body-md text-on-surface font-normal"><span class="flex items-center gap-2">${ico(f.icono, 'text-[18px] text-outline')}<span>${esc(f.seccion)}</span></span></th>
          ${roles.map((r) => `<td class="py-2.5 px-2 text-center ${resaltar(r)}">${celda(f, r)}</td>`).join('')}</tr>`).join('')}
        </tbody></table></div>
    <div class="mt-space-md flex flex-wrap gap-x-space-lg gap-y-1.5 font-body-sm text-body-sm text-on-surface-variant">
      <span class="flex items-center gap-1.5"><span class="inline-flex w-5 h-5 rounded-full bg-[#ECFDF5] text-[#047857] items-center justify-center">${ico('check', 'text-[14px]')}</span>Acceso completo</span>
      <span class="flex items-center gap-1.5"><span class="inline-flex w-5 h-5 rounded-full bg-surface-container text-on-surface-variant items-center justify-center">${ico('visibility', 'text-[13px]')}</span>Sólo ver el equipo y su propio perfil</span>
      <span class="flex items-center gap-1.5"><span class="inline-flex w-5 h-5 rounded-full bg-[#FEF2F2] text-[#DC2626] items-center justify-center">${ico('close', 'text-[14px]')}</span>Sin acceso</span>
    </div>
    <div class="mt-space-md grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-sm">
      ${roles.map((r) => `<div class="p-space-sm rounded-xl ${r === yo.rol ? 'bg-primary/5 ring-1 ring-primary/20' : 'bg-surface-container-low'}"><div class="mb-1">${chipRol(r)}</div><p class="font-body-sm text-body-sm text-on-surface-variant">${esc(INFO_ROL[r].texto)}</p></div>`).join('')}
    </div></section>`;
}

// ---------------- Armado ----------------
raiz.innerHTML = `
  <div class="flex flex-col xl:flex-row xl:items-end justify-between gap-space-md">
    <div><span class="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-bold">Sistema • Seguridad</span>
      <h1 class="font-headline-lg-mobile text-headline-lg-mobile lg:font-headline-lg lg:text-headline-lg text-on-surface tracking-tight">Usuarios & Permisos</h1>
      <p class="font-body-md text-body-md text-on-surface-variant">Tu perfil, el equipo con acceso al panel y lo que puede hacer cada rol.</p></div>
    ${esDueno ? `<button type="button" data-nuevo class="self-start xl:self-auto flex items-center gap-space-xs px-3.5 py-2 rounded-xl bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md shadow-sm transition-all">${ico('person_add', 'text-[18px]')}<span>Nuevo usuario</span></button>` : ''}
  </div>
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
    <div class="lg:col-span-4">${tarjetaPerfil()}</div>
    <div class="lg:col-span-8">${tarjetaEquipo()}</div>
  </div>
  ${tarjetaMatriz()}`;

function revisarHash() {
  const h = location.hash.slice(1);
  if (h === 'nuevo') {
    history.replaceState(null, '', location.pathname + location.search);
    if (esDueno) editarUsuario();
    else toast('Sólo el dueño de la tienda puede crear usuarios.', { tipo: 'info' });
  } else if (h === 'perfil') {
    const el = $('#perfil', raiz);
    el?.scrollIntoView({ block: 'start' });
    el?.classList.add('ring-2', 'ring-primary/40');
    setTimeout(() => el?.classList.remove('ring-2', 'ring-primary/40'), 1800);
  }
}

// ---------------- Eventos ----------------
raiz.addEventListener('input', (e) => {
  const f = e.target.closest('[data-form-perfil]');
  if (!f) return;
  e.target.classList.remove('campo-error');
  $('[data-error-perfil]', f).classList.add('hidden');
  const cambiado = f.elements.nombre.value.trim() !== yo.nombre || f.elements.email.value.trim().toLowerCase() !== String(yo.email || '').toLowerCase();
  $('[data-guardar-perfil]', f).disabled = !cambiado;
});
raiz.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-form-perfil]');
  if (!f) return;
  e.preventDefault();
  guardarPerfil(f);
});
raiz.addEventListener('click', async (e) => {
  const t = e.target;
  if (t.closest('[data-mi-clave]')) {
    // base.js marca la sesión (admin()) como "ya no debe cambiar la clave" y cierra las otras sesiones
    if (await cambiarClave()) {
      $('[data-aviso-temporal]', raiz)?.classList.toggle('hidden', !yo.debe_cambiar_clave);
      cargarEquipo();
    }
    return;
  }
  if (t.closest('[data-nuevo]')) { editarUsuario(); return; }
  if (t.closest('[data-reintentar]')) { errorEquipo = ''; pintarEquipo(); cargarEquipo(); return; }
  const ed = t.closest('[data-editar]');
  if (ed) { const u = (equipo || []).find((x) => x.id === ed.dataset.editar); if (u) editarUsuario(u); return; }
  const el = t.closest('[data-eliminar]');
  if (el) { const u = (equipo || []).find((x) => x.id === el.dataset.eliminar); if (u) eliminarUsuario(u); }
});
window.addEventListener('hashchange', revisarHash);

await cargarEquipo();
revisarHash();
