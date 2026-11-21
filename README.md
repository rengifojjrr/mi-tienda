# MI TIENDA · Catálogo con pedidos por WhatsApp

Tienda en línea + panel de administración construidos a partir del diseño de Stitch
(«WhatsApp Commerce Catalog Platform»). El cliente arma su pedido y lo envía por WhatsApp;
el pedido también queda registrado en el panel, donde el equipo lo gestiona, controla el
inventario y ve las estadísticas.

- **Tienda (clientes):** https://rengifojjrr.github.io/mi-tienda/
- **Panel (administración):** https://rengifojjrr.github.io/mi-tienda/admin/
- Acceso inicial del panel: archivo local `ACCESO-ADMIN.txt` (no se sube a GitHub).

## Pantallas

**Tienda:** Inicio · Catálogo · Ficha de producto · Mi Pedido (envío a WhatsApp) · Pedido enviado ·
Categorías · Soporte (contacto, rastreo de pedido, preguntas) · Mi cuenta (mis pedidos, favoritos, mis datos) ·
Garantía & Legal · 404.

**Panel:** Login · Dashboard · Productos · Crear/Editar producto · Inventario y kárdex · Categorías ·
Pedidos & Chats · Clientes CRM · Banners & Promos · Galería multimedia · Contenido de la tienda ·
Configuración · Usuarios & Permisos · Registro de actividad.

## Cómo funciona

- Sitio estático (HTML + JavaScript sin framework) publicado en GitHub Pages.
- Datos en Supabase (proyecto compartido `cotizaciones-interactivas`): todo usa el prefijo `mt_`
  (tablas, funciones, depósito de fotos `mt-fotos` y la función de borde `mt-fotos`).
- El panel tiene **login propio** (no usa los usuarios de Supabase Auth, así no toca otras apps del proyecto).
- Los precios del pedido se recalculan en el servidor (`mt_crear_pedido`); el navegador no puede alterarlos.
- Confirmar un pedido descuenta stock y cancelarlo lo devuelve; todo queda en el kárdex.
- Hay **datos de ejemplo** (pedidos, clientes, visitas y reseñas marcadas como ejemplo) para ver el dashboard
  con vida. Se borran en *Panel → Configuración → Datos*.

Detalle técnico (estructura, tablas, funciones, convenciones): [`docs/PANEL.md`](docs/PANEL.md).
Decisiones de diseño: [`docs/DISENO.md`](docs/DISENO.md).

## Primeros pasos para el dueño

1. Entra al panel con los datos de `ACCESO-ADMIN.txt` y cambia la contraseña.
2. *Configuración → WhatsApp*: pon el número de ventas con código de país (sin él, el cliente elige el contacto).
3. *Configuración → Tienda*: nombre, logo, moneda y zona horaria.
4. Carga tus productos (o edita los de ejemplo) y, cuando estés listo, borra los datos de ejemplo.

## Desarrollo

```bash
npm install          # sólo instala Tailwind (para compilar el CSS)
npm run construir    # recalcula iconos + compila assets/css/app.css
```

Para probar en local sirve la carpeta padre con cualquier servidor estático y abre `/mi-tienda/`
(la página 404 asume que el sitio vive en `/mi-tienda/`).

Carga del catálogo de ejemplo: `MT_TOKEN=<token de sesión de un dueño> node herramientas/sembrar.mjs`.

## Dominio propio

Si se usa un dominio propio, cambia el `<base href="/mi-tienda/">` de `404.html` por `/`.
