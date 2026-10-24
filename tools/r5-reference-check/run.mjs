import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const root=resolve(import.meta.dirname,'../..');
const server=createServer(async(req,res)=>{if(req.url==='/probe.mjs'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(resolve(import.meta.dirname,'probe.mjs')));return;}if(req.url!=='/'){res.statusCode=404;res.end();return;}res.setHeader('Content-Type','text/html');res.end('<script type="module">import {probe} from "/probe.mjs";try{window.result=await probe()}catch(e){window.result={passed:false,fatal:e.message}}finally{window.done=true}</script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const report={purpose:'Own WGSL reproduces WebGPU queue upload ordering; not a GH3 or upstream game test',pageErrors:[]};
try{browser=await chromium.launch({channel:'msedge',headless:true});report.browser=browser.version();const page=await browser.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.done,{},{timeout:30000});Object.assign(report,await page.evaluate(()=>window.result));}catch(e){report.passed=false;report.fatal=e.message;}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));await writeFile(resolve(root,'artifacts/r5-reference-check/upload-order.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));if(!report.passed||report.pageErrors.length)process.exitCode=1;
