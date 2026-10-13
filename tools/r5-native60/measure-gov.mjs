// Claude 2026-10-13: un solo comando para medir el gobernador en la PC: corre run-song.mjs dos veces con el mismo tema,
// primero ?gov=observa (no cambia nada) y después ?gov=1 (actúa), y compara las dos con compare-gov.mjs.
// Uso: node tools/r5-native60/measure-gov.mjs [tema] [--full] [--escena]
//   tema: slowride (por defecto), talkdirtytome, hitmewithyourbestshot o storyofmylife.  --escena: consumidor de escena en vez de pista.
// Respeta el turno de artifacts/PRUEBAS-EN-CURSO.md (run-song.mjs --wait espera hasta 30 min). GH3_QUERY, DEMO_ROOT, etc. se pueden fijar a mano.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {compareRuns, toMarkdown} from './compare-gov.mjs';

const args=process.argv.slice(2),song=args.find(a=>!a.startsWith('--'))||'slowride',full=args.includes('--full'),scene=args.includes('--escena');
const runner=process.env.GOV_RUNNER||'tools/r5-native60/run-song.mjs';  // GOV_RUNNER: sólo para la prueba con un runner falso
const demo=process.env.DEMO_ROOT||'artifacts/r5-native60/demo';
const env={...process.env,DEMO_ROOT:demo,BOT_REFRET:process.env.BOT_REFRET||'100'};
if(!env.EXTRA_STATIC&&fs.existsSync(demo))env.EXTRA_STATIC=fs.readdirSync(demo,{withFileTypes:true}).filter(e=>e.isFile()).map(e=>e.name).join(',');
const base=process.env.GH3_QUERY||(scene?'manual=1&r5lite=0&r5liveconsumer=r5snap-native60-scene.js&gfx=url':'manual=1&r5lite=1&r5liveconsumer=r5snap-native60-colas.js&gfx=url');
const withGov=v=>{const q=new URLSearchParams(base);q.set('gov',v);return q.toString();};
const stamp=Date.now(),label=scene?'escena':'pista';

// Corre run-song.mjs mostrando su salida; su última línea JSON dice dónde guardó la corrida.
function runOnce(gov){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[runner,song,'--wait',...(full?['--full']:[])],{env:{...env,GH3_QUERY:withGov(gov),HW60_LABEL:`gov-${gov==='1'?'activo':gov}-${label}`},stdio:['ignore','pipe','inherit']});
  let last=null,rest='';
  child.stdout.on('data',d=>{process.stdout.write(d);const lines=(rest+d).split(/\r?\n/);rest=lines.pop();for(const l of lines)if(l.startsWith('{"out"'))try{last=JSON.parse(l);}catch{}});
  child.on('error',reject);
  child.on('close',code=>{if(rest.startsWith('{"out"'))try{last=JSON.parse(rest);}catch{}resolve({code,out:last?.out||null,ok:last?.ok??null});});
 });
}

console.log(`Midiendo ${song} (${label}${full?', completa':''}): 1) gobernador sólo mirando, 2) gobernador activo.`);
const runs={};
for(const [name,gov] of [['observa','observa'],['activo','1']]){
 console.log(`\n=== Corrida ${name} (gov=${gov}) ===`);
 runs[name]=await runOnce(gov);
 if(!runs[name].out){console.error(`La corrida ${name} no llegó a guardar resultados (código ${runs[name].code}). Se corta acá.`);process.exit(1);}
 if(runs[name].ok!==true)console.log(`Aviso: la corrida ${name} no terminó bien; igual se compara.`);
 if(name==='observa')await new Promise(r=>setTimeout(r,Number(process.env.GOV_PAUSE_MS??5000)));  // que se calme la máquina entre corridas
}
const load=d=>JSON.parse(fs.readFileSync(path.join(d,'verification.json'),'utf8'));
const out=path.resolve(process.env.GOV_OUT||`artifacts/r5-native60/runs/gov-${song}-${label}-${stamp}`);
const c=compareRuns(load(runs.observa.out),load(runs.activo.out));c.corridas={observa:runs.observa.out,activo:runs.activo.out};
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'comparacion.json'),JSON.stringify(c,null,2));
const md=toMarkdown(c);fs.writeFileSync(path.join(out,'comparacion.md'),md);
console.log('\n'+md);console.log('Comparación guardada en',out);
process.exitCode=c.conclusiones.some(x=>x.startsWith('FALLA'))||c.avisos.length?1:0;
