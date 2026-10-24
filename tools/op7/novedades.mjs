// Claude 2026-10-22 (alta100 op7): novedades y cartel de versión de op7 a partir de los PUBLICADOS
// (artifacts/pages-gh3/site/gh3, versión «guitarra y mandos»), sin tocar la carpeta del sitio.
// Escribe gh3-novedades.js y gh3-version.js en --dest (alta100/op7). Respeta los saltos de línea del original.
// Uso: node tools/op7/novedades.mjs [--sitio dir] [--dest dir]
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const sitio = opt('sitio', 'artifacts/pages-gh3/site/gh3'), dest = opt('dest', 'artifacts/d1-wasm/alta100/op7');
const rep = (s, a, b) => { if (s.split(a).length !== 2) throw Error('Ancla no única: ' + a.slice(0, 70)); return s.replace(a, b); };
const leer = n => { const raw = fs.readFileSync(path.join(sitio, n), 'utf8'); return {crlf: raw.includes('\r\n'), t: raw.replaceAll('\r\n', '\n')}; };
const escribir = (n, {crlf, t}) => { const to = path.join(dest, n); if (fs.existsSync(to)) fs.unlinkSync(to); fs.writeFileSync(to, crlf ? t.replaceAll('\n', '\r\n') : t); };

const nov = leer('gh3-novedades.js');
let t = nov.t;
t = rep(t, "const VERSION = '2026-10-22-guitarra-mandos';", "const VERSION = '2026-10-22-alto-banda'; // op7: Alto más rápido + banda visible + notas atadas a la música");
// Ícono nuevo (persona + púa), mismo estilo de línea que los demás.
t = rep(t, "    reloj: '<circle", "    banda: '<circle cx=\"9\" cy=\"7\" r=\"3\"/><path d=\"M3 20v-1a6 6 0 0 1 12 0v1\"/><path d=\"M16 4l4 4M18 6l-4 6\"/>',\n    reloj: '<circle");
t = rep(t, '  const NOVEDADES = [\n', '  const NOVEDADES = [\n' +
  "    ['velocidad', '«Alto» casi al doble de rápido', 'En calidad «Alto» el juego anda casi al doble de rápido que antes, y en «Liviana» también mejoró un poco.'],\n" +
  "    ['banda', 'Se ve la banda en «Alto»', 'Ahora se ven los músicos completos: antes en «Alto» aparecían solo el pelo y las guitarras flotando.'],\n" +
  "    ['reloj', 'Notas junto con la música', 'Volvió la autopista suave a 60 cuadros, atada al sonido que escuchás: las notas no se separan de la música aunque la compu vaya justa.'],\n");
t = rep(t, "    ['velocidad', 'Más fluido', 'El juego anda más rápido en las tres calidades. En «Alto» la diferencia es grande.'],\n", '');
t = rep(t, "'Se vienen los modelos bien visibles (escenarios y personajes), el modo historia completo", "'Se viene el escenario más fluido en «Alto», el modo historia completo");
t = rep(t, 'Versión GUITARRA Y MANDOS · 22/10', 'Versión ALTO Y BANDA · 22/10');
escribir('gh3-novedades.js', {...nov, t});

const ver = leer('gh3-version.js');
escribir('gh3-version.js', {...ver, t: rep(ver.t, "const V = 'GUITARRA Y MANDOS 22/10'", "const V = 'ALTO Y BANDA 22/10'")});
console.log(JSON.stringify({dest, crlf: nov.crlf}));
