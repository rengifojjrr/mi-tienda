// Página 404 (GitHub Pages la sirve para cualquier dirección que no exista).
import { $, ico } from '../util.js';
import { ruta } from '../api.js';
import { iniciarTienda } from './base.js';

await iniciarTienda({ pagina: '', subtitulo: 'Página no encontrada', registrarVisita: false });
$('#contenido').innerHTML = `<div class="max-w-md mx-auto py-16 text-center flex flex-col items-center gap-3">
  <div class="w-20 h-20 rounded-full bg-surface-container-low flex items-center justify-center">${ico('travel_explore', 'text-[40px] text-primary')}</div>
  <p class="font-label-md text-label-md text-primary tracking-widest">ERROR 404</p>
  <h1 class="font-headline-md text-headline-md text-on-surface">No encontramos esta página</h1>
  <p class="font-body-md text-body-md text-on-surface-variant">Puede que el enlace esté incompleto o que el producto ya no exista. Sigue explorando la tienda:</p>
  <div class="flex flex-col sm:flex-row gap-2 mt-2">
    <a href="${ruta('index.html')}" class="btn-primario h-12">${ico('storefront', 'text-[18px]')} Ir al inicio</a>
    <button type="button" data-abrir-buscador class="btn-secundario h-12">${ico('search', 'text-[18px]')} Buscar productos</button>
  </div></div>`;
