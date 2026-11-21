# Diseño · MI TIENDA

## Intención
Convertir el export de Stitch (8 pantallas: 4 de tienda y 4 de panel) en un producto que funcione de
verdad: lo que se edita en el panel aparece en cualquier celular, los pedidos llegan por WhatsApp y
quedan registrados, y el dashboard muestra datos reales. Completar las pantallas a las que apuntaban
los menús del diseño pero que no existían.

## Metas
- Fidelidad visual al diseño de Stitch (mismos tokens, tipografías, componentes y textos base).
- Pedido por WhatsApp sin fricción: sin cuentas ni contraseñas para el cliente.
- Panel con login, roles y permisos, inventario con kárdex, CRM y estadísticas.
- Publicación gratuita (GitHub Pages) y datos en el Supabase existente del usuario.

## No metas
- Pagos en línea (el pago se coordina por WhatsApp, como en el diseño).
- Integración con la API de WhatsApp Business (se ofrece exportar el catálogo en formato de Meta).

## Anti-metas
- Mostrar reseñas o cifras inventadas como si fueran reales: las reseñas de ejemplo se rotulan y las cifras
  del dashboard salen de la base de datos.
- Tocar datos, usuarios o disparadores de las otras apps del proyecto Supabase compartido.

## Enfoques considerados
1. **Supabase compartido con prefijo `mt_`** (elegido por el usuario): datos reales y compartidos, costo $0.
2. Sólo en el navegador (localStorage): cero backend, pero lo editado no se ve en otros dispositivos.
3. Proyecto Supabase nuevo: más aislado, pero el plan gratuito ya tenía sus 2 proyectos activos.

## Decisiones
- **Login propio del panel** (`mt_admins` + `mt_sesiones`, contraseña bcrypt, token en la cabecera
  `x-mt-token`) en vez de Supabase Auth: los disparadores de las otras apps convertirían a cada usuario nuevo
  en usuario de esas apps.
- **RLS en todas las tablas** con funciones `mt_es_admin()` / `mt_puede(área)` que leen la cabecera.
- **Borrar fotos** pasa por la función de borde `mt-fotos`: una política de almacenamiento de otra app
  impide borrar desde el navegador con el rol anónimo.
- **Stock**: cualquier cambio usa `mt_ajustar_stock` (kárdex). Confirmar pedido descuenta, cancelar devuelve.
- **Estadísticas** anónimas (`mt_eventos`, id de visitante aleatorio, sin IP) con límites anti-abuso.
- Front sin framework, Tailwind compilado, iconos Material Symbols subconjuntados.

## Pantallas nuevas (no venían en Stitch)
Tienda: Categorías, Soporte (con rastreo), Mi cuenta, Pedido enviado, Garantía & Legal, 404.
Panel: Login, Categorías, Pedidos & Chats, Clientes CRM, Banners & Promos, Galería, Contenido,
Configuración, Usuarios & Permisos, Registro de actividad.
