import fs from 'node:fs';
import {createHash as sha} from 'node:crypto';
import {createHash} from '../r5-menu/hash.mjs';
import {readLiveDraws} from '../r5-live-song/live-reader.mjs';
import {createResourceReader} from './snapshot-prepare.mjs';
import {prepareNativeDraw} from './prepare.mjs';
const cap=process.argv[2]||'artifacts/r5-scene-mobile/runs/fixed2-pc-capture/capture-1',out=process.argv[3]||'artifacts/r5-native60/fixture';
fs.mkdirSync(out,{recursive:true});
const info=JSON.parse(fs.readFileSync(cap+'/capture.json')),ranges=info.resources.map(r=>({...r,data:new Uint8Array(fs.readFileSync(cap+`/${r.phys}-${r.length}.bin`))}));
const resources=createResourceReader((p,n)=>{const r=ranges.find(r=>r.phys<=p&&p+n<=r.phys+r.length);if(!r)throw Error('Missing resource '+p);return r.data.subarray(p-r.phys,p-r.phys+n);});resources.begin();
const shaders=JSON.parse(fs.readFileSync('artifacts/r5-native60/shaders.json')),ops=[],errors=[],hash=b=>sha('sha256').update(b).digest('hex');
for(const d of readLiveDraws(new Uint8Array(fs.readFileSync(cap+'/frame.r5f')),{hash:await createHash()})){
 try{
  const input=prepareNativeDraw(d,resources,shaders),dir=out+'/'+d.index;fs.mkdirSync(dir,{recursive:true});
  const assets={};for(const [name,data] of Object.entries(input.assets)){fs.writeFileSync(dir+'/'+name,data);assets[name]={file:d.index+'/'+name,sha256:hash(data)};}
  const textures=input.textures.map(t=>{const file=d.index+'/texture-'+t.slot+'.bin';fs.writeFileSync(out+'/'+file,t.texture.data);const {data,raw,last,...texture}=t.texture;return {...t,texture:{...texture,file,sha256:hash(data)}};});
  ops.push({manifest:input.manifest,assets,textures});
 }catch(error){errors.push({draw:d.index,vs:d.vs.toString(16),ps:d.ps.toString(16),error:error.message});}
}
fs.writeFileSync(out+'/fixture.json',JSON.stringify({capture:cap,ops,errors,resourceStats:resources.stats},null,1));
console.log(JSON.stringify({out,draws:ops.length,rejected:errors.length}));
