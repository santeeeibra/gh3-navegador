// Claude 2026-10-22 (gpuval): un error de validación de WebGPU ya no apaga la imagen para siempre.
// Causa (COMPROBADO en estadísticas): 64 de 86 intentos contra Tom Morello (bosstom) tuvieron «[object GPUValidationError]»;
// el trabajador GPU trataba ese error como «GPU perdida» (be/stop) y el consumidor descartaba todas las escenas (fatal).
// También explica la imagen clavada al empezar la canción (gpuPerdida=true en las 3 corridas clavadas guardadas).
// Cambios en r5snap-native60-gpu.js (lo usan alta, liviana y muy en PC):
//  1. uncapturederror: se cuenta y se guarda el mensaje real (stats.validacion) en vez de cortar todo. La pérdida real
//     del dispositivo (device.lost) sigue siendo fatal.
//  2. Los bind groups de cada dibujo se crean dentro de un error scope; si fallan, ese dibujo se marca y se saltea
//     (el resto del cuadro se dibuja). Así un solo dibujo raro (p. ej. un efecto de la batalla) no deja la pantalla negra.
// Cambio en gh3-analytics.js: manda a estadísticas el mensaje real (runtime_error, error_name GPUValidation,
// severity recovered), una vez por mensaje distinto, con el sombreador del dibujo en «cause».
// Uso: node tools/gpuval/validacion-patch.mjs <copia>
import fs from 'node:fs';
const [dir] = process.argv.slice(2);
if (!dir) throw Error('Uso: node tools/gpuval/validacion-patch.mjs <copia>');
const swap = (js, from, to, file) => { if (js.split(from).length !== 2) throw Error('ancla (' + js.split(from).length + '): ' + file + ': ' + from.slice(0, 80)); return js.replace(from, to); };

const gpu = `${dir}/r5snap-native60-gpu.js`;
let js = fs.readFileSync(gpu, 'utf8');
if (js.includes('[gpuval]')) throw Error('Ya parcheado: ' + gpu);
// Registro de errores de validación: contador, último mensaje, hasta 5 distintos, dibujos salteados.
js = `/* Claude 2026-10-22 gpuval: ver tools/gpuval/validacion-patch.mjs */const __V={n:0,ultimo:null,mensajes:[],malos:0,dibujosMalos:[]};
self.__valErr=(e,donde)=>{__V.n++;const m=String(e&&e.message||e).slice(0,400);__V.ultimo=m;if(donde)__V.donde=String(donde).slice(0,120);
 if(__V.mensajes.length<5&&!__V.mensajes.includes(m))__V.mensajes.push(m);if(__V.n<=3)console.warn('[gpuval] '+(donde?donde+': ':'')+m);};
` + js;
js = swap(js, 'ge.addEventListener("uncapturederror",n=>be(n.error))', 'ge.addEventListener("uncapturederror",n=>{_.validacion=__V;self.__valErr(n.error)}),_.validacion=__V', gpu);
// Bind groups dentro de un error scope; al rearmarlos se borra la marca.
js = swap(js, 'return w.groups=Array.from({length:Math.max(...h.keys())+1},(y,z)=>e.createBindGroup({layout:g.getBindGroupLayout(z),entries:h.get(z)||[]})),w.groupKey=f,w}',
  'e.pushErrorScope("validation");w.groups=Array.from({length:Math.max(...h.keys())+1},(y,z)=>e.createBindGroup({layout:g.getBindGroupLayout(z),entries:h.get(z)||[]})),w.groupKey=f,w.__malo=0;const __w=w,__f=f;e.popErrorScope().then(er=>{if(er&&__w.groupKey===__f){__w.__malo=1;const V=self.__valMalos||(self.__valMalos={n:0});V.n++;self.__valErr(er,g.label)}}).catch(()=>{});return w}', gpu);
// Saltear los dibujos marcados.
js = swap(js, 'for(let{input:j,p:de,s:Ce}of f){let Oe=j.manifest;', 'for(let{input:j,p:de,s:Ce}of f){if(Ce.__malo){u.valSalteados=(u.valSalteados||0)+1;continue}let Oe=j.manifest;', gpu);
fs.writeFileSync(gpu, js);

const an = `${dir}/gh3-analytics.js`;
let a = fs.readFileSync(an, 'utf8');
if (a.includes('GPUValidation')) throw Error('Ya parcheado: ' + an);
a = swap(a, "    if(data?.type==='r5SongReport'&&data.data?.fatal)",
  "    // Claude 2026-10-22 gpuval: errores de validación WebGPU recuperados (ya no cortan la imagen): mensaje real, una vez por mensaje.\n" +
  "    const val=data?.type==='r5SongReport'&&data.data?.temporal?.validacion;if(val&&val.ultimo){const seen=window.__gh3ValSeen||(window.__gh3ValSeen=new Set());if(!seen.has(val.ultimo)&&seen.size<5){seen.add(val.ultimo);reportError('renderer',{name:'GPUValidation',message:val.ultimo,cause:val.donde||''},{runtime:true,severity:'recovered'});}}\n" +
  "    if(data?.type==='r5SongReport'&&data.data?.fatal)", an);
fs.writeFileSync(an, a);
console.log(JSON.stringify({dir, gpu: true, analytics: true}));
