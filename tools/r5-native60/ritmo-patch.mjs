// Claude 2026-10-21 (paso 1 fluidez alta): parchea el r5snap-native60-gpu.js minificado de una copia.
// Siempre agrega la medida del ritmo visible (temporal.ritmo): por cuadro presentado compara cuánto avanzó
// la autopista (tiempo de juego mostrado) contra cuánto pasó de reloj real. Un salto atrás o un error grande = tirón.
// `adelanto` = cuánto se adelanta lo mostrado respecto de lo que mostraba el original (sincronía con la música).
// --fijo: el snapshot nuevo se lleva al presente (fluido, pero adelanta la autopista: Santi notó desfase con la música).
// --suave: la imagen sigue al reloj real y se acerca de a poco (15 % por cuadro) a lo que mostraba el original;
//          nunca retrocede. Misma sincronía promedio que el original, sin el tirón.
// Uso: node tools/r5-native60/ritmo-patch.mjs <carpeta-demo> [--fijo|--suave]
import fs from 'node:fs';
const [dir, ...flags] = process.argv.slice(2), file = dir + '/r5snap-native60-gpu.js';
let js = fs.readFileSync(file, 'utf8');
const once = (from, to) => { if (js.split(from).length !== 2) throw Error('Ancla no única: ' + from); js = js.replace(from, to); };
if (js.includes('__ritmo')) throw Error('Ya parcheado');
// Medida: después de cada render (ft() = releaseUploaded). he = temporal, t = delta mostrado en s, e = snapshot nuevo, s = edad, _ = state.
once('ft();let l=je();',
 'ft();{const R=self.__ritmo||(self.__ritmo={w:0,s:0,n:0,atras:0,err:[],ad:[]}),w=performance.now(),sh=(he.timeMs??NaN)+t*1e3;' +
 'if(R.w&&Number.isFinite(sh)&&Number.isFinite(R.s)){const dw=w-R.w,ds=sh-R.s;R.n++;if(ds<-.5)R.atras++;R.err.push(Math.abs(ds-dw));if(R.err.length>600)R.err.shift();' +
 'R.ad.push(sh-(he.timeMs+(e?0:Math.max(0,Math.min(100,s)))));if(R.ad.length>600)R.ad.shift();' +
 'if(!(R.n%30)){const q=[...R.err].sort((a,b)=>a-b),p=f=>Math.round(q[Math.min(q.length-1,Math.floor(q.length*f))]*10)/10;' +
 '_.ritmo={cuadros:R.n,atras:R.atras,errP50:p(.5),errP95:p(.95),errMax:p(1),adelanto:Math.round(R.ad.reduce((a,b)=>a+b,0)/R.ad.length*10)/10};}}' +
 'R.w=w;R.s=sh;}let l=je();');
const orig = 'let t=e?0:Math.max(0,Math.min(100,s))/1e3';
if (flags.includes('--fijo')) once(orig, 'let t=Math.max(0,Math.min(100,s))/1e3');
// La línea original sigue con «,n=...»: el reemplazo tiene que ser una sola expresión.
if (flags.includes('--suave')) once(orig, 'let t=(()=>{' + orig + ';{const V=self.__suave||(self.__suave={w:0,v:NaN}),w=performance.now(),T=he.timeMs;' +
 'if(Number.isFinite(T)){const tg=T+t*1e3,pr=V.w&&Number.isFinite(V.v)?V.v+(w-V.w):tg;let nv=pr+(tg-pr)*.15;' +
 'if(Number.isFinite(V.v)&&nv<V.v)nv=V.v;if(Math.abs(tg-pr)>150)nv=tg;t=Math.max(0,Math.min(100,nv-T))/1e3;V.v=T+t*1e3;V.w=w}}return t})()');
fs.writeFileSync(file, js);
console.log(JSON.stringify({file, modo: flags.find(f => f === '--fijo' || f === '--suave') || 'solo medida'}));
