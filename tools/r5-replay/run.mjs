import {readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const root=resolve(import.meta.dirname,'../..'),data=resolve(root,'artifacts/r5-replay/data');
const allowed=new Set(['manifest.json','vert.wgsl','frag.wgsl','system-gpu.bin','float-pixel.bin','fetch.bin','memory.bin','native-rgba.bin',...Array.from({length:4},(_,i)=>'texture-'+i+'.bin')]);
let uploaded=false;
const server=createServer(async(req,res)=>{try{
 if(req.method==='POST'&&req.url==='/gpu-rgba'){
  const chunks=[];let n=0;for await(const part of req){n+=part.length;if(n>1280*720*4)throw Error('Upload exceeds one frame');chunks.push(part);}
  if(n!==1280*720*4)throw Error('Wrong frame length');await writeFile(resolve(root,'artifacts/r5-replay/gpu-rgba.bin'),Buffer.concat(chunks));uploaded=true;res.end('saved');return;
 }
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>GH3 captured draw — local WebGPU replay</title><canvas></canvas><script type="module">import {replay} from "/replay.js";try{window.result=await replay();}catch(e){window.result={fatal:e.message,stack:e.stack}}finally{window.done=true}</script>');return;}
 if(req.url==='/intro-renderer.mjs'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(resolve(root,'tools/r5-runtime/intro-renderer.mjs')));return;}
 if(req.url==='/replay.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(resolve(root,'tools/r5-replay/replay.js')));return;}
 const name=req.url?.startsWith('/data/')?req.url.slice(6):'';if(!allowed.has(name)){res.statusCode=404;res.end();return;}
 res.end(await readFile(resolve(data,name)));
 }catch(e){res.statusCode=500;res.end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
const report={purpose:'One captured GH3 native draw replayed with translated shaders; no CPU/CP integration',pageErrors:[]};
try{browser=await chromium.launch({channel:'msedge',headless:true});report.browser=browser.version();
 const page=await browser.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.done,{},{timeout:120000});
 Object.assign(report,await page.evaluate(()=>window.result));report.frameUploaded=uploaded;
}catch(e){report.fatal=e.message;}finally{
 if(browser)await browser.close();await new Promise(r=>server.close(r));
 await writeFile(resolve(root,'artifacts/r5-replay/edge-replay.json'),JSON.stringify(report,null,2));
}
console.log(JSON.stringify({...report,comparison:report.comparison?{...report.comparison,rgbErrorHistogram:undefined}:undefined,negativeControl:report.negativeControl?{mutation:report.negativeControl.mutation,detected:report.negativeControl.detected,meanError:report.negativeControl.comparison.rgbMeanAbsoluteError}:undefined},null,2));
if(report.fatal||!report.renderSucceeded||report.pageErrors.length||!report.negativeControl?.detected)process.exitCode=1;
