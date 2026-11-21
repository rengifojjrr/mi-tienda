// Carga el catálogo de ejemplo (supabase/semilla.json) en Supabase usando la API REST.
// Uso: MT_TOKEN=<token de una sesión del panel con rol dueño> node herramientas/sembrar.mjs
// Es idempotente: vuelve a ejecutarse sin duplicar (usa el slug / la clave como identificador).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = fs.readFileSync(path.join(raiz, 'assets/js/config.js'), 'utf8');
const URL_SB = cfg.match(/SUPABASE_URL\s*=\s*'([^']+)'/)[1];
const KEY = cfg.match(/SUPABASE_KEY\s*=\s*'([^']+)'/)[1];
const TOKEN = process.env.MT_TOKEN;
if (!TOKEN) { console.error('Falta MT_TOKEN'); process.exit(1); }

const semilla = JSON.parse(fs.readFileSync(path.join(raiz, 'supabase/semilla.json'), 'utf8'));
const img = (n) => `assets/img/demo/${n}.webp`;
const mini = (n) => `assets/img/demo/${n}-mini.webp`;

async function api(metodo, ruta, cuerpo, prefer) {
  const r = await fetch(`${URL_SB}/rest/v1/${ruta}`, {
    method: metodo,
    headers: { apikey: KEY, 'x-mt-token': TOKEN, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${metodo} ${ruta} → ${r.status} ${texto}`);
  return texto ? JSON.parse(texto) : null;
}
const upsert = (tabla, filas, clave) => api('POST', `${tabla}?on_conflict=${clave}`, filas, 'resolution=merge-duplicates,return=representation');

// 1. Configuración y contenido
await api('PATCH', 'mt_config?id=eq.1', semilla.config, 'return=minimal');
await upsert('mt_contenido', Object.entries(semilla.contenido).map(([clave, valor]) => ({ clave, valor })), 'clave');
console.log('config y contenido ✓');

// 2. Categorías
const cats = await upsert('mt_categorias', semilla.categorias.map(({ imagen, ...c }) => ({
  ...c, imagen_url: mini(imagen), visible: true, destacada: true, ejemplo: true,
})), 'slug');
const idCat = Object.fromEntries(cats.map((c) => [c.slug, c.id]));
console.log('categorías ✓', cats.length);

// 3. Productos (dos pasadas: primero filas, luego relacionados)
const filas = semilla.productos.map((p, i) => ({
  slug: p.slug, sku: p.sku, codigo_barras: p.codigo_barras ?? null, nombre: p.nombre, marca: p.marca ?? null,
  modelo: p.modelo ?? null, material: p.material ?? null, peso: p.peso ?? null,
  categoria_id: idCat[p.categoria] ?? null, subcategoria: p.subcategoria ?? null,
  descripcion_corta: p.descripcion_corta ?? null, descripcion: p.descripcion ?? null,
  etiquetas: p.etiquetas ?? [], destacados: p.destacados ?? [], especificaciones: p.especificaciones ?? [],
  imagenes: (p.imagenes ?? []).map((n) => ({ url: img(n), mini: mini(n), alt: p.nombre })),
  variantes: p.variantes ?? [], garantias: p.garantias ?? [],
  precio: p.precio, precio_oferta: p.precio_oferta ?? null, oferta_activa: !!p.oferta_activa,
  stock: p.stock ?? 0, stock_minimo: p.stock_minimo ?? 5, rastrear_stock: true,
  al_agotarse: p.al_agotarse ?? 'bloquear', estado: p.estado ?? 'publicado',
  destacado: !!p.destacado, novedad: !!p.novedad, relampago: !!p.relampago, envio_gratis: !!p.envio_gratis,
  en_catalogo_wa: true, orden: i, ventas: p.ventas ?? 0, ejemplo: true,
}));
const prods = await upsert('mt_productos', filas, 'slug');
const idProd = Object.fromEntries(prods.map((p) => [p.slug, p.id]));
for (const p of semilla.productos) {
  if (p.relacionados?.length) {
    await api('PATCH', `mt_productos?id=eq.${idProd[p.slug]}`, { relacionados: p.relacionados.map((s) => idProd[s]).filter(Boolean) }, 'return=minimal');
  }
}
await upsert('mt_productos_privado', semilla.productos.map((p) => ({
  producto_id: idProd[p.slug], costo: p.costo ?? null, ubicacion: p.ubicacion ?? null,
})), 'producto_id');
console.log('productos ✓', prods.length);

// 4. Banners, promociones y reseñas (se reemplazan los de ejemplo)
await api('DELETE', 'mt_banners?ejemplo=eq.true', undefined, 'return=minimal');
await api('POST', 'mt_banners', semilla.banners.map(({ imagen, ...b }) => ({
  mensaje_whatsapp: 'Hola {tienda}, quiero conocer las ofertas activas', ...b, imagen_url: img(imagen), activo: true, ejemplo: true,
})), 'return=minimal');
await api('DELETE', 'mt_promociones?ejemplo=eq.true', undefined, 'return=minimal');
await api('POST', 'mt_promociones', semilla.promociones.map((p) => ({ codigo: null, ...p, activa: true, ejemplo: true })), 'return=minimal');
await api('DELETE', 'mt_testimonios?ejemplo=eq.true', undefined, 'return=minimal');
await api('POST', 'mt_testimonios', semilla.testimonios.map(({ producto, ...t }) => ({ ...t, producto_id: idProd[producto] ?? null, publicado: true, ejemplo: true })), 'return=minimal');
console.log('banners, promociones y reseñas ✓');
