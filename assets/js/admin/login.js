// Inicio de sesión del panel (login propio: mt_login devuelve un token de sesión de 14 días).
import { $, $$, ico } from '../util.js';
import { db, usarSesion, token, guardarToken, urlImagen } from '../api.js';

usarSesion(true);
const volver = new URLSearchParams(location.search).get('volver');
const destino = volver && /^[a-z-]+\.html/.test(volver) ? volver : 'dashboard.html';

// Si ya hay una sesión válida, entra directo.
if (token()) {
  db.rpc('mt_sesion').then((s) => { if (s) location.replace(destino); else guardarToken(null); }).catch(() => {});
}
// Nombre y logo de la tienda
db.leer('mt_config', 'select=nombre,logo_url&id=eq.1').then(([c]) => {
  if (!c) return;
  $$('[data-nombre]').forEach((el) => { el.textContent = c.nombre; });
  if (c.logo_url) $$('[data-logo]').forEach((el) => { el.src = urlImagen(c.logo_url); });
  document.title = `Entrar · Panel ${c.nombre}`;
}).catch(() => {});

$('#verClave').addEventListener('click', () => {
  const campo = $('#clave');
  const ver = campo.type === 'password';
  campo.type = ver ? 'text' : 'password';
  $('#verClave').innerHTML = ico(ver ? 'visibility_off' : 'visibility', 'text-[20px]');
  $('#verClave').setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
});

$('#formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#email').value.trim();
  const clave = $('#clave').value;
  const error = $('#error');
  error.classList.add('hidden');
  if (!email || !clave) { error.textContent = 'Escribe tu correo y tu contraseña.'; error.classList.remove('hidden'); return; }
  const boton = $('#entrar');
  boton.disabled = true;
  boton.innerHTML = '<svg class="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" d="M4 12a8 8 0 018-8v8H4z" fill="currentColor"></path></svg> Entrando…';
  try {
    const r = await db.rpc('mt_login', { p_email: email, p_clave: clave });
    if (!r?.ok) throw new Error(r?.error || 'No se pudo iniciar sesión');
    guardarToken(r.token);
    location.replace(destino);
  } catch (err) {
    error.textContent = err.message;
    error.classList.remove('hidden');
    boton.disabled = false;
    boton.innerHTML = `${ico('login', 'text-[20px]')}Entrar`;
    $('#clave').select();
  }
});
