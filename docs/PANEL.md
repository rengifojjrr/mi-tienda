# Guía técnica de MI TIENDA (tienda + panel)

Sitio estático (HTML + módulos ES, sin framework ni build salvo Tailwind) con backend en Supabase
(proyecto compartido `cotizaciones-interactivas`; **todo lo de esta tienda usa el prefijo `mt_`**).

## Estructura

```
index.html, catalogo.html, producto.html, pedido.html, pedido-enviado.html,
categorias.html, soporte.html, cuenta.html, legal.html, 404.html      ← tienda (cliente)
admin/*.html                                                          ← panel (login propio)
assets/js/config.js   URL y clave publicable de Supabase
assets/js/api.js      cliente REST/RPC/Storage (db, fotos, urlImagen, ruta, usarSesion)
assets/js/util.js     utilidades (esc, ico, dinero, fecha, hace, markdown, csv, redimensionar, reglas de producto)
assets/js/tienda/*    módulos de la tienda (base.js = encabezado/pie/menú; estado.js = datos y carrito)
assets/js/admin/base.js  armazón del panel (sesión, menú lateral, encabezado, permisos)
assets/js/admin/ui.js    componentes del panel (modal, confirmar, toast, panelLateral, chips, imágenes, iconos)
src/estilos.css + tailwind.config.cjs → assets/css/app.css   (npm run css)
herramientas/iconos.mjs  recalcula el subconjunto de iconos Material Symbols (npm run iconos)
supabase/semilla.json + herramientas/sembrar.mjs   catálogo de ejemplo
```

Comandos: `npm run construir` (iconos + CSS). Después de agregar clases de Tailwind o iconos nuevos hay que construir.

## Convenciones

- Interfaz y nombres de código en español. Sin librerías externas.
- **Todo dato que venga de la base se escapa con `esc()`** antes de meterlo en HTML.
- Iconos: `ico('nombre', 'clases', relleno?)` → `<span class="material-symbols-outlined">`.
- Errores: `try { … } catch (e) { toastError(e); }`. Los mensajes de PostgREST ya se traducen en `api.js`.
- Enlaces profundos por hash: `#nuevo` abre el formulario de alta, `#<id>` o `#WA-1024` abre el detalle.
- Colores/tokens del diseño Stitch (Tailwind): `bg-surface`, `bg-surface-container-lowest|low|…|highest`,
  `text-on-surface`, `text-on-surface-variant`, `text-outline`, `bg-primary`, `text-primary`, `bg-primary-container`,
  `bg-secondary-container`, `bg-tertiary-fixed`, `bg-error-container`, `bg-wa` (WhatsApp #25D366)…
  Tipografía: `font-headline-lg text-headline-lg`, `font-headline-sm text-headline-sm`, `font-label-md text-label-md`,
  `font-body-sm text-body-sm`, `font-label-sm text-label-sm` (+ `uppercase tracking-wider` para rótulos), `tnum` para cifras.
- Componentes CSS (src/estilos.css): `btn-primario`, `btn-secundario`, `btn-fantasma`, `btn-peligro`, `btn-peligro-suave`,
  `btn-wa`, `btn-sm`, `btn-icono`, `campo` (input/select/textarea), `etiqueta`, `ayuda`, `interruptor` (checkbox switch),
  `tarjeta`, `chip-verde|rojo|ambar|azul|gris|violeta|wa`, `tabla` (thead/tbody estilizados), `esqueleto`, `prosa`.
- Tarjetas del panel como en Stitch: `bg-surface-container-lowest rounded-xl p-space-md shadow-sm`.
- Encabezado de página como en Stitch: rótulo pequeño (`font-label-sm uppercase tracking-wider text-secondary font-bold`),
  `h1.font-headline-lg`, descripción `font-body-md text-on-surface-variant`, acciones a la derecha.

## Página del panel (plantilla)

```html
<div id="panel" data-seccion="pedidos"></div>
<main id="principal" class="lg:pl-72 pt-16 min-h-screen w-full">
  <div id="contenido" class="p-4 lg:p-space-lg max-w-[1600px] mx-auto w-full space-y-space-lg">…esqueleto…</div>
</main>
<script type="module" src="../assets/js/admin/pedidos.js"></script>
```

```js
import { iniciarPanel, puede, dineroPanel, tienda, admin } from './base.js';
await iniciarPanel({ seccion: 'pedidos', migas: [{ texto: 'Ventas' }, { texto: 'Pedidos & Chats' }], area: 'ventas' });
// iniciarPanel redirige al login si no hay sesión y muestra "sin acceso" si el rol no alcanza (lanza error).
```

Áreas/permisos (`puede(area)`): `leer` (todos), `catalogo` (dueño, admin, editor), `ventas` (dueño, admin, vendedor),
`config` (dueño, admin), `usuarios` (sólo dueño). La base de datos aplica las mismas reglas (RLS).

## API de datos (`assets/js/api.js`)

```js
db.leer('mt_pedidos', 'select=*&estado=eq.nuevo&order=creado_en.desc&limit=50')   // sintaxis PostgREST
db.leerConTotal(tabla, consulta) → { filas, total }      db.contar(tabla, 'estado=eq.nuevo') → número
db.crear(tabla, [fila])  db.upsert(tabla, filas, 'clave')  db.actualizar(tabla, 'id=eq.X', cambios)  db.borrar(tabla, 'id=eq.X')
db.rpc('mt_cambiar_estado_pedido', { p_id, p_estado })
fotos.borrar([rutas])  fotos.rutaDesdeUrl(url)  urlImagen(urlGuardada)  ruta('index.html') (URL absoluta de la tienda)
```

## UI del panel (`assets/js/admin/ui.js`)

`toast(msg, {tipo:'ok'|'error'|'info'})`, `toastError(e)`,
`modal({titulo, subtitulo, icono, contenido(html), ancho:'sm|md|lg|xl', textoEnviar, peligro, alAbrir(capa, cerrar), alEnviar(form, capa)})` → promesa
(el contenido va dentro de un `<form>`; si `alEnviar` lanza error se muestra en el modal),
`confirmar({titulo, mensaje, boton, peligro})` → boolean, `panelLateral({titulo, contenido, alAbrir(api)})` → `{el, cuerpo, cerrar, titulo()}`,
`chipPedido(estado)`, `ESTADOS_PEDIDO`, `chipProducto(estado)`, `ROLES`, `vacio({icono,titulo,texto,accion})`,
`esqueletoFilas(n, cols)`, `paginacion({total, pagina, porPagina})` (botones `[data-pagina]`),
`subirImagen(archivo, carpeta)` → `{url, mini, ruta}`, `elegirImagenes({multiple, carpeta})` → `[{url, mini, alt}]`,
`elegirIcono(actual)` → nombre, `leerFormulario(form)` → objeto, `spinner()`.

## Base de datos (tablas `mt_*`)

| Tabla | Columnas clave |
|---|---|
| `mt_config` (fila id=1) | nombre, eslogan, logo_url, whatsapp (sólo dígitos), moneda (USD), locale (es-US), zona_horaria, horario, email, telefono, direccion, ciudad, pais, abierta, mensaje_cerrado, envio_gratis_desde, costo_envio, nota_precios, stock_bajo_umbral, plantilla_producto, plantilla_pedido_inicio, plantilla_pedido_cierre, redes (jsonb {instagram,facebook,tiktok}), soporte_whatsapp, bodega |
| `mt_categorias` | id, slug, nombre, descripcion, icono, imagen_url, orden, visible, destacada, ejemplo |
| `mt_productos` | id, slug, sku, codigo_barras, nombre, marca, modelo, material, peso, categoria_id, subcategoria, descripcion_corta (≤160), descripcion (markdown), etiquetas[], destacados[{icono,titulo,detalle}], especificaciones[{nombre,valor}], imagenes[{url,mini,alt}], variantes[{nombre,detalle,color,sku,precio_extra,stock}], garantias[{nombre,precio_extra}], relacionados uuid[], precio, precio_oferta, oferta_activa, oferta_inicio, oferta_fin, stock (si hay variantes = suma automática), stock_minimo, rastrear_stock, al_agotarse (bloquear/preventa/continuar), estado (publicado/borrador/oculto/archivado), destacado, novedad, relampago, en_catalogo_wa, envio_gratis, orden, ventas, actualizado_por |
| `mt_productos_privado` | producto_id, costo, ubicacion, notas (sólo panel) |
| `mt_pedidos` | id, numero (WA-1001…), codigo, creado_en, actualizado_en, cliente_id, cliente_nombre, cliente_telefono, cliente_ciudad, nota, items[{producto_id,nombre,sku,variante,garantia,cantidad,precio_unit,subtotal,imagen,categoria_id}], unidades, subtotal, descuento, descuento_nombre, codigo_promo, envio, total, moneda, estado (nuevo/contactado/negociacion/confirmado/enviado/entregado/cancelado), canal (carrito/producto/manual), stock_descontado, notas_internas, ejemplo |
| `mt_clientes` | id, nombre, telefono (único, dígitos), ciudad, email, notas, etiquetas[], total_pedidos, total_gastado, ultimo_pedido_en (calculados), ejemplo |
| `mt_movimientos` (kárdex) | id, creado_en, producto_id, variante, tipo (entrada/salida/ajuste/venta/devolucion), cantidad (±), stock_resultante, motivo, referencia, autor |
| `mt_eventos` | visitas y clics anónimos (tipo visita/vista_producto/clic_whatsapp/agregar_pedido/busqueda/aviso_stock) |
| `mt_banners` | id, etiqueta, titulo, subtitulo, imagen_url, nota_imagen, boton_texto, boton_enlace, boton_whatsapp, mensaje_whatsapp, activo, orden, inicio, fin |
| `mt_promociones` | id, nombre, codigo (null = automática; MAYÚSCULAS 3-20), tipo (porcentaje/monto), valor, minimo_compra, activa, inicio, fin, usos, max_usos |
| `mt_testimonios` | id, nombre, ciudad, producto_id, producto_texto, texto, estrellas (1-5), verificado, publicado, orden, ejemplo |
| `mt_contenido` | clave → valor jsonb: `beneficios` {etiqueta,titulo,items[{icono,color,titulo,texto}]}, `faq` [{pregunta,respuesta}], `garantia_envios` [{icono,color,titulo,texto}], `pie` {texto}, `soporte` {titulo,texto}, `legal` {devoluciones,terminos,privacidad} (markdown). color ∈ whatsapp/primary/secondary/tertiary/amber/error |
| `mt_medios` | id, ruta, url, mini_url, nombre, tipo, bytes, ancho, alto, autor, creado_en (galería; los archivos viven en el depósito `mt-fotos`) |
| `mt_actividad` | id, creado_en, autor, accion (insert/update/delete/estado/stock/login/alerta), entidad, entidad_id, detalle |
| `mt_admins`, `mt_sesiones` | sólo vía funciones (no se leen directo) |

Las imágenes de ejemplo se guardan como rutas relativas (`assets/img/demo/x.webp`); las subidas, como URL absoluta del depósito.
Usa siempre `urlImagen()` para mostrarlas.

### Funciones (RPC)

- Sesión: `mt_login(p_email, p_clave)` → `{ok, token, admin}` · `mt_sesion()` · `mt_logout()` · `mt_cambiar_clave(p_actual, p_nueva)` → `{ok, error}` · `mt_actualizar_perfil(p_nombre, p_email)`
- Equipo (dueño): `mt_equipo()` → lista · `mt_guardar_admin(p jsonb {id?, email, nombre, rol, activo, clave?})` · `mt_eliminar_admin(p_id)`
- Pedidos: `mt_crear_pedido(p jsonb {items:[{producto_id, variante, garantia, cantidad}], cliente:{nombre, telefono, ciudad, nota}, codigo, canal:'manual', estado})` (el panel puede usar canal `manual`)
  · `mt_cambiar_estado_pedido(p_id, p_estado)` (descuenta stock al confirmar/enviar/entregar y lo devuelve al cancelar)
- Inventario: `mt_ajustar_stock(p_producto, p_variante, p_delta, p_tipo 'entrada|salida|ajuste', p_motivo, p_referencia)`
- Tablero: `mt_resumen_dashboard(p_desde, p_hasta)` · Datos de ejemplo: `mt_borrar_ejemplos(p_catalogo boolean)`
- Tienda pública: `mt_registrar_evento`, `mt_validar_codigo`, `mt_estado_pedidos`

Borrar archivos del depósito: `fotos.borrar(rutas)` (llama a la función de borde `mt-fotos`; el navegador no puede borrar directo).
