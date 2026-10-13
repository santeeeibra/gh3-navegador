import fs from 'node:fs';
import path from 'node:path';
const dir=process.argv[2];if(!dir)throw Error('Pass one run directory');
const report=JSON.parse(fs.readFileSync(path.join(dir,'verification.json')));
const all=report.samples||[],steady=all.filter(s=>s.clock>=10000);
const window=xs=>{
 const a=xs[0],b=xs.at(-1);if(!a||!b||a===b)return null;
 const elapsedMs=b.t-a.t;
 const audio={};for(const k of ['underruns','silentBlocks','skips'])audio[k]={start:a.audio?.[k]??null,end:b.audio?.[k]??null,delta:(b.audio?.[k]??0)-(a.audio?.[k]??0)};
 const gaps=b.cadence&&a.cadence?Object.fromEntries(Object.keys(b.cadence.gaps).map(k=>[k,b.cadence.gaps[k]-a.cadence.gaps[k]])):null;
 return {elapsedSeconds:elapsedMs/1000,frames:b.presented-a.presented,fps:1000*(b.presented-a.presented)/elapsedMs,sourceFPS:a.renderer&&b.renderer?1000*(b.renderer.submitted-a.renderer.submitted)/elapsedMs:null,audio,gaps};
};
const summary={run:path.resolve(dir),song:report.song,full:report.full,ok:report.ok??null,lastClockMs:all.at(-1)?.clock,lastNoteMs:report.lastNoteMs,pageErrors:report.pageErrors,audioNetworkRequests:report.audioNetworkDuringSong?.length??null,all:window(all),afterClock10s:window(steady),lastCadence:all.at(-1)?.cadence??null,lastGPU:all.at(-1)?.renderer?.gpu??null,skips:all.at(-1)?.renderer?.skips??null};
fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
