// Modo guitarra (Claude 2026-10-14): GH3 recibe el mando como guitarra (?padtype=guitar → sub_type 0x07). Así la
// regla es la de Guitar Hero: mantener el color + rasguear, también en notas repetidas. Cambios en gh3-input.js:
// - teclado y táctil en canción usan los trastes de guitarra (A B Y X LB) en vez del esquema de mando (LT LB RB RT A);
// - mando PS4/Xbox (no guitarra) en canción: misma disposición de antes (L2 L1 R1 R2 Cruz) traducida a guitarra, y
//   apretar un color rasguea solo (20 ms después, así un acorde entra junto) = "apretar es tocar" como antes.
// Uso: node tools/guitar7/patch-input.mjs <gh3-input.js original> <salida>
import fs from 'node:fs';
const [src, dst] = process.argv.slice(2); let s = fs.readFileSync(src, 'utf8');
const rep = (a, b) => { if (s.split(a).length !== 2) throw Error('ancla: ' + a); s = s.replace(a, b); };
rep('function p(){', 'const GT=new URLSearchParams(location.search).get("padtype")==="guitar",AS={prev:0,at:0,until:0};function padGuitar(r){const b=r.b,tr=r.tr;r.b=b&~(c.a|c.b|c.x|c.y|c.lb|c.rb)|((tr&255)>128?c.a:0)|(b&c.lb?c.b:0)|(b&c.rb?c.y:0)|(tr>>8>128?c.x:0)|(b&c.a?c.lb:0);r.tr=0;const F=c.a|c.b|c.y|c.x|c.lb,f5=r.b&F,now=performance.now(),nw=f5&~AS.prev;AS.prev=f5;if(nw)AS.at=now+20;if(AS.at&&now>=AS.at)AS.at=0,AS.until=now+40,AS.tap=1;if(now<AS.until)r.b|=c.down;}function p(){');
rep('const a=!!(l.songMode&&l.songMode());', 'const a0=!!(l.songMode&&l.songMode()),a=a0&&!GT;');
rep('const r=z(),v=', 'const r=z();GT&&a0&&!/guitar/i.test(n.pad||"")?padGuitar(r):(AS.prev=0);const v=');
rep('n.frets=a?((r.tr&255)>128?1:0)|(m&c.lb?2:0)|(m&c.rb?4:0)|(r.tr>>8>128?8:0)|(m&c.a?16:0):0',
    'n.frets=a?((r.tr&255)>128?1:0)|(m&c.lb?2:0)|(m&c.rb?4:0)|(r.tr>>8>128?8:0)|(m&c.a?16:0):GT&&a0?(m&c.a?1:0)|(m&c.b?2:0)|(m&c.y?4:0)|(m&c.x?8:0)|(m&c.lb?16:0):0');
fs.writeFileSync(dst, s);
