// Summarize exact null-GPU counters. Rates are swaps (logic submissions), never rendered FPS.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const base=path.join(root,'artifacts/d1-wasm');
const records=[];
for(const platform of ['node','edge']) {
 const labels=[1,2,3].map(i=>`g1c-${platform}-final${i}`);
 if(platform==='node') labels.push('g1c-node-extended120','g1c-node-extended180');
 for(const label of labels) {
  const folder=platform==='node'?'d3':'d4';
  const stem=path.join(base,folder,label);
  if(!fs.existsSync(stem+'.json')) continue;
  const run=JSON.parse(fs.readFileSync(stem+'.json','utf8'));
  const log=fs.readFileSync(stem+'.log','utf8');
  const samples=[...log.matchAll(/^\[g1\] (\{.*\})$/gm)].map(m=>JSON.parse(m[1]));
  const rates=samples.map((s,i)=>{
   const p=i?samples[i-1]:{t:0,swaps:0,draws:0,packets:0,vblanks:0};
   const dt=s.t-p.t;
   return {t:s.t,intervalSeconds:dt,swapsPerSecond:(s.swaps-p.swaps)/dt,
    drawsPerSecond:(s.draws-p.draws)/dt,packetsPerSecond:(s.packets-p.packets)/dt,
    vblanksPerSecond:(s.vblanks-p.vblanks)/dt};
  });
  const opens=[...log.matchAll(/\[g1-file\] path=(.*?) status=([A-F0-9]{8}) access=([A-F0-9]{8})/g)]
   .map(m=>({path:m[1],status:m[2],access:m[3]}));
  const threads=[...log.matchAll(/\[g1-thread\] created id=(\d+) handle=([A-F0-9]+) start=([A-F0-9]+)/g)]
   .map(m=>({id:Number(m[1]),handle:m[2],start:m[3]}));
  const fault=log.match(/\[g1-fault\] lr=(\w+) ctr=(\w+) r3=(\w+) r11=(\w+) thread=(\w+)/);
  const last=samples.at(-1);
  const window=samples.filter(s=>s.t>=5);
  const first=window[0];
  const duration=first&&last?last.t-first.t:0;
  const result={platform,label,requestedSeconds:run.seconds,run,samples,rates,
   firstSwapSeconds:last?.firstSwapSeconds ?? null,totals:last,
   rateFrom5Seconds:duration>0?{start:first.t,end:last.t,
    swapsPerSecond:(last.swaps-first.swaps)/duration,drawsPerSecond:(last.draws-first.draws)/duration,
    packetsPerSecond:(last.packets-first.packets)/duration}:null,
   openedFiles:opens,threadsCreated:threads,
   audioStateLines:log.split(/\r?\n/).filter(l=>l.startsWith('[g1b-audio]')),
   objectTrace:log.split(/\r?\n/).filter(l=>/g1b-(store|register|return|enter)/.test(l)),
   threadSnapshots:log.split(/\r?\n/).filter(l=>l.startsWith('[g1b-thread]')),
   audioRequestLines:log.split(/\r?\n/).filter(l=>/XAudio|AudioSystem::RegisterClient|XMA.*[Cc]ontext/.test(l)),
   faults:log.split(/\r?\n/).filter(l=>/\[FATAL\]|\[error\]|\[critical\]|Fiber::/.test(l)),
   abortPoint:fault?{lr:fault[1],ctr:fault[2],r3:fault[3],r11:fault[4],thread:fault[5]}:null,
   lastOpenedFile:opens.at(-1)?.path ?? null,
   vdAll:['VdSetGraphicsInterruptCallback','VdInitializeRingBuffer','VdEnableRingBufferRPtrWriteBack'].every(v=>log.includes(v)),
   menuVerified:false,renderedFrames:0,
   movieOpened:opens.some(f=>/atvi\.bik/i.test(f.path)),
   xmaSamples:log.split(/\r?\n/).filter(l=>l.startsWith('[g1c-xma]')).map((line,i)=>({t:samples[i]?.t,...Object.fromEntries([...line.matchAll(/(\w+)=(\d+)/g)].map(m=>[m[1],Number(m[2])]))})),
   caveat:'Logic submissions, no rendered FPS or audible sound. PCM frames are 512 samples/channel. Decode timers are accumulated wall time inside Work and codec calls, not OS CPU time.'
};
  result.xmaRates=result.xmaSamples.map((s,i)=>{const p=i?result.xmaSamples[i-1]:{t:0,frames:0,pcmBytes:0};return {t:s.t,framesPerSecond:(s.frames-p.frames)/(s.t-p.t),pcmBytesPerSecond:(s.pcmBytes-p.pcmBytes)/(s.t-p.t)};});
  result.xmaTotals=result.xmaSamples.at(-1);
  result.movieFiles=opens.filter(f=>/\.bik/i.test(f.path)).map(f=>f.path);
  result.effectiveSeconds=last?.t;
  result.observations=[];
  let previousTime=0;
  for(const line of log.split(/\r?\n/)) {
   const timing=line.match(/^\[g1\] (\{.*\})$/);if(timing) previousTime=JSON.parse(timing[1]).t;
   const file=line.match(/\[g1-file\] path=(.*?) status=/);if(file) result.observations.push({afterSampleSeconds:previousTime,path:file[1],timeIsApproximate:true});
  }
  result.averageXmaFramesPerSecond=last?.t?result.xmaTotals.frames/last.t:null;
  result.firstMovieAfterSampleSeconds=result.observations.find(o=>/atvi\.bik/i.test(o.path))?.afterSampleSeconds;
  fs.copyFileSync(stem+'.log',path.join(base,'g1c',label+'.log'));
  fs.writeFileSync(path.join(base,'g1c',label+'.json'),JSON.stringify(result,null,2));
  records.push(result);
 }
}
fs.writeFileSync(path.join(base,'g1c','summary.json'),JSON.stringify(records.map(r=>({
 platform:r.platform,label:r.label,wallSeconds:r.run.wallSeconds??r.run.waitSeconds,
 exit:r.run.exitCode??r.run.exit,firstSwapSeconds:r.firstSwapSeconds,
 peakRssMB:r.run.peakRssMB??r.run.peakProcessWorkingSetMB,
 ramMethod:r.run.ramMeasurement??'Node child process working set via tasklist',
 wasmLinearMB:r.run.peakMemBytes?r.run.peakMemBytes/1048576:null,
 swaps:r.totals?.swaps,rateFrom5Seconds:r.rateFrom5Seconds,
 lastOpenedFile:r.lastOpenedFile,threads:r.threadsCreated.length,vdAll:r.vdAll,abortPoint:r.abortPoint,movieOpened:r.movieOpened,audio:r.run.audio,xma:r.run.xma,xmaTotals:r.xmaTotals,effectiveSeconds:r.effectiveSeconds,movieFiles:r.movieFiles,faults:r.faults
})),null,2));
console.log(fs.readFileSync(path.join(base,'g1c','summary.json'),'utf8'));
