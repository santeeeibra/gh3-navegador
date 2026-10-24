import fs from 'node:fs';
import {build} from 'esbuild';
import {createPressWriter,QUEUE} from './press-queue.mjs';
const out='artifacts/sincronia-rea/pulsacion',base='artifacts/sincronia-rea/judgement';
fs.mkdirSync(out+'/src',{recursive:true});
const rep=(s,a,b)=>{if(s.split(a).length!==2)throw Error('Non-unique anchor: '+a);return s.replace(a,b);};
let code=fs.readFileSync(base+'/src/gh3_recomp.2.cpp','utf8').replaceAll('\r\n','\n');
code=rep(code,'#include "judgement_probe.h"','#include "press_probe.h"');
code=rep(code,'ctx.lr = 0x8211FADC;\n\tsub_82266240(ctx, base);',`ctx.lr = 0x8211FADC;
\tsub_82266240(ctx, base);
\tsync_press_begin(REX_LOAD_U32(ctx.r1.u32+80),ctx.r29.u32,ctx.f1.f64);`);
code=rep(code,'ctx.lr = 0x8211FCCC;\n\tsub_82100CF0(ctx, base);',`ctx.lr = 0x8211FCCC;
\tsub_82100CF0(ctx, base);
\tsync_press_inputs(REX_LOAD_U32(ctx.r1.u32+84),REX_LOAD_U32(ctx.r1.u32+120),REX_LOAD_U32(ctx.r1.u32+136));`);
const perStart=code.indexOf('DEFINE_REX_FUNC(sub_8211F8B8)'),perEnd=code.indexOf('DEFINE_REX_FUNC(',perStart+10);
let perFrame=code.slice(perStart,perEnd);
perFrame=rep(perFrame,'ctx.f23.f64 = double(float(ctx.f29.f64 * ctx.f31.f64));',`// f29 remains the native clock for the original fret history/sustains.
\tctx.f23.f64 = double(float(sync_press_used_sec * ctx.f31.f64));`);
perFrame=rep(perFrame,'// fcmpu cr6,f0,f13\n\tctx.cr6.compare(ctx.f0.f64, ctx.f13.f64);',`// fcmpu cr6,f0,f13
\tctx.f0.f64=sync_press_expiry(ctx.f0.f64,ctx.f13.f64);
\tctx.cr6.compare(ctx.f0.f64, ctx.f13.f64);`);
code=code.slice(0,perStart)+perFrame+code.slice(perEnd);
for(const [kind,idx] of [[1,'sync_u32(0x829B5748+ctx.r3.u32*4)'],[2,'ctx.r4.u32']])code=rep(code,`sync_judgement(${kind}, ctx.r3.u32, ctx.r4.u32, ctx.f1.f64);`,`sync_press_result(${kind},ctx.r3.u32,${idx});\n\tsync_judgement(${kind}, ctx.r3.u32, ctx.r4.u32, ctx.f1.f64);`);
fs.writeFileSync(out+'/src/gh3_recomp.2.cpp',code);
let link=fs.readFileSync('tools/sincronia/link-judgement.sh','utf8');
fs.writeFileSync('tools/sincronia/link-press.sh',link);
let buildSh=fs.readFileSync('tools/sincronia/build-judgement.sh','utf8')
 .replaceAll('artifacts/sincronia-rea/judgement',out).replace('link-judgement.sh','link-press.sh')
 .replace('node tools/sincronia/merge-judgement-js.mjs','node tools/sincronia/merge-press-js.mjs')
 .replace('node tools/sincronia/stage-judgement.mjs','node tools/sincronia/stage-press.mjs');
fs.writeFileSync('tools/sincronia/build-press.sh',buildSh);
// Use the already verified EM_ASM merge, accepting the explicit additional
// probes from this source. Refuse any unrelated change to loader structure.
// merge-press-js is maintained separately to validate identical ASM aliases.

// Independent robot with the SAME timing as the previous baseline. The queue
// is written by this worker, and the page must not be a second writer in runs.
let robot=fs.readFileSync('tools/sincronia/robot-timeline.mjs','utf8');
robot=rep(robot,'const FRET =',`const QUEUE=${JSON.stringify(QUEUE)},createPressWriter=${createPressWriter.toString()};\n      const FRET =`);
robot=rep(robot,'let M = null, L = null,','let M = null, L = null, writePress=null,deliveryDelayMs=0,wrongIndex=-1,lateIndex=-1,lateMs=160,');
robot=rep(robot,"if (d.type === 'arm') armed = true;",`if (d.type === 'pressQueue' && M && !writePress)writePress=createPressWriter(M.sab,d.ptr,M.seg);
        if (d.type === 'arm') armed = true;`);
robot=rep(robot,'{omitir = null, estrella = 0, lead = 0} = {}','{omitir = null, estrella = 0, lead = 0, deliveryDelayMs=0, wrongIndex=-1, lateIndex=-1, lateMs=160} = {}');
robot=rep(robot,'({notes, omitir, estrella, lead}) =>','({notes, omitir, estrella, lead, deliveryDelayMs,wrongIndex,lateIndex,lateMs}) =>');
robot=rep(robot,"({notes, omitir, estrella, lead} = d)","({notes, omitir, estrella, lead,deliveryDelayMs,wrongIndex,lateIndex,lateMs} = d)");
robot=rep(robot,"{type: 'init', notes, omitir, estrella, lead}","{type: 'init', notes, omitir, estrella, lead,deliveryDelayMs,wrongIndex,lateIndex,lateMs}");
robot=rep(robot,'{notes: chart.notes, omitir, estrella, lead}','{notes: chart.notes, omitir, estrella, lead,deliveryDelayMs,wrongIndex,lateIndex,lateMs}');
robot=rep(robot,'let i = 0, frets = 0,','const pending=[];let i = 0, frets = 0,');
robot=rep(robot,'notes[i].t < now - 150','notes[i].t+(i===lateIndex?lateMs:0) < now - 150');
robot=rep(robot,'frets = callar ? 0 : x.mask & 31','frets = callar ? 0 : i===wrongIndex?((x.mask<<1)|(x.mask>>4))&31:x.mask & 31');
robot=rep(robot,'if (now >= x.t) {','if (now >= x.t+(i===lateIndex?lateMs:0)) {');
const originalWrite='if (key !== last || tap) { if (tap) Atomics.or(L, 10, tap); Atomics.store(L, 2, tr); Atomics.store(L, 1, b); new Float64Array(L.buffer,L.byteOffset+32,1)[0]=performance.timeOrigin+performance.now(); Atomics.add(L, 0, 1); last = key; }';
robot=rep(robot,originalWrite,`if (key !== last || tap) {
          let queueId=null;
          if(tap&DOWN && writePress){const nowAt=performance.timeOrigin+performance.now();queueId=writePress({eventAt:nowAt,writtenAt:nowAt,buttons:b,triggers:tr,source:8,flags:4,seq:Atomics.load(L,0)+pending.length+1});const press=st.presses.at(-1);if(press)Object.assign(press,{queueId,queuedAt:nowAt});}
          pending.push({due:pnow+deliveryDelayMs,b,tr,tap,queueId});last=key;
        }
        while(pending.length&&pending[0].due<=pnow){const d=pending.shift();
          if(d.tap)Atomics.or(L,10,d.tap);Atomics.store(L,2,d.tr);Atomics.store(L,1,d.b);
          new Float64Array(L.buffer,L.byteOffset+32,1)[0]=performance.timeOrigin+performance.now();Atomics.add(L,0,1);
          if(d.queueId){const press=st.presses.find(x=>x.queueId===d.queueId);if(press)press.deliveredAt=performance.timeOrigin+performance.now();}
        }`);
robot=rep(robot,"bw.postMessage({type: 'stats'});",`if(window.syncPress?.ptr)bw.postMessage({type:'pressQueue',ptr:window.syncPress.ptr});
      bw.postMessage({type: 'stats'});`);
fs.writeFileSync('tools/sincronia/robot-press.mjs',robot);
let runner=fs.readFileSync('tools/sincronia/robot-native-timeline.mjs','utf8')
 .replace("from './robot-timeline.mjs'","from './robot-press.mjs'")
 .replace('judgements:window.syncJudgements','judgements:window.syncJudgements,press:window.syncPress,pressInput:window.syncPressInput,pressResults:window.syncPressResults,pressRejects:window.syncPressRejects');
runner=rep(runner,"await instalarRobot(g.page, leerChart(tema), {omitir, estrella: escenario", "await instalarRobot(g.page, leerChart(tema), {omitir, deliveryDelayMs:Number(opt('entrega',0)),wrongIndex:opt('negativos',false)===true?0:-1,lateIndex:opt('negativos',false)===true?12:-1,estrella: escenario");
fs.writeFileSync('tools/sincronia/run-press.mjs',runner);
await build({entryPoints:['tools/sincronia/press-page.mjs'],bundle:true,format:'iife',outfile:out+'/press-page.js',logLevel:'warning'});
console.log(out);
