// Cómo ve el cliente cada estado del pedido (el panel usa nombres internos).
import { esc } from '../util.js';

export const ESTADOS_CLIENTE = {
  nuevo: ['chip-azul', 'Recibido'],
  contactado: ['chip-azul', 'En atención'],
  negociacion: ['chip-ambar', 'Coordinando pago'],
  confirmado: ['chip-verde', 'Confirmado'],
  enviado: ['chip-violeta', 'En camino'],
  entregado: ['chip-verde', 'Entregado'],
  cancelado: ['chip-rojo', 'Cancelado'],
};

export const chipEstado = (estado) => {
  const [clase, texto] = ESTADOS_CLIENTE[estado] || ['chip-gris', estado || 'Pendiente'];
  return `<span class="${clase}">${esc(texto)}</span>`;
};

export const LINEA_TIEMPO = [
  { titulo: 'Pedido recibido', texto: 'Quedó registrado con tu número de pedido.', icono: 'receipt_long', estados: ['nuevo', 'contactado', 'negociacion', 'confirmado', 'enviado', 'entregado'] },
  { titulo: 'Confirmación por WhatsApp', texto: 'Un asesor confirma existencias y te comparte los datos de pago.', icono: 'chat', estados: ['contactado', 'negociacion', 'confirmado', 'enviado', 'entregado'] },
  { titulo: 'Pago confirmado', texto: 'Preparamos tu paquete para el despacho.', icono: 'payments', estados: ['confirmado', 'enviado', 'entregado'] },
  { titulo: 'En camino', texto: 'Te enviamos la guía de rastreo por WhatsApp.', icono: 'local_shipping', estados: ['enviado', 'entregado'] },
  { titulo: 'Entregado', texto: '¡Disfruta tu compra!', icono: 'home', estados: ['entregado'] },
];

/** Último paso alcanzado de la línea de tiempo (-1 si cancelado o desconocido). */
export const pasoDe = (estado) => LINEA_TIEMPO.reduce((ultimo, x, i) => (x.estados.includes(estado) ? i : ultimo), -1);
