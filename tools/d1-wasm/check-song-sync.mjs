// Isolated page/input/audio checks. Does not start GH3 or claim original judgement.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const html=fs.readFileSync('artifacts/d1-wasm/r6/song/index.html','utf8');
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
const raw=html.match(/new Blob\(\[("(?:[^"\\]|\\.)*")\], \{ type: 'text\/javascript' \}\)/);
assert(raw,'AudioWorklet source');
let Processor;
vm.runInNewContext(JSON.parse(raw[1]),{AudioWorkletProcessor:class{constructor(){this.port={postMessage(){}};}},registerProcessor:(_,p)=>Processor=p,Uint32Array,Float32Array,Atomics});
const cap=65536,sab=new SharedArrayBuffer(8+cap*8),w=new Uint32Array(sab,0,1);
new Uint32Array(sab,4,1)[0]=cap;new Float32Array(sab,8).fill(.25);w[0]=20000;
const p=new Processor({processorOptions:{sab,ptr:0}});
for(let i=0;i<400;i++){
 const channels=[new Float32Array(128),new Float32Array(128)];p.process([], [channels]);
 assert(channels.every(c=>c.every(v=>v===.25)));Atomics.add(w,0,128);
}
assert.equal(p.st.underruns,0);p.port.onmessage({data:{type:'reset'}});assert.equal(p.r,-1);
const turnFile='artifacts/PRUEBAS-EN-CURSO.md',original=fs.readFileSync(turnFile,'utf8');
assert(!original.includes('Estado: OCUPADO'),'Test turn is occupied');
const reservation=`codex-song-sync-${process.pid}`;
fs.writeFileSync(turnFile,`Estado: OCUPADO\nQuién: Codex\nReserva: ${reservation}\nQué: página/AudioWorklet/teclado aislados; sin GH3\n`);
let browser;const report={scope:'Page, synthetic ring and keyboard mapping only; no GH3 judgement or real song audio',cpuAudio:true,pageErrors:[]};
try{
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));
 await page.goto('http://127.0.0.1:5394/?song=1');
 assert.equal(await page.locator('#songOff').inputValue(),'-450');
 await page.click('#notesLater');assert.equal(await page.locator('#songOff').inputValue(),'-470');
 await page.reload();assert.equal(await page.locator('#songOff').inputValue(),'-470');
 await page.click('#syncReset');assert.equal(await page.locator('#songOff').inputValue(),'-450');
 await page.evaluate(()=>{
  window.testInput=new SharedArrayBuffer(64);window.gh3Song.clock=()=>1000;
  window.gh3Input.attach(window.testInput,0);
 });
 await page.keyboard.down('KeyA');
 const onlyColor=await page.evaluate(()=>Array.from(new Int32Array(window.testInput,0,11)));
 assert.equal(onlyColor[2]&255,255);assert.equal(onlyColor[1]&3,0);
 await page.keyboard.down('ArrowDown');
 const strum=await page.evaluate(()=>Array.from(new Int32Array(window.testInput,0,11)));
 assert.equal(strum[1]&2,2);assert.equal(strum[2]&255,255);
 await page.keyboard.up('ArrowDown');await page.keyboard.up('KeyA');
 await page.evaluate(async()=>{
  const cap=65536,sab=new SharedArrayBuffer(8+cap*8);
  new Uint32Array(sab,4,1)[0]=cap;new Float32Array(sab,8).fill(.25);new Uint32Array(sab,0,1)[0]=20000;
  await window.r6StartAudio(sab,0);
 });
 await page.waitForTimeout(700);
 report.browserAudio=await page.evaluate(()=>window.d4.r6Audio);
 assert(report.browserAudio?.played>0);assert.equal(report.browserAudio.sampleRate,48000);
 assert.equal(await page.locator('#r6ResetAudio').isEnabled(),true);
 assert.equal(report.pageErrors.length,0);report.ok=true;
}finally{
 await browser?.close();
 if(fs.readFileSync(turnFile,'utf8').includes(`Reserva: ${reservation}`))fs.writeFileSync(turnFile,'Estado: LIBRE\nQuién: Codex\nQué: pruebas aisladas de página/audio/teclado cerradas. Sin GH3\n');
 fs.mkdirSync('artifacts/song-sync',{recursive:true});fs.writeFileSync('artifacts/song-sync/page-check.json',JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report));
