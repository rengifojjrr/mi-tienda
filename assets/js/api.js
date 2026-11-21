// Cliente mínimo para Supabase (REST, RPC, Storage y la función mt-fotos) sin dependencias.
// El panel se identifica con la cabecera x-mt-token (login propio, ver supabase: mt_login).
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

/** URL raíz del sitio (funciona en local y en GitHub Pages /mi-tienda/). */
export const RAIZ = new URL('../../', import.meta.url).href;
export const ruta = (p = '') => RAIZ + String(p).replace(/^\/+/, '');

const CLAVE_TOKEN = 'mt_panel_token';
let conSesion = false;

/** Las páginas del panel (y la vista previa) llaman a esto para enviar el token. */
export function usarSesion(si = true) { conSesion = si; }
export function token() { try { return localStorage.getItem(CLAVE_TOKEN); } catch { return null; } }
export function guardarToken(t) {
  try { if (t) localStorage.setItem(CLAVE_TOKEN, t); else localStorage.removeItem(CLAVE_TOKEN); } catch { /* modo privado */ }
}

export class ErrorApi extends Error {
  constructor(mensaje, estado = 0, codigo = '') { super(mensaje); this.estado = estado; this.codigo = codigo; }
}

const TRADUCCIONES = [
  [/permission denied|row-level security|violates row-level/i, 'No tienes permiso para hacer esto. Si tu sesión venció, vuelve a entrar.'],
  [/duplicate key.*(sku)/i, 'Ya existe un producto con ese SKU.'],
  [/duplicate key.*(slug)/i, 'Ya existe un elemento con esa dirección (slug). Cambia el nombre o el slug.'],
  [/duplicate key.*(codigo)/i, 'Ese código ya existe.'],
  [/duplicate key.*(telefono)/i, 'Ya hay un cliente con ese teléfono.'],
  [/duplicate key/i, 'Ese valor ya existe y no se puede repetir.'],
  [/violates check constraint.*slug/i, 'El slug sólo puede tener minúsculas, números y guiones.'],
  [/violates check constraint.*codigo/i, 'El código debe tener de 3 a 20 letras o números en mayúsculas (sin espacios).'],
  [/violates check constraint.*whatsapp/i, 'El WhatsApp debe tener sólo números, con código de país (máx. 15).'],
  [/violates check constraint.*telefono/i, 'El teléfono debe tener de 7 a 15 dígitos con código de país.'],
  [/violates check constraint/i, 'Algún dato no tiene el formato correcto. Revisa el formulario.'],
  [/violates foreign key/i, 'No se puede borrar porque otros registros lo usan.'],
  [/value too long/i, 'Algún texto es demasiado largo.'],
  [/Failed to fetch|NetworkError|Load failed/i, 'Sin conexión. Revisa tu internet e inténtalo de nuevo.'],
];
const traducir = (m) => (TRADUCCIONES.find(([re]) => re.test(m))?.[1] ?? m);

function cabeceras(extra = {}) {
  const h = { apikey: SUPABASE_KEY, ...extra };
  const t = conSesion && token();
  if (t) h['x-mt-token'] = t;
  return h;
}

async function pedir(url, opciones = {}) {
  let r;
  try {
    r = await fetch(url, opciones);
  } catch {
    throw new ErrorApi('Sin conexión. Revisa tu internet e inténtalo de nuevo.', 0);
  }
  const texto = await r.text();
  let datos = null;
  if (texto) { try { datos = JSON.parse(texto); } catch { datos = texto; } }
  if (!r.ok) {
    const crudo = (datos && (datos.message || datos.error || datos.msg)) || `Error ${r.status}`;
    if (conSesion && (r.status === 401 || /sesi[oó]n venci/i.test(crudo))) {
      window.dispatchEvent(new CustomEvent('mt:sesion-vencida'));
    }
    throw new ErrorApi(traducir(String(crudo)), r.status, datos?.code);
  }
  return { datos, respuesta: r };
}

const rest = (tabla, consulta = '') => `${SUPABASE_URL}/rest/v1/${tabla}${consulta ? `?${consulta}` : ''}`;

export const db = {
  /** GET /tabla?consulta  (consulta en sintaxis PostgREST: select=*&estado=eq.publicado&order=nombre) */
  async leer(tabla, consulta = 'select=*') {
    return (await pedir(rest(tabla, consulta), { headers: cabeceras() })).datos ?? [];
  },
  /** Igual que leer pero también devuelve el total (para paginar). */
  async leerConTotal(tabla, consulta = 'select=*') {
    const { datos, respuesta } = await pedir(rest(tabla, consulta), { headers: cabeceras({ Prefer: 'count=exact' }) });
    const total = Number((respuesta.headers.get('content-range') || '').split('/')[1]) || 0;
    return { filas: datos ?? [], total };
  },
  async contar(tabla, filtro = '') {
    const { respuesta } = await pedir(rest(tabla, `select=id${filtro ? `&${filtro}` : ''}&limit=1`), { headers: cabeceras({ Prefer: 'count=exact' }) });
    return Number((respuesta.headers.get('content-range') || '').split('/')[1]) || 0;
  },
  async crear(tabla, filas) {
    const { datos } = await pedir(rest(tabla), {
      method: 'POST', headers: cabeceras({ 'Content-Type': 'application/json', Prefer: 'return=representation' }), body: JSON.stringify(filas),
    });
    return datos;
  },
  async upsert(tabla, filas, conflicto) {
    const { datos } = await pedir(rest(tabla, `on_conflict=${conflicto}`), {
      method: 'POST', headers: cabeceras({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' }), body: JSON.stringify(filas),
    });
    return datos;
  },
  /** PATCH /tabla?filtro. Lanza error si no se actualizó nada (sin permiso o no existe). */
  async actualizar(tabla, filtro, cambios) {
    const { datos } = await pedir(rest(tabla, filtro), {
      method: 'PATCH', headers: cabeceras({ 'Content-Type': 'application/json', Prefer: 'return=representation' }), body: JSON.stringify(cambios),
    });
    if (Array.isArray(datos) && datos.length === 0) throw new ErrorApi('No se pudo guardar: el registro no existe o no tienes permiso.', 404);
    return datos;
  },
  async borrar(tabla, filtro) {
    const { datos } = await pedir(rest(tabla, filtro), { method: 'DELETE', headers: cabeceras({ Prefer: 'return=representation' }) });
    return datos;
  },
  async rpc(funcion, args = {}, { keepalive = false } = {}) {
    const { datos } = await pedir(`${SUPABASE_URL}/rest/v1/rpc/${funcion}`, {
      method: 'POST', headers: cabeceras({ 'Content-Type': 'application/json' }), body: JSON.stringify(args), keepalive,
    });
    return datos;
  },
};

export const fotos = {
  publica: (rutaArchivo) => `${SUPABASE_URL}/storage/v1/object/public/mt-fotos/${rutaArchivo}`,
  /** Sube un archivo al depósito mt-fotos (requiere sesión con permiso de catálogo). */
  async subir(rutaArchivo, blob) {
    await pedir(`${SUPABASE_URL}/storage/v1/object/mt-fotos/${rutaArchivo}`, {
      method: 'POST', headers: cabeceras({ 'Content-Type': blob.type || 'application/octet-stream', 'cache-control': '31536000' }), body: blob,
    });
    return fotos.publica(rutaArchivo);
  },
  /** Borra archivos del depósito (mediante la función mt-fotos, ver supabase). */
  async borrar(rutas) {
    const { datos } = await pedir(`${SUPABASE_URL}/functions/v1/mt-fotos`, {
      method: 'POST', headers: cabeceras({ 'Content-Type': 'application/json' }), body: JSON.stringify({ rutas }),
    });
    return datos;
  },
  /** Ruta dentro del depósito a partir de la URL pública (o null si es una imagen de ejemplo). */
  rutaDesdeUrl(url) {
    const marca = '/storage/v1/object/public/mt-fotos/';
    const i = String(url ?? '').indexOf(marca);
    return i >= 0 ? decodeURIComponent(url.slice(i + marca.length).split('?')[0]) : null;
  },
};

/** Resuelve la URL de una imagen guardada (absoluta, o relativa a la raíz del sitio). */
export function urlImagen(u) {
  if (!u) return '';
  if (/^(https?:|data:|blob:)/i.test(u)) return u;
  return ruta(u);
}
