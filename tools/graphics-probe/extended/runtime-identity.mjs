import {readFile,readdir,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const root='D:/guitar hero';const dist=root+'/toolchain/bottleship/dist';
const paths=['index.html','v86.wasm',...(await readdir(dist+'/assets')).filter(x=>x.endsWith('.js')).map(x=>'assets/'+x)];
const identities=[];for(const name of paths){const data=await readFile(dist+'/'+name);identities.push({name,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});}
await writeFile(root+'/artifacts/graphics-probe/extended/runtime-identities.json',JSON.stringify({runtime:'existing dist served read-only; not Claude active Vite source',identities},null,2));
