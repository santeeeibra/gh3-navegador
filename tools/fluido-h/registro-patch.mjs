// Claude 2026-10-23 (fluido H, medición): registro de aperturas y faltas del lector de archivos del juego.
// Parchea r5snap-local-fs.js de --dest (copia aislada) para que el hilo del juego avise a la página:
//   hOpen {path}            primera lectura de cada archivo
//   hMiss {path,i,bytes,ms} parte que no estaba en memoria y se bajó con pedido SINCRÓNICO (el juego espera esos ms)
//   hRead {path,ms}         lectura que tardó más de 4 ms en total (incluye bajada + verificación)
// Solo avisos (postMessage); no cambia qué se lee ni cuándo. Uso: node tools/fluido-h/registro-patch.mjs --dest <demo>
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2), i = args.indexOf('--dest');
if (i < 0) throw Error('falta --dest');
const file = path.join(args[i + 1], 'r5snap-local-fs.js');
let s = fs.readFileSync(file, 'utf8');
if (s.includes('hMiss')) { console.log('ya parcheado'); process.exit(0); }
const rep = (a, b) => { if (s.split(a).length !== 2) throw Error('ancla no única: ' + a); s = s.replace(a, b); };
rep('c=(e,i)=>{const l=new XMLHttpRequest;', 'c=(e,i)=>{const t0=performance.now(),l=new XMLHttpRequest;');
rep('return new Uint8Array(l.response)}', 'return self.postMessage({type:"hMiss",path:e.path,i,bytes:l.response.byteLength,ms:Math.round(performance.now()-t0)}),new Uint8Array(l.response)}');
rep('try{return h(e.node.contents,...i)}', 'const hp=e.node.contents.path,t1=performance.now();(globalThis.__hSeen||=new Set).has(hp)||(globalThis.__hSeen.add(hp),self.postMessage({type:"hOpen",path:hp}));try{const r=h(e.node.contents,...i),dt=performance.now()-t1;dt>4&&self.postMessage({type:"hRead",path:hp,ms:Math.round(dt)});return r}');
fs.writeFileSync(file, s);
console.log(JSON.stringify({parcheado: file}));
