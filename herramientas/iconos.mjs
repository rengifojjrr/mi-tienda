// Calcula qué iconos de Material Symbols usa el sitio y actualiza el enlace de la fuente
// en todas las páginas (<link data-iconos ...>) para descargar sólo esos iconos.
// Busca cualquier palabra entre comillas o dentro de un <span> de icono y se queda con las
// que existen en la lista oficial (herramientas/material-symbols.txt).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const oficiales = new Set(fs.readFileSync(path.join(raiz, 'herramientas/material-symbols.txt'), 'utf8').split('\n').filter(Boolean));
const listar = (dir, ext) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return ['node_modules', '.git', 'docs', '.claude'].includes(e.name) ? [] : listar(p, ext);
  return ext.some((x) => e.name.endsWith(x)) ? [p] : [];
}) : []);

const paginas = listar(raiz, ['.html']);
const fuentes = [...paginas, ...listar(path.join(raiz, 'assets/js'), ['.js']), path.join(raiz, 'supabase/semilla.json')];
// Palabras que coinciden con un icono pero en el código son otra cosa (evita descargar iconos de más)
const ignorar = new Set(['color', 'title', 'label', 'list', 'start', 'end', 'center', 'top', 'bottom', 'left', 'right', 'none', 'block', 'flex', 'grid', 'table', 'input', 'link', 'image', 'code', 'html', 'css', 'javascript', 'filter', 'sort', 'key', 'width', 'height', 'width_normal', 'error', '2d', 'chips', 'function', 'radio', 'storage', 'tab']);
const nombres = new Set(['error']);

for (const f of fuentes) {
  const t = fs.readFileSync(f, 'utf8');
  for (const m of t.matchAll(/material-symbols-outlined[^>]*>\s*([a-z0-9_]+)\s*</g)) nombres.add(m[1]);
  for (const m of t.matchAll(/['"`]([a-z0-9_]{2,40})['"`]/g)) if (oficiales.has(m[1]) && !ignorar.has(m[1])) nombres.add(m[1]);
  // Llamadas explícitas a ico(...) y propiedades icono: siempre cuentan, aunque la palabra esté en `ignorar`
  for (const m of t.matchAll(/ico\(([^)]*)\)/g)) for (const q of m[1].matchAll(/['"`]([a-z0-9_]{2,40})['"`]/g)) nombres.add(q[1]);
  for (const m of t.matchAll(/icono["']?\s*:\s*["']([a-z0-9_]+)["']/g)) nombres.add(m[1]);
  for (const m of t.matchAll(/\[\s*'([a-z0-9_]+)'\s*,\s*'(?:bg|text)-/g)) nombres.add(m[1]);
}
const lista = [...nombres].filter((n) => oficiales.has(n)).sort();
const url = `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0..1,0&icon_names=${lista.join(',')}&display=block`;
let cambiadas = 0;
for (const f of paginas) {
  const t = fs.readFileSync(f, 'utf8');
  const n = t.replace(/<link data-iconos href="[^"]*"/, `<link data-iconos href="${url.replace(/&/g, '&amp;')}"`);
  if (n !== t) { fs.writeFileSync(f, n); cambiadas++; }
}
fs.writeFileSync(path.join(raiz, 'herramientas/iconos.txt'), `${lista.join('\n')}\n`);
console.log(`${lista.length} iconos · ${cambiadas} páginas actualizadas · URL ${url.length} caracteres`);
