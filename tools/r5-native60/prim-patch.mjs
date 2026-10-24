// Claude 2026-10-21 (alta100 opción 2): preparePrimitive (Ie) se recordaba solo dentro de una foto; ahora entre fotos.
// Clave = la misma de siempre (tipo, cantidad, origen y rango de índices, registros). Si los índices salen de memoria,
// se reutiliza solo cuando resources.read devuelve el MISMO búfer (o sea, el hash del rango no cambió).
// Como los índices viajan transferidos al hilo GPU, cada foto recibe una copia (memcpy) y el original queda en caché.
// Uso: node tools/r5-native60/prim-patch.mjs <carpeta-demo>
import fs from 'node:fs';
const [dir] = process.argv.slice(2);
for (const name of ['scene', 'colas', 'render']) {
  const file = `${dir}/r5snap-native60-${name}.js`;
  let js = fs.readFileSync(file, 'utf8');
  const once = (from, to) => { if (js.split(from).length !== 2) throw Error(name + ': ancla no única: ' + from); js = js.replace(from, to); };
  if (js.includes('__prim')) throw Error('Ya parcheado: ' + file);
  // El nombre minificado de preparePrimitive cambia entre paquetes (Ie/ke): se toma del propio ancla.
  const F = (js.match(/:void 0;y=([A-Za-z_$]+)\(e,x\),a\.memo\?\.primitives\.set\(d,y\)\}/) || [])[1];
  if (!F) throw Error(name + ': no encontré preparePrimitive');
  once('if(!y){let x=e.indexSource===1?{phys:e.indexPhys,data:a.read(e.indexPhys,e.indexBytes)}:void 0;y='+F+'(e,x),a.memo?.primitives.set(d,y)}',
    'if(!y){let x=e.indexSource===1?{phys:e.indexPhys,data:a.read(e.indexPhys,e.indexBytes)}:void 0,P=globalThis.__prim||(globalThis.__prim=new Map),z=P.get(d);' +
    'if(!z||z.data!==x?.data){z={data:x?.data,y:'+F+'(e,x)};if(P.size>8e3)P.clear();P.set(d,z)}else globalThis.__primReusos=(globalThis.__primReusos|0)+1;' +
    'y={...z.y,indices:z.y.indices.slice()},a.memo?.primitives.set(d,y)}');
  fs.writeFileSync(file, js);
}
console.log(JSON.stringify({dir, cambio: 'primitivas entre fotos'}));
