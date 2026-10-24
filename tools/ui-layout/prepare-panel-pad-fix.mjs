// Copia aislada: conserva el binario publicado y corrige dos errores de página.
import fs from 'node:fs';
import path from 'node:path';
const base = 'artifacts/d1-wasm/c1strum-pub/demo';
const dst = 'artifacts/panel-pad-fix/demo';
fs.mkdirSync(dst, {recursive: true});
for (const entry of fs.readdirSync(base, {withFileTypes: true})) {
  if (!entry.isFile()) continue;
  const target = path.join(dst, entry.name);
  if (!fs.existsSync(target)) fs.copyFileSync(path.join(base, entry.name), target);
}
const replace = (s, a, b) => {
  if (s.split(a).length !== 2) throw Error('Ancla no única: ' + a);
  return s.replace(a, b);
};
// gh3-notas se encarga de la UI; el registro sigue disponible sin recrear el bloque.
let diag = fs.readFileSync(base + '/gh3-movil-ctl.js', 'utf8');
diag = replace(diag, "    const panel = document.getElementById('gh3Panel'); if (!panel) return;",
  "    if (window.gh3Notas) return; // La barra Notas reemplaza este panel.\n    const panel = document.getElementById('gh3Panel'); if (!panel) return;");
fs.writeFileSync(dst + '/gh3-movil-ctl.js', diag);
// La espera para acordes sigue siendo 20 ms, pero su hora es la del PRIMER botón.
// Otra lectura de Gamepad (incluso soltar el botón) no debe rejuvenecer ese toque.
let input = fs.readFileSync(base + '/gh3-input.js', 'utf8');
input = replace(input, 'if(nw)AS.at=now+20;',
  'if(nw&&!AS.at){AS.at=now+20;const ts=l.padTs;AS.eventAt=performance.timeOrigin+(Number.isFinite(ts)&&ts>0&&ts<=now+1&&ts>=now-50?ts:now);}');
input = replace(input, 'AS.until=now+40,AS.tap=1;', 'AS.until=now+40,AS.tap=1,AS.emitAt=AS.eventAt;');
input = replace(input, '(AS.prev=0);const v=', '(AS.prev=0,AS.at=0,AS.until=0,AS.emitAt=null);const v=');
input = replace(input, 'window.syncPressWrite?.(m,r.tr,S,Atomics.load(f,0)+1);',
  'window.syncPressWrite?.(m,r.tr,S,Atomics.load(f,0)+1,AS.emitAt??inputAt);');
// Teclado: pasar la hora desde el MISMO callback que escribe el mando. La marca
// capturada por otro listener puede limpiarse en un checkpoint de microtareas
// antes de llegar aquí; no depender de esa marca global transitoria.
input = replace(input, 'function p(){J();', 'function p(eventTs){const nowAt=performance.timeOrigin+performance.now(),rawAt=Number.isFinite(eventTs)&&eventTs>0?(eventTs>1e12?eventTs:performance.timeOrigin+eventTs):NaN,inputAt=rawAt<=nowAt+1&&rawAt>=nowAt-5000?rawAt:undefined;AS.emitAt=null;J();');
input = replace(input, 'g.add(e.code),p()', 'g.add(e.code),p(e.timeStamp)');
input = replace(input, 'g.delete(e.code)&&(e.preventDefault(),p())', 'g.delete(e.code)&&(e.preventDefault(),p(e.timeStamp))');
fs.writeFileSync(dst + '/gh3-input.js', input);
console.log(dst);
