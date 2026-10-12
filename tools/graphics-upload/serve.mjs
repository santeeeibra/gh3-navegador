import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const files=new Map([
 ['/', ['tools/graphics-upload/preview.html','text/html; charset=utf-8']],
 ['/preview.js',['tools/graphics-upload/preview.js','text/javascript']],
 ['/texture-upload.js',['src/original/graphics/texture-upload.js','text/javascript']],
 ['/build/probe.js',['artifacts/graphics-upload/build/probe.js','text/javascript']],
 ['/build/probe.wasm',['artifacts/graphics-upload/build/probe.wasm','application/wasm']],
 ['/graphics.html',['dist/graphics.html','text/html; charset=utf-8']],
 ['/graphics-app.js',['dist/graphics-app.js','text/javascript']],
 ['/style.css',['dist/style.css','text/css']],
 ['/original.html',['dist/original.html','text/html; charset=utf-8']],
 ['/original-app.js',['dist/original-app.js','text/javascript']]
]);
export function createPreviewServer(){return createServer(async(req,res)=>{
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cache-Control','no-store');
 const item=files.get(new URL(req.url,'http://localhost').pathname);
 if(!item){res.writeHead(404).end();return;}
 try{const bytes=await readFile(resolve(root,item[0]));res.setHeader('Content-Type',item[1]);res.end(bytes);}
 catch{res.writeHead(404).end('Archivo de la prueba no disponible');}
});}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const server=createPreviewServer();server.listen(Number(process.env.GRAPHICS_PREVIEW_PORT||5180),'127.0.0.1',()=>console.log('Adelanto gráfico: http://127.0.0.1:'+server.address().port+'/'));
}
