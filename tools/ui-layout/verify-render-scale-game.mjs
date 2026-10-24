import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {startGame} from '../d1-wasm/fast-start.mjs';
const out=path.resolve('artifacts/resolucion-interna'),deadline=Date.now()+90000;
const report={started:new Date().toISOString(),samples:[],scope:'game menu, not a song'},file=path.join(out,'game-verification.json');
let game,timer;
try{
  // Let startGame's bounded waits reject and release its reservation if startup
  // has not returned yet. Exiting here would bypass its finally/cleanup path.
  timer=setTimeout(async()=>{report.timeout=true;fs.writeFileSync(file,JSON.stringify(report,null,2));await game?.close();},90000);
  game=await startGame({nombre:'medir',root:path.join(out,'demo'),port:5491,query:'manual=1&gfx=url&r5liveconsumer=r5snap-native60-colas.js&padtype=guitar',owner:'Codex (resolución interna)',esperarTurno:false,deadline,init:()=>{localStorage.setItem('gh3-render-scale','1');}});
  report.marks=game.marks;
  await game.page.locator('#gh3Panel .tabs [data-tab="gfx"]').click();
  for(const value of [0.75,0.5,1]){
    await game.page.locator('#gh3RenderScale').selectOption(String(value));
    await game.page.waitForFunction(scale=>window.gh3RenderScale?.applied===scale, value,{timeout:Math.min(12000,deadline-Date.now())});
    const sample=await game.page.evaluate(()=>({requested:gh3RenderScale.requested,applied:gh3RenderScale.applied,status:document.querySelector('#gh3RenderScaleStatus').textContent,renderer:d4.songRenderer?.gpu,frames:d4.songPresented,cuts:d4.r6Audio?.underruns,skips:d4.r6Audio?.skips,error:d4.native60Error||d4.songRenderer?.fatal}));
    assert.equal(sample.applied,value);assert.ok(!sample.error);report.samples.push(sample);
  }
  report.errors=game.errors;assert.deepEqual(game.errors,[]);
  await game.page.screenshot({path:path.join(out,'menu-resolution.png')});report.pass=true;
}catch(error){report.error=error.stack;process.exitCode=1;}
finally{clearTimeout(timer);await game?.close();report.finished=new Date().toISOString();fs.writeFileSync(file,JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass,error:report.error,samples:report.samples.map(({requested,applied,status,frames})=>({requested,applied,status,frames}))},null,2));}
