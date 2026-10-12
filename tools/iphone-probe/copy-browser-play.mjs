import fs from 'node:fs/promises';
import path from 'node:path';
// Only the authorized one-song trial, never arbitrary game directories/artifacts.
export async function copyBrowserPlay(destination='dist/gh3',{local=false,programOnly=false}={}){
 const available=await fs.access('artifacts/unified-game/build-result.json').then(()=>true,()=>false);
 const approval=await fs.readFile('artifacts/unified-game/publication-approval.json','utf8').then(JSON.parse,()=>null);
 const unified=available&&(local||approval?.approved===true);
 const result=unified?JSON.parse(await fs.readFile('artifacts/unified-game/build-result.json','utf8')):null;
 const source=result?.source||'artifacts/browser-play/demo';
 if(!await fs.access(source+'/index.html').then(()=>true,()=>false))return false;
 const header=JSON.parse(await fs.readFile('artifacts/mobile-private/package-header.json','utf8'));
 const catalog=JSON.parse(await fs.readFile(source+'/manifest.json','utf8'));
 const names=result?.staticNames||header.static.map(f=>f.url.split('/').at(-1));
 if(names.some(n=>!/^[a-zA-Z0-9._-]+$/.test(n)))throw Error('Ruta de programa inválida.');
 const hashes=[...new Set((unified?catalog.files:[...catalog.packages.base.files,...catalog.packages.slowride.files].map(i=>catalog.files[i])).flatMap(f=>f.chunks.map(c=>c.hash)))];
 if(hashes.some(h=>!/^[a-f0-9]{64}$/.test(h)))throw Error('Parte inválida.');
 const files=[...names,'manifest.json',...hashes.map(h=>'chunks/'+h)];
 // Remove stale generated files only inside this output directory.
 const outputRoot=path.resolve(destination),workspace=path.resolve('.');
 if(!outputRoot.startsWith(workspace+path.sep)||!['dist','.vercel'].includes(path.relative(workspace,outputRoot).split(path.sep)[0]))throw Error('Destino fuera de los outputs del proyecto.');
 const allowed=new Set(files);
 async function clean(directory,prefix=''){
   for(const entry of await fs.readdir(directory,{withFileTypes:true}).catch(()=>[])){
     if(entry.isSymbolicLink())throw Error('No se siguen enlaces en el output.');
     const name=prefix+entry.name,absolute=path.join(directory,entry.name);
     if(entry.isDirectory())await clean(absolute,name+'/');
     else if(!allowed.has(name))await fs.unlink(absolute);
   }
 }
 await clean(outputRoot);
 await fs.mkdir(destination+'/chunks',{recursive:true});
 for(const file of files){
   const target=path.join(destination,file);
   if(programOnly&&file.startsWith('chunks/')){
     const [present,expected]=await Promise.all([fs.stat(target).catch(()=>null),fs.stat(source+'/'+file)]);
     if(!present||present.size!==expected.size)throw Error('Falta un recurso local; ejecutar el build completo: '+file);
   }else await fs.copyFile(source+'/'+file,target);
 }
 // Project-owned controls override the historical generated delivery.
 await fs.copyFile('src/original/gh3-touch.js',path.join(destination,'gh3-touch.js'));
 await fs.copyFile('src/original/gh3-diag.js',path.join(destination,'gh3-diag.js'));
 return files.length;
}
