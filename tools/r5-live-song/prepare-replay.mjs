// Offline fixtures only: never upload original captures or shader assets.
import fs from 'node:fs';
import {readFrameCapture,replayEvents} from '../r5-menu/frame-reader.mjs';
import {createHash} from '../r5-menu/hash.mjs';
import {prepareSongDraw} from './prepare.mjs';
const root=process.argv[2]||'artifacts/r5-live-song/capture-2/0',out='artifacts/r5-live-song/replay';
fs.mkdirSync(out,{recursive:true});
const shaders=JSON.parse(fs.readFileSync('artifacts/r5-live-song/shaders/manifest.json'));
for(const s of Object.values(shaders))s.code=fs.readFileSync(s.wgsl,'utf8');
const res=JSON.parse(fs.readFileSync(root+'/resources.json')).resources;
const read=(p,n)=>{
 const r=res.find(r=>p>=r.phys&&p+n<=r.phys+r.length);if(!r)throw Error('Missing resource');
 return new Uint8Array(fs.readFileSync(`${root}/${r.phys}-${r.length}.bin`)).slice(p-r.phys,p-r.phys+n);
};
const c=readFrameCapture(fs.readFileSync(root+'/frame.r5f'),{hash:await createHash()}),inputs=[],rejected={};
for(const d of replayEvents(c,0))if(d.type==='draw')try{
 const i=prepareSongDraw(d,read,shaders);
 inputs.push({manifest:i.manifest,assets:Object.fromEntries(Object.entries(i.assets).map(([k,v])=>[k,Array.from(v)]))});
}catch(e){rejected[e.message]=(rejected[e.message]||0)+1;}
fs.writeFileSync(out+'/fixture.json',JSON.stringify({source:root,shaders,inputs,rejected}));
console.log(JSON.stringify({draws:inputs.length,rejected}));
