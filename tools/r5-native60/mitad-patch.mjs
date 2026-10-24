// Claude 2026-10-21 (alta100 opción 1): el lector native60 (hilo CP) prepara solo 1 de cada N+1 swaps con dibujos.
// Tras enviar un snapshot se saltean los N swaps siguientes ANTES de leer memoria del juego; el hilo GPU
// (interpolación «suave») rellena los cuadros intermedios. Parchea los 3 consumidores minificados de una copia.
// Uso: node tools/r5-native60/mitad-patch.mjs <carpeta-demo> [N=1]
import fs from 'node:fs';
const [dir, n = '1'] = process.argv.slice(2);
for (const name of ['scene', 'colas', 'render']) {
  const file = `${dir}/r5snap-native60-${name}.js`;
  let js = fs.readFileSync(file, 'utf8');
  const once = (from, to) => { if (js.split(from).length !== 2) throw Error(name + ': ancla no única: ' + from); js = js.replace(from, to); };
  if (js.includes('__mitad')) throw Error('Ya parcheado: ' + file);
  // Puerta: antes de Atomics.compareExchange (no se lee memoria del juego al saltear).
  once('if(!Ge(m,Le,_)){', `if(!Ge(m,Le,_)||(globalThis.__mitad>0&&globalThis.__mitad--)){`);
  // Snapshot enviado: armar el salteo.
  once('Atomics.add(q,M.SNAPSHOTS,1)', `Atomics.add(q,M.SNAPSHOTS,1),globalThis.__mitad=${Number(n)}`);
  fs.writeFileSync(file, js);
}
console.log(JSON.stringify({dir, saltea: Number(n)}));
