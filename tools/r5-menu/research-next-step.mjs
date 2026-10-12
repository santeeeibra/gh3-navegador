// Offline research probe: no game, browser, GPU, downloads or runtime edits.
import fs from 'node:fs';
import {readFrameCapture,replayEvents} from './frame-reader.mjs';
import {createHash} from './hash.mjs';
const file='artifacts/d1-wasm/r5frame/runs/r5f-edge-menu-on-r5frame-s8966.r5f';
const capture=readFrameCapture(fs.readFileSync(file),{hash:await createHash()});
const validation=JSON.parse(fs.readFileSync('artifacts/r4-shaders/edge-repacked.json','utf8'));
const rejected=new Set(validation.results.filter(r=>r.moduleValid===false).map(r=>r.name.match(/shader_([0-9A-F]+)\./)?.[1]).filter(Boolean));
const hex=x=>x.toString(16).toUpperCase().padStart(16,'0');
const events=[...replayEvents(capture,3)],draws=events.filter(e=>e.type==='draw');
const count=items=>Object.fromEntries([...new Set(items)].map(x=>[x,items.filter(y=>x===y).length]));
const rectangleDraws=draws.filter(d=>d.primitive===8).map(d=>({draw:d.index,seq:String(d.seq),count:d.indexCount,source:d.indexSource,vs:hex(d.vs),ps:hex(d.ps),issued:d.issued}));
const rejectedDraws=draws.filter(d=>rejected.has(hex(d.ps))).map(d=>({draw:d.index,seq:String(d.seq),vs:hex(d.vs),ps:hex(d.ps),primitive:d.primitive,issued:d.issued}));
const vertexRanges=draws.flatMap(d=>d.vertices.map(v=>capture.blobs.get(v.blob))).filter(Boolean);
const report={file,frame:3,scope:'One stored menu frame; no new execution or visual equivalence claim',
  draws:draws.length,issued:draws.filter(d=>d.issued).length,copies:events.filter(e=>e.type==='copy').length,
  primitiveCounts:count(draws.map(d=>String(d.primitive))),rectangleDraws,
  uniqueRectangleVS:[...new Set(rectangleDraws.map(d=>d.vs))],
  rejectedShaderDraws:rejectedDraws, rejectedPSCounts:count(rejectedDraws.map(d=>d.ps)),
  vertexMemory:{minPhys:Math.min(...vertexRanges.map(b=>b.phys)),maxEnd:Math.max(...vertexRanges.map(b=>b.phys+b.data.length)),
    uniqueCapturedBytes:[...new Map(vertexRanges.map(b=>[b.id,b])).values()].reduce((s,b)=>s+b.data.length,0),
    note:'Sparse capture ranges; not an allocation recommendation. Shader fetch/remapping must preserve addresses.'},
  candidates:{rectangle:'SDK SPIR-V host vertex shader modification kRectangleListAsTriangleStrip plus built-in strip indices; conversion through Naga not verified.',
    textures:'Use SDK GetGuestTextureLayout/level_data_extent_bytes; existing visible byte counts omit tiled holes.',
    presentation:'Reuse existing CP consumer ownership/order and OffscreenCanvas; present final SWAP, not each DRAW.',
    constants:'Port Vulkan UpdateSystemConstantValues and its draw state, then use existing uniform repacker; intro adapter is intentionally narrow.'}};
fs.writeFileSync('artifacts/r5-menu/research-next-step.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({draws:report.draws,copies:report.copies,primitiveCounts:report.primitiveCounts,rectangleDraws:rectangleDraws.length,uniqueRectangleVS:report.uniqueRectangleVS,rejectedShaderDraws:rejectedDraws.length,rejectedPSCounts:report.rejectedPSCounts,vertexMemory:report.vertexMemory},null,2));
