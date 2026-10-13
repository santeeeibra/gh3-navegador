// Claude 2026-10-13: compara dos corridas de run-song.mjs del mismo tema: gobernador sólo mirando (?gov=observa) vs actuando (?gov=1).
// Uso: node tools/r5-native60/compare-gov.mjs <corrida-observa> <corrida-activo> [carpeta-salida]
// Cada corrida es la carpeta de run-song.mjs (con verification.json) o el propio .json. Escribe comparacion.json y comparacion.md.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const load=p=>JSON.parse(fs.readFileSync(fs.statSync(p).isDirectory()?path.join(p,'verification.json'):p,'utf8'));
const round=(v,d=1)=>v==null||!Number.isFinite(v)?null:Math.round(v*10**d)/10**d;
const delta=(a,b,k)=>a?.audio&&b?.audio?(b.audio[k]??0)-(a.audio[k]??0):null;

// Ventana de muestras (cada 2 s) del tramo de canción: imágenes presentadas vs dibujos del juego, y audio.
function windowOf(xs){
 const a=xs[0],b=xs.at(-1);if(!a||!b||a===b||!(b.t>a.t))return null;
 const s=(b.t-a.t)/1000;
 return {segundos:round(s),fpsPresentados:round((b.presented-a.presented)/s),fpsJuego:a.renderer&&b.renderer?round((b.renderer.submitted-a.renderer.submitted)/s):null,
  cortes:delta(a,b,'underruns'),saltos:delta(a,b,'skips'),bloquesMudos:delta(a,b,'silentBlocks')};
}

// Resume una corrida. Todo lo que falte queda en null (corridas viejas sin gobernador, juego que falló, etc.).
export function summarizeRun(report){
 const samples=report.samples||[],g=report.governor||null,m=g?.medidas||{},last=samples.at(-1);
 const song=windowOf(samples),steady=windowOf(samples.filter(s=>s.clock>=10000));
 // Cortes y saltos desde que existe el audio (antes de Jugar): el gobernador los cuenta sin borrar; si no está, el contador del juego.
 const cortes=g?.audio?.cortes??last?.audio?.underruns??null,saltos=g?.audio?.saltos??last?.audio?.skips??null;
 return {
  ok:report.ok??null,error:report.error?String(report.error).split('\n')[0]:null,tema:report.song??null,completa:!!report.full,
  modo:g?.modo??(/(?:^|&)gov=([^&]*)/.exec(report.query||'')?.[1]||null),
  audio:{cortes,saltos,bloquesEstirados:g?.audio?.bloquesEstirados??null,eventos:report.audioEvents?.length??null,
   cortesEnCancion:song?.cortes??null,saltosEnCancion:song?.saltos??null,falla:cortes==null&&saltos==null?null:(cortes||0)>0||(saltos||0)>0},
  imagen:{fpsPresentados:steady?.fpsPresentados??song?.fpsPresentados??null,fpsJuego:steady?.fpsJuego??song?.fpsJuego??null,
   swapsJuegoPorSeg:m.swapsJuegoPorSeg??null,snapshotsPorSeg:m.snapshotsPorSeg??null,escala:m.escala??null,soloPista:m.soloPista??null},
  controles:{p50Ms:m.latenciaJuego?.p50Ms??null,p95Ms:m.latenciaJuego?.p95Ms??null,maxMs:m.latenciaJuego?.maxMs??null,toqueMaxMs:m.demoraToque?.maxMs??null},
  gobernador:g?{estadoFinal:g.estado,decisionFinal:g.decision?.estado??null,segundosEnEstado:g.segundosEnEstado||null,transiciones:g.transiciones?.length??0,
   colchonMinMs:m.colchonMinMs??null,produccionAudio:m.produccionAudio??null,gpuMs:m.gpuMs??null,preparacionMs:m.preparacionMs??null}:null,
  segundosMedidos:steady?.segundos??song?.segundos??null,
 };
}

// Compara: el gobernador activo sirve si no empeora el audio ni los controles. Los cortes/saltos son falla en cualquiera de las dos.
export function compareRuns(observaReport,activoReport){
 const o=summarizeRun(observaReport),a=summarizeRun(activoReport),avisos=[],conclusiones=[];
 if(o.tema&&a.tema&&o.tema!==a.tema)avisos.push(`Temas distintos (${o.tema} vs ${a.tema}): la comparación no vale.`);
 if(o.completa!==a.completa)avisos.push('Una corrida es completa y la otra no.');
 for(const [k,r,want] of [['observa',o,'observa'],['activo',a,'activo']]){
  if(r.ok===false)avisos.push(`La corrida ${k} falló: ${r.error||'sin detalle'}.`);
  if(!r.gobernador)avisos.push(`La corrida ${k} no tiene el resumen del gobernador.`);
  else if(r.modo!==want)avisos.push(`La corrida ${k} corrió con el gobernador en modo «${r.modo}».`);
  if(r.audio.falla)conclusiones.push(`FALLA ${k}: ${r.audio.cortes||0} cortes y ${r.audio.saltos||0} saltos de audio.`);
 }
 const diff=(x,y,d=1)=>x==null||y==null?null:round(y-x,d);
 const cambios={cortes:diff(o.audio.cortes,a.audio.cortes,0),saltos:diff(o.audio.saltos,a.audio.saltos,0),bloquesEstirados:diff(o.audio.bloquesEstirados,a.audio.bloquesEstirados,0),
  fpsPresentados:diff(o.imagen.fpsPresentados,a.imagen.fpsPresentados),fpsJuego:diff(o.imagen.fpsJuego,a.imagen.fpsJuego),controlesP95Ms:diff(o.controles.p95Ms,a.controles.p95Ms)};
 if(cambios.cortes>0||cambios.saltos>0)conclusiones.push('El gobernador activo tuvo MÁS cortes o saltos de audio que sólo mirando.');
 else if(cambios.cortes<0||cambios.saltos<0)conclusiones.push('El gobernador activo tuvo menos cortes o saltos de audio.');
 if(cambios.bloquesEstirados>0)conclusiones.push('Con el gobernador activo el audio se estiró más veces.');
 if(cambios.controlesP95Ms>8)conclusiones.push('Los controles respondieron peor con el gobernador activo (p95 más de 8 ms arriba).');
 const ob=o.gobernador?.segundosEnEstado;
 if(ob&&(ob.protegido>0||ob.minimo>0))conclusiones.push(`Sólo mirando, el gobernador habría recortado ${round((ob.protegido||0)+(ob.minimo||0))} s (protegido ${ob.protegido} s, mínimo ${ob.minimo} s).`);
 else if(ob)conclusiones.push('Sólo mirando, el gobernador no habría recortado nunca.');
 if(!conclusiones.some(c=>c.startsWith('FALLA'))&&o.audio.falla===false&&a.audio.falla===false)conclusiones.push('Audio sin cortes ni saltos en las dos corridas.');
 return {observa:o,activo:a,cambios,avisos,conclusiones};
}

const cell=v=>v==null?'—':typeof v==='boolean'?(v?'sí':'no'):String(v);
export function toMarkdown(c){
 const {observa:o,activo:a}=c,row=(label,x,y,d)=>`| ${label} | ${cell(x)} | ${cell(y)} | ${cell(d)} |`;
 const st=(r,k)=>r.gobernador?.segundosEnEstado?.[k];
 return [
  `# Gobernador: sólo mirando vs activo (${o.tema||'?'})`,'',
  ...(c.avisos.length?['**Avisos**','',...c.avisos.map(x=>'- '+x),'']:[]),
  '**Conclusiones**','',...c.conclusiones.map(x=>'- '+x),'',
  '| Medida | Sólo mirando | Activo | Diferencia |','|---|---|---|---|',
  row('Corrida terminó bien',o.ok,a.ok),
  row('Cortes de audio (desde antes de Jugar)',o.audio.cortes,a.audio.cortes,c.cambios.cortes),
  row('Saltos de audio',o.audio.saltos,a.audio.saltos,c.cambios.saltos),
  row('Bloques de audio estirados',o.audio.bloquesEstirados,a.audio.bloquesEstirados,c.cambios.bloquesEstirados),
  row('Imágenes presentadas por segundo',o.imagen.fpsPresentados,a.imagen.fpsPresentados,c.cambios.fpsPresentados),
  row('Dibujos del juego por segundo',o.imagen.fpsJuego,a.imagen.fpsJuego,c.cambios.fpsJuego),
  row('Swaps del juego por segundo',o.imagen.swapsJuegoPorSeg,a.imagen.swapsJuegoPorSeg),
  row('Snapshots por segundo',o.imagen.snapshotsPorSeg,a.imagen.snapshotsPorSeg),
  row('Controles p50 / p95 (ms)',`${cell(o.controles.p50Ms)} / ${cell(o.controles.p95Ms)}`,`${cell(a.controles.p50Ms)} / ${cell(a.controles.p95Ms)}`,c.cambios.controlesP95Ms),
  row('Segundos en normal',st(o,'normal'),st(a,'normal')),
  row('Segundos en protegido',st(o,'protegido'),st(a,'protegido')),
  row('Segundos en mínimo',st(o,'minimo'),st(a,'minimo')),
  row('Cambios de estado',o.gobernador?.transiciones,a.gobernador?.transiciones),
  row('Colchón de audio mínimo (ms)',o.gobernador?.colchonMinMs,a.gobernador?.colchonMinMs),
  row('Segundos medidos',o.segundosMedidos,a.segundosMedidos),
  '','«Sólo mirando» no cambia nada: sus segundos en protegido/mínimo son lo que el gobernador *habría* hecho.',''].join('\n');
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 const [obs,act,outDir]=process.argv.slice(2);
 if(!obs||!act)throw Error('Uso: node tools/r5-native60/compare-gov.mjs <corrida-observa> <corrida-activo> [carpeta-salida]');
 const c=compareRuns(load(obs),load(act)),out=path.resolve(outDir||path.dirname(path.resolve(act)));
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'comparacion.json'),JSON.stringify(c,null,2));
 const md=toMarkdown(c);fs.writeFileSync(path.join(out,'comparacion.md'),md);console.log(md);console.log('Guardado en',out);
}
