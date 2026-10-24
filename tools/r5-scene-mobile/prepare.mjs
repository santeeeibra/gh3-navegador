import fs from 'node:fs';import path from 'node:path';import {createHash as sha} from 'node:crypto';
import {createHash} from '../r5-menu/hash.mjs';import {readLiveDraws} from '../r5-live-song/live-reader.mjs';
const {createResourceReader,prepareLiveSongDraw}=await import(process.env.SCENE_FIXED?'./src/prepare.mjs':'../r5-live-song/live-prepare.mjs');
const root='artifacts/r5-scene-mobile',cap=process.argv[2]||root+'/runs/diagnostic-pc/capture-1',out=process.argv[3]||root+'/fixture';
fs.mkdirSync(out,{recursive:true});const c=JSON.parse(fs.readFileSync(cap+'/capture.json')),shaders=JSON.parse(fs.readFileSync(root+'/shaders.json'));
const ranges=c.resources.map(r=>({...r,data:new Uint8Array(fs.readFileSync(cap+`/${r.phys}-${r.length}.bin`))}));
const reader=createResourceReader((p,n)=>{const r=ranges.find(r=>r.phys<=p&&p+n<=r.phys+r.length);if(!r)throw Error('Missing captured resource '+p+':'+n);return r.data.slice(p-r.phys,p-r.phys+n);});reader.begin();
const ops=[],errors=[],hash=b=>sha('sha256').update(b).digest('hex');
for(const d of readLiveDraws(new Uint8Array(fs.readFileSync(cap+'/frame.r5f')),{hash:await createHash()})){
 try{
  const input=prepareLiveSongDraw(d,reader,shaders),dir=out+'/'+d.index;fs.mkdirSync(dir,{recursive:true});
  const assets={};for(const [name,b] of Object.entries(input.assets)){fs.writeFileSync(dir+'/'+name,b);assets[name]={file:d.index+'/'+name,bytes:b.length,sha256:hash(b)};}
  const textures=input.textures.map(t=>{const file=d.index+'/texture-'+t.slot+'.bin';fs.writeFileSync(out+'/'+file,t.texture.data);const {width,height,layers,cube,format,bytesPerRow,rowsPerImage,key,video,scene}=t.texture;return {...t,texture:{width,height,layers,cube,format,bytesPerRow,rowsPerImage,key,video,scene,file,sha256:hash(t.texture.data)}};});
  ops.push({manifest:input.manifest,assets,textures});
 }catch(e){errors.push({draw:d.index,vs:d.vs.toString(16),ps:d.ps.toString(16),error:e.message});}
}
fs.writeFileSync(out+'/fixture.json',JSON.stringify({capture:cap,ops,errors,resourceStats:reader.stats},null,1));
console.log(JSON.stringify({out,ops:ops.length,errors:errors.length}));
