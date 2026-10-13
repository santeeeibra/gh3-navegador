// Real captured guest draw stream, with controlled overlay heartbeats. No GPU.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const cap='artifacts/r5-scene-mobile/runs/fixed2-pc-capture/capture-1';
const index=JSON.parse(fs.readFileSync(cap+'/capture.json'));
const ranges=index.resources.map(r=>({...r,data:new Uint8Array(fs.readFileSync(cap+`/${r.phys}-${r.length}.bin`))}));
const api={readPhysical(p,n){const r=ranges.find(r=>r.phys<=p&&p+n<=r.phys+r.length);if(!r)throw Error('Missing '+p+':'+n);return r.data.subarray(p-r.phys,p-r.phys+n);}};
const bytes=new Uint8Array(fs.readFileSync(cap+'/frame.r5f'));
let channel,now=0,innerCalls=0;
const messages=[];
const context={Uint8Array,Uint32Array,Float32Array,DataView,ArrayBuffer,performance:{timeOrigin:0,now:()=>now},BroadcastChannel:class{constructor(){channel=this;}postMessage(m){messages.push(m);}},__r5liveConsumer:()=>{innerCalls++;return 'inner-ok';}};
vm.createContext(context);vm.runInContext(fs.readFileSync('artifacts/hw60-codex/demo/hw60-tap.js','utf8'),context);
const board={vs:0x80708BD1B82638B0n},hud={vs:0xB43CF443883B8351n};
assert.equal(context.__hw60DrawFilter(board),true);
assert.equal(context.__r5liveConsumer(bytes,{seq:0},api),'inner-ok');
assert.ok(messages.at(-1).draws.some(d=>d.vs==='80708BD1B82638B0'));
channel.onmessage({data:{type:'overlayReady',on:true,at:0}});
assert.equal(context.__hw60DrawFilter(board),false);
assert.equal(context.__hw60DrawFilter(hud),true);
now=351;assert.equal(context.__hw60DrawFilter(board),true);
channel.onmessage({data:{type:'overlayReady',on:true,at:351}});
assert.equal(context.__hw60DrawFilter(board),false);
channel.onmessage({data:{type:'tapEnable',on:false}});
assert.equal(context.__hw60DrawFilter(board),true);
assert.equal(context.__r5liveConsumer(bytes,{seq:1},api),'inner-ok');
assert.equal(innerCalls,2);
channel.onmessage({data:{type:'tapEnable',on:true}});
channel.onmessage({data:{type:'overlayReady',on:true,at:351}});
// Leaving the song produces no highway. The original handles the next frame.
// Rather than forge a capture, disable the producer and verify that fallback.
channel.onmessage({data:{type:'overlayReady',on:false,at:351}});
assert.equal(context.__hw60DrawFilter(board),true);
const report={ok:true,innerCalls,capturedDraws:messages[0].draws.length,heartbeatExpires:true,disabledFallsBack:true,hudRetained:true};
fs.writeFileSync('artifacts/hw60-codex/filter-check.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
