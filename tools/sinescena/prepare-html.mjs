// Claude 2026-10-17: index.html de la copia sinescena = el de c1strum-pub + parámetro r5livevs (lista de VS que dibuja el
// lector «render» de Codex; el productor R5L no arma los demás draws). ?sinescena=0 apaga, =1 fuerza; por defecto activo
// sólo con calidad «muy» (consumidor *-render.js). Listas copiadas de r5snap-native60-render.js (he) y r5snap-song-render.js (fe).
import fs from 'node:fs';
const [src, dst] = process.argv.slice(2);
let h = fs.readFileSync(src, 'utf8');
const a = "r5inflight:g&&g.inflight&&g.inflight!==2?String(g.inflight):null};";
if (h.split(a).length !== 2) throw Error('Ancla no única');
const pc = 'CAC1FD2246E486B4,57F6448DAC5BEB74,B43CF443883B8351,87D4CAE67E72C501,582ABCF5FF619A55,80708BD1B82638B0,94B97981B512BDA2,19815E13AC0DCC92';
const extra = '27643FEB20B8CBBD,C6F0B6F9BA5A2B12,10CA3B730086027C,035C1CB9583C0C7E';
h = h.replace(a, a.slice(0, -2) + `,r5livevs:(()=>{/* sinescena (Claude 2026-10-17) */const sx=q.get('sinescena');if(sx==='0'||!(sx==='1'||qual==='muy')||qual==='completo'||qual==='liviano')return null;return hw==='r5snap-native60-'?'${pc},${extra}':'${pc}';})()};`);
const w = "'r5lite', 'r5inflight',";
if (h.split(w).length !== 2) throw Error('Ancla worker no única');
h = h.replace(w, "'r5lite', 'r5livevs', 'r5inflight',");  // la página pasa r5livevs al worker del juego
fs.writeFileSync(dst, h);
