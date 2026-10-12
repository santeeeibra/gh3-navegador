// Convert only the first useful original song UI pairs, using existing tools.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {readFrameCapture} from '../r5-menu/frame-reader.mjs';
import {createHash} from '../r5-menu/hash.mjs';
const selected=['B43CF443883B8351','526B394DE2AB8891','87D4CAE67E72C501','F34502A7B2BCEAB0','582ABCF5FF619A55','0295964C4221D881','80708BD1B82638B0','49284DED0773CE79','94B97981B512BDA2','423450BC1BF1038D'];
const out='artifacts/r5-live-song/shaders';for(const dir of ['input','spv','repacked','wgsl','logs'])fs.mkdirSync(out+'/'+dir,{recursive:true});
const cap=readFrameCapture(fs.readFileSync('artifacts/r5-live-song/capture-1/2/frame.r5f'),{hash:await createHash()}),manifest={};
const tool=path.resolve('artifacts/r4-shaders/build/xenos-to-spirv.exe');
for(const s of cap.shaders.values()){
 const id=s.hash.toString(16).toUpperCase().padStart(16,'0');if(!selected.includes(id))continue;
 const stage=s.stage?'frag':'vert',name=`shader_${id}.ucode.bin.${stage}`,input=out+'/input/'+name;
 fs.writeFileSync(input,s.ucode);
 const native='artifacts/g0/g0-native-slowride2/shaders/'+name;
 if(!fs.existsSync(native)||!fs.readFileSync(native).equals(Buffer.from(s.ucode)))throw Error('Native source mismatch/missing: '+id);
 const disasm=fs.readFileSync(native.replace('.ucode.bin.','.ucode.'),'utf8');
 const constants=[...new Set([...disasm.matchAll(/\bc(?:_abs\[)?(\d+)/g)].map(m=>Number(m[1])))].sort((a,b)=>a-b);
 const p=spawnSync(tool,[path.resolve(input),path.resolve(out+'/spv/'+name+'.spv'),'--single-memory'],{cwd:path.dirname(tool),encoding:'utf8',windowsHide:true,timeout:30000});
 fs.writeFileSync(out+'/logs/'+id+'.translate.txt',(p.stdout||'')+'\n'+(p.stderr||''));if(p.status!==0)throw Error('Translation failed: '+id);
 if(!p.stdout.includes('memexport=0'))throw Error('Memexport unsupported: '+id);
 manifest[id]={id,stage,constants,source:input,ucodeBytes:s.ucode.length,bindings:s.textureBindings};
}
fs.writeFileSync(out+'/manifest.json',JSON.stringify(manifest,null,2));
console.log('Selected shader source/float maps: '+Object.keys(manifest).length);
