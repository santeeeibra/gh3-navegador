// Claude 2026-10-17: index.html de la copia interruptores = sinsombra + sin sombras ACTIVO por defecto (?sinsombra=0 apaga)
// + script de interruptores del juego.
import fs from 'node:fs';
const [src, dst] = process.argv.slice(2);
const rep = (s, a, b) => { if (s.split(a).length !== 2) throw Error('Ancla no única: ' + a); return s.replace(a, b); };
let h = fs.readFileSync(src, 'utf8');
h = rep(h, "q.get('sinsombra')==='1'", "q.get('sinsombra')!=='0'");
h = rep(h, '<script src="c1-strum-page.js"></script>', '<script src="c1-strum-page.js"></script>\n<script src="gh3-interruptores.js"></script>');
fs.writeFileSync(dst, h);
