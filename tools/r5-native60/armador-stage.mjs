// Claude 2026-10-21 (alta100 opción 3): el armado de la foto sale del hilo CP.
// En el hilo CP queda un «puente» chico: en cada swap, si el armador está libre, le pasa la lista de dibujos ya copiada
// (`bytes`, la misma copia que hacía gh3-web.js) y vuelve enseguida; si está ocupado, el swap se saltea (queda la foto anterior).
// El armador (worker propio) corre el consumidor native60 original leyendo la memoria del juego compartida (SharedArrayBuffer).
// OJO: lee vértices/texturas unos ms después del swap; el juego puede haber escrito el cuadro siguiente (posibles detalles mezclados).
// Sin hash compilado (el wasm vive en el hilo CP): el consumidor usa su camino de comparar/copiar.
// Los mensajes del armador a la página (callHandler) pasan por el puente. Uso: node tools/r5-native60/armador-stage.mjs <copia>
import fs from 'node:fs';
const [dir] = process.argv.slice(2);
fs.writeFileSync(`${dir}/r5snap-armador.js`, `// Claude 2026-10-21 (alta100 op3): worker armador, ver tools/r5-native60/armador-stage.mjs
let mem=null,base=0,busy=null;
const api={readPhysical(p,n){p=(p>>>0)&536870911;n=n>>>0;if(p+n>536870912)throw new RangeError('r5live: rango');return new Uint8Array(mem,base+p,n);},physBase:0};
self.onmessage=({data:m})=>{
 if(m.type==='init'){importScripts(m.consumer);busy=new Int32Array(m.busy);return;}
 if(m.type!=='swap')return;
 mem=m.mem;base=m.base;api.physBase=base;globalThis.__saltados=m.saltados|0;
 try{globalThis.__r5liveConsumer(m.bytes,m.info,api);}catch(e){self.postMessage({cmd:'armadorError',error:String(e&&e.stack||e)});}
 finally{Atomics.store(busy,0,0);}
};
`);
for (const name of ['scene', 'colas', 'render']) {
  const file = `${dir}/r5snap-native60-${name}.js`, arm = `r5snap-native60-${name}-arm.js`;
  const js = fs.readFileSync(file, 'utf8');
  if (js.startsWith('// Claude 2026-10-21 (alta100 op3) puente')) throw Error('Ya armado: ' + file);
  fs.writeFileSync(`${dir}/${arm}`, js);
  fs.writeFileSync(file, `// Claude 2026-10-21 (alta100 op3) puente en el hilo CP; el consumidor real corre en r5snap-armador.js (${arm}).
(()=>{const busySab=new SharedArrayBuffer(4),busy=new Int32Array(busySab),st={swaps:0,enviados:0,ocupado:0};let w=null,saltados=0;
const arranque=()=>{w=new Worker(new URL('r5snap-armador.js',location.href),{name:'gh3-armador'});
 w.onmessage=({data:m})=>{if(m&&m.cmd==='armadorError'){console.error('[armador] '+m.error);return;}
  const t=[];if(m&&m.handler==='r5NativePort'&&m.args&&m.args[0])t.push(m.args[0]);
  if(m&&m.handler==='r5SongReport'&&m.args&&m.args[0])m.args[0].puente=st;self.postMessage(m,t);};
 w.onerror=e=>console.error('[armador] '+e.message);
 w.postMessage({type:'init',consumer:new URL('${arm}',location.href).href,busy:busySab});};
globalThis.__r5liveConsumer=(bytes,info,api)=>{st.swaps++;if(!w)arranque();
 if(Atomics.compareExchange(busy,0,0,1)!==0){st.ocupado++;saltados++;return;}
 const mem=api.readPhysical(0,1).buffer;st.enviados++;
 w.postMessage({type:'swap',bytes,info,mem,base:api.physBase,saltados},[bytes.buffer]);saltados=0;};})();
`);
}
// Con el armador aparte ya no hace falta saltear swaps (op1): el puente solo saltea si el armador está ocupado.
for (const name of ['scene', 'colas', 'render']) {
  const f = `${dir}/r5snap-native60-${name}-arm.js`; let js = fs.readFileSync(f, 'utf8');
  if (js.split('globalThis.__mitad=1').length !== 2) throw Error('ancla mitad: ' + f);
  js = js.replace('globalThis.__mitad=1', 'globalThis.__mitad=0');
  // El contador de swaps del tablero (lo usa «juego %») tiene que incluir los que el puente salteó.
  if (js.split('Atomics.add(q,M.SWAPS,1)').length !== 2) throw Error('ancla SWAPS: ' + f);
  fs.writeFileSync(f, js.replace('Atomics.add(q,M.SWAPS,1)', 'Atomics.add(q,M.SWAPS,1+(globalThis.__saltados|0)),globalThis.__saltados=0'));
}
console.log(JSON.stringify({dir, armador: true}));
