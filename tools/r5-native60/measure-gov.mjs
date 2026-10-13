// Claude 2026-10-13: un solo comando para medir el gobernador en la PC: corre run-song.mjs dos veces con el mismo tema,
// primero ?gov=observa (no cambia nada) y después ?gov=1 (actúa), y compara las dos con compare-gov.mjs.
// Uso: node tools/r5-native60/measure-gov.mjs [tema] [--full] [--escena] [--precarga]
//   tema: slowride (por defecto), talkdirtytome, hitmewithyourbestshot o storyofmylife.  --escena: consumidor de escena en vez de pista.
//   --precarga: en vez de observa/activo, corre dos veces con el MISMO perfil del navegador (sólo mirando) y compara
//   cuántos pipelines se compilaron con la canción en juego en la primera y en la segunda (preload.mjs).
// Respeta el turno de artifacts/PRUEBAS-EN-CURSO.md (run-song.mjs --wait espera hasta 30 min). GH3_QUERY, DEMO_ROOT, etc. se pueden fijar a mano.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {compareRuns, toMarkdown} from './compare-gov.mjs';

const args=process.argv.slice(2),song=args.find(a=>!a.startsWith('--'))||'slowride',full=args.includes('--full'),scene=args.includes('--escena'),pre=args.includes('--precarga');
const runner=process.env.GOV_RUNNER||'tools/r5-native60/run-song.mjs';  // GOV_RUNNER: sólo para la prueba con un runner falso
const demo=process.env.DEMO_ROOT||'artifacts/r5-native60/demo';
const env={...process.env,DEMO_ROOT:demo,BOT_REFRET:process.env.BOT_REFRET||'100'};
if(!env.EXTRA_STATIC&&fs.existsSync(demo))env.EXTRA_STATIC=fs.readdirSync(demo,{withFileTypes:true}).filter(e=>e.isFile()).map(e=>e.name).join(',');
const base=process.env.GH3_QUERY||(scene?'manual=1&r5lite=0&r5liveconsumer=r5snap-native60-scene.js&gfx=url':'manual=1&r5lite=1&r5liveconsumer=r5snap-native60-colas.js&gfx=url');
const withGov=v=>{const q=new URLSearchParams(base);q.set('gov',v);return q.toString();};
const stamp=Date.now(),label=scene?'escena':'pista';
const out=path.resolve(process.env.GOV_OUT||`artifacts/r5-native60/runs/${pre?'precarga':'gov'}-${song}-${label}-${stamp}`),profile=path.join(out,'perfil');
const plan=pre?[['primera','observa'],['segunda','observa']]:[['observa','observa'],['activo','1']];

// Corre run-song.mjs mostrando su salida; su última línea JSON dice dónde guardó la corrida.
function runOnce(name,gov){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[runner,song,'--wait',...(full?['--full']:[])],{env:{...env,GH3_QUERY:withGov(gov),HW60_LABEL:`gov-${name}-${label}`,...(pre?{GH3_PROFILE:profile}:{})},stdio:['ignore','pipe','inherit']});
  let last=null,rest='';
  child.stdout.on('data',d=>{process.stdout.write(d);const lines=(rest+d).split(/\r?\n/);rest=lines.pop();for(const l of lines)if(l.startsWith('{"out"'))try{last=JSON.parse(l);}catch{}});
  child.on('error',reject);
  child.on('close',code=>{if(rest.startsWith('{"out"'))try{last=JSON.parse(rest);}catch{}resolve({code,out:last?.out||null,ok:last?.ok??null});});
 });
}

console.log(pre?`Midiendo la precarga con ${song} (${label}${full?', completa':''}): dos corridas con el mismo perfil.`:`Midiendo ${song} (${label}${full?', completa':''}): 1) gobernador sólo mirando, 2) gobernador activo.`);
const runs={};
for(const [name,gov] of plan){
 console.log(`\n=== Corrida ${name} (gov=${gov}) ===`);
 runs[name]=await runOnce(name,gov);
 if(!runs[name].out){console.error(`La corrida ${name} no llegó a guardar resultados (código ${runs[name].code}). Se corta acá.`);process.exit(1);}
 if(runs[name].ok!==true)console.log(`Aviso: la corrida ${name} no terminó bien; igual se compara.`);
 if(name===plan[0][0])await new Promise(r=>setTimeout(r,Number(process.env.GOV_PAUSE_MS??5000)));  // que se calme la máquina entre corridas
}
const load=d=>JSON.parse(fs.readFileSync(path.join(d,'verification.json'),'utf8'));
const [first,second]=plan.map(p=>runs[p[0]]);
const c=compareRuns(load(first.out),load(second.out),{precarga:pre});c.corridas={[plan[0][0]]:first.out,[plan[1][0]]:second.out};
if(pre&&!process.env.KEEP_PROFILE)fs.rmSync(profile,{recursive:true,force:true});  // el perfil guarda el juego en caché: ocupa mucho
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'comparacion.json'),JSON.stringify(c,null,2));
const md=toMarkdown(c,pre?{title:`Precarga: primera vs segunda corrida (${song})`,columns:['Primera','Segunda'],note:'Mismo perfil del navegador: la segunda ya tiene recordados los pipelines (y el juego en caché, por eso también carga más rápido).'}:undefined);fs.writeFileSync(path.join(out,'comparacion.md'),md);
console.log('\n'+md);console.log('Comparación guardada en',out);
process.exitCode=c.conclusiones.some(x=>x.startsWith('FALLA'))||c.avisos.length?1:0;
