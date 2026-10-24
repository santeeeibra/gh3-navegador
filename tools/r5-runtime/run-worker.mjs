import {readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const root=resolve(import.meta.dirname,'../..');
const dataNames=new Set(['manifest.json','vert.wgsl','frag.wgsl','system-gpu.bin','float-pixel.bin','fetch.bin','memory.bin','native-rgba.bin',...Array.from({length:4},(_,i)=>'texture-'+i+'.bin')]);
const modules=new Set(['intro-renderer.mjs','worker-check.mjs']);
const server=createServer(async(req,res)=>{try{
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<script>const w=new Worker("/worker-check.mjs",{type:"module"});w.onmessage=e=>{window.result=e.data;window.done=true;w.terminate()};w.onerror=e=>{window.result={passed:false,fatal:e.message};window.done=true;w.terminate()};w.postMessage({})</script>');return;}
 const module=req.url?.slice(1);if(modules.has(module)){res.setHeader('Content-Type','text/javascript');res.end(await readFile(resolve(root,'tools/r5-runtime',module)));return;}
 const name=req.url?.startsWith('/data/')?req.url.slice(6):'';
 if(!dataNames.has(name)){res.statusCode=404;res.end();return;}
 res.end(await readFile(resolve(root,'artifacts/r5-replay/data',name)));
 }catch(e){res.statusCode=500;res.end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const report={pageErrors:[]};
try{
 browser=await chromium.launch({channel:'msedge',headless:true});report.browser=browser.version();const page=await browser.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.done,{},{timeout:120000});Object.assign(report,await page.evaluate(()=>window.result));
}catch(e){report.passed=false;report.fatal=e.message;}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));await writeFile(resolve(root,'artifacts/r5-runtime/worker-check.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));if(!report.passed||report.pageErrors.length)process.exitCode=1;
