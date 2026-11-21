// Estado de la tienda: datos del catálogo (con caché corta), lista de pedido, favoritos,
// datos del cliente y pedidos enviados. Todo lo del cliente vive en su propio navegador.
import { db, usarSesion } from '../api.js';
import { num, precioVigente } from '../util.js';

const leerLS = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } };
const guardarLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

export const params = new URLSearchParams(location.search);
/** Vista previa desde el panel: muestra borradores y no cuenta visitas. */
export const vistaPrevia = params.get('vista_previa') === '1';
if (vistaPrevia) usarSesion(true);

// ---------------- Datos del catálogo ----------------
const CLAVE_CACHE = 'mt_tienda_cache_v1';
const VIDA_CACHE = 60_000;
let promesaDatos = null;

async function pedirDatos() {
  const [config, categorias, productos, banners, promociones, testimonios, contenido] = await Promise.all([
    db.leer('mt_config', 'select=*&id=eq.1'),
    db.leer('mt_categorias', 'select=*&order=orden,nombre'),
    db.leer('mt_productos', `select=*&order=orden,nombre${vistaPrevia ? '' : '&estado=eq.publicado'}`),
    db.leer('mt_banners', 'select=*&order=orden'),
    db.leer('mt_promociones', 'select=id,nombre,tipo,valor,minimo_compra,codigo,activa,inicio,fin&codigo=is.null'),
    db.leer('mt_testimonios', 'select=*&publicado=eq.true&order=orden,creado_en.desc'),
    db.leer('mt_contenido', 'select=clave,valor'),
  ]);
  return {
    cfg: config[0] || {},
    categorias: categorias.filter((c) => c.visible || vistaPrevia),
    productos,
    banners: banners.filter((b) => b.activo),
    promociones: promociones.filter((p) => p.activa),
    testimonios,
    contenido: Object.fromEntries(contenido.map((c) => [c.clave, c.valor])),
    cargado: Date.now(),
  };
}

/** Devuelve los datos de la tienda. Usa una caché de 60 s por pestaña para navegar rápido. */
export function cargarDatos({ fresco = false } = {}) {
  if (promesaDatos && !fresco) return promesaDatos;
  if (!fresco && !vistaPrevia) {
    try {
      const c = JSON.parse(sessionStorage.getItem(CLAVE_CACHE) || 'null');
      if (c && Date.now() - c.cargado < VIDA_CACHE) return (promesaDatos = Promise.resolve(preparar(c)));
    } catch { /* caché dañada */ }
  }
  promesaDatos = pedirDatos().then((d) => {
    if (!vistaPrevia) { try { sessionStorage.setItem(CLAVE_CACHE, JSON.stringify(d)); } catch { /* lleno */ } }
    return preparar(d);
  });
  return promesaDatos;
}
export const olvidarCache = () => { try { sessionStorage.removeItem(CLAVE_CACHE); } catch { /* nada */ } promesaDatos = null; };

/** Índices útiles calculados una sola vez. */
function preparar(d) {
  d.porId = new Map(d.productos.map((p) => [p.id, p]));
  d.porSlug = new Map(d.productos.map((p) => [p.slug, p]));
  d.catPorId = new Map(d.categorias.map((c) => [c.id, c]));
  d.catPorSlug = new Map(d.categorias.map((c) => [c.slug, c]));
  const ventas = [...d.productos].sort((a, b) => b.ventas - a.ventas).slice(0, 3).filter((p) => p.ventas > 0);
  d.topVentas = new Set(ventas.map((p) => p.id));
  return d;
}

// ---------------- Visitante y estadísticas ----------------
export function visitante() {
  let v = leerLS('mt_visitante', null);
  if (!v) {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    v = `v-${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
    guardarLS('mt_visitante', v);
  }
  return v;
}

/** Registra un evento anónimo (visita, vista de producto, clic a WhatsApp…). Nunca bloquea. */
export function registrar(tipo, { pagina = null, producto = null, canal = null, termino = null } = {}) {
  if (vistaPrevia) return;
  db.rpc('mt_registrar_evento', {
    p_tipo: tipo, p_visitante: visitante(), p_pagina: pagina, p_producto: producto, p_canal: canal, p_termino: termino,
  }, { keepalive: true }).catch(() => {});
}

// ---------------- Lista de pedido (carrito) ----------------
const CLAVE_PEDIDO = 'mt_pedido';
const oyentes = new Set();
export const alCambiarPedido = (fn) => { oyentes.add(fn); return () => oyentes.delete(fn); };
const avisar = () => oyentes.forEach((fn) => fn(leerPedido()));
window.addEventListener('storage', (e) => { if (e.key === CLAVE_PEDIDO) avisar(); });

/** [{producto_id, variante, garantia, cantidad}] */
export const leerPedido = () => leerLS(CLAVE_PEDIDO, []).filter((i) => i && i.producto_id);
export function guardarPedido(items) { guardarLS(CLAVE_PEDIDO, items); avisar(); }
const mismaLinea = (a, b) => a.producto_id === b.producto_id && (a.variante || null) === (b.variante || null) && (a.garantia || null) === (b.garantia || null);

export function agregarAlPedido({ producto_id, variante = null, garantia = null, cantidad = 1 }, maximo = 99) {
  const items = leerPedido();
  const linea = { producto_id, variante, garantia, cantidad: Math.max(1, cantidad) };
  const existente = items.find((i) => mismaLinea(i, linea));
  if (existente) existente.cantidad = Math.min(maximo, existente.cantidad + linea.cantidad);
  else items.push({ ...linea, cantidad: Math.min(maximo, linea.cantidad) });
  guardarPedido(items);
  return items;
}
export function cambiarCantidad(indice, cantidad) {
  const items = leerPedido();
  if (!items[indice]) return items;
  if (cantidad <= 0) items.splice(indice, 1); else items[indice].cantidad = Math.min(99, cantidad);
  guardarPedido(items);
  return items;
}
export const vaciarPedido = () => guardarPedido([]);
export const unidadesEnPedido = () => leerPedido().reduce((s, i) => s + num(i.cantidad), 0);

/** Calcula el detalle del pedido con los precios actuales (el servidor lo vuelve a calcular al enviar). */
export function detallarPedido(datos, items = leerPedido()) {
  const lineas = items.map((i, indice) => {
    const p = datos.porId.get(i.producto_id);
    if (!p) return { ...i, indice, producto: null, valida: false, motivo: 'Este producto ya no está disponible' };
    const variante = (p.variantes || []).find((v) => v.nombre === i.variante) || null;
    if ((p.variantes || []).length && !variante) return { ...i, indice, producto: p, valida: false, motivo: 'La opción elegida ya no existe' };
    const garantia = (p.garantias || []).find((g) => g.nombre === i.garantia) || (p.garantias || [])[0] || null;
    const unit = precioVigente(p) + num(variante?.precio_extra) + num(garantia?.precio_extra);
    return { ...i, indice, producto: p, variante: variante?.nombre || null, varianteObj: variante, garantiaObj: garantia, unit, subtotal: unit * i.cantidad, valida: true };
  });
  const validas = lineas.filter((l) => l.valida);
  const subtotal = validas.reduce((s, l) => s + l.subtotal, 0);
  const unidades = validas.reduce((s, l) => s + l.cantidad, 0);
  return { lineas, validas, subtotal, unidades };
}

/** Mejor promoción automática vigente para un subtotal (misma regla que el servidor). */
export function mejorPromocion(promociones, subtotal, extra = null) {
  const hoy = new Date().toISOString().slice(0, 10);
  let mejor = { descuento: 0, nombre: null, codigo: null };
  for (const p of [...promociones, ...(extra ? [extra] : [])]) {
    if (!p.activa || (p.inicio && p.inicio > hoy) || (p.fin && p.fin < hoy) || subtotal < num(p.minimo_compra)) continue;
    const monto = p.tipo === 'porcentaje' ? Math.round(subtotal * num(p.valor)) / 100 : Math.min(num(p.valor), subtotal);
    if (monto > mejor.descuento) {
      mejor = { descuento: monto, nombre: `${p.nombre}${p.tipo === 'porcentaje' ? ` (-${num(p.valor)}%)` : ''}`, codigo: p.codigo || null };
    }
  }
  return mejor;
}

// ---------------- Favoritos ----------------
export const leerFavoritos = () => new Set(leerLS('mt_favoritos', []));
export function alternarFavorito(id) {
  const f = leerFavoritos();
  if (f.has(id)) f.delete(id); else f.add(id);
  guardarLS('mt_favoritos', [...f]);
  return f.has(id);
}

// ---------------- Datos del cliente y pedidos enviados ----------------
export const leerCliente = () => leerLS('mt_cliente', { nombre: '', ciudad: '', telefono: '', nota: '' });
export const guardarCliente = (c) => guardarLS('mt_cliente', c);
export const leerMisPedidos = () => leerLS('mt_mis_pedidos', []);
export function guardarMiPedido(p) {
  const lista = [p, ...leerMisPedidos().filter((x) => x.numero !== p.numero)].slice(0, 40);
  guardarLS('mt_mis_pedidos', lista);
}
export function olvidarMisDatos() {
  ['mt_cliente', 'mt_mis_pedidos', 'mt_favoritos', 'mt_pedido'].forEach((k) => { try { localStorage.removeItem(k); } catch { /* nada */ } });
  avisar();
}
