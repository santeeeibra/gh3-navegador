import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const evidence={browser:browser.version(),at:new Date().toISOString(),pageErrors:[],externalRequests:[],ok:false};
try {
 const context=await browser.newContext();
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='127.0.0.1'||url.protocol==='blob:'||url.protocol==='data:')return route.continue();evidence.externalRequests.push(route.request().url());return route.abort();});
 const page=await context.newPage();page.on('pageerror',e=>evidence.pageErrors.push(e.message));
 await page.goto('http://127.0.0.1:5176/?game=dev');
 await page.waitForFunction(()=>!!window.__BS__?.harness,{},{timeout:60000});
 
evidence.environment=await page.evaluate(async()=>{const a=await navigator.gpu.requestAdapter();return {isolated:crossOriginIsolated,sab:typeof SharedArrayBuffer, gpu:{vendor:a?.info.vendor,architecture:a?.info.architecture,isFallback:a?.info.isFallbackAdapter}};});
 evidence.result=await page.evaluate(async()=>await Promise.race([(async()=>{for(let i=0;i<200;i++){try{return await window.__BS__.harness.d3d9Conformance({});}catch(e){if(!String(e).includes('no process')&&!String(e).includes('module not registered'))throw e;await new Promise(r=>setTimeout(r,100));}}throw new Error('Emulator not ready after 20s');})(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('D3D9 timeout 60s')),60000))]));
  evidence.mutations=await page.evaluate(async()=>{const h=window.__BS__.harness;const cases=await h.d3d9ConformanceMutations();const results=[];for(const m of cases){const r=await h.d3d9Conformance({mutate:m.name});results.push({name:m.name,groups:m.groups,result:r});}return results;});
 evidence.ok=evidence.result.failed===0&&evidence.mutations.every(m=>m.result.failed>0)&&evidence.pageErrors.length===0;
 console.log(JSON.stringify(evidence.result));
} catch(e){evidence.error=String(e);console.log(evidence.error);} finally {await browser.close();await writeFile('artifacts/research/bottleship-browser-verification.json',JSON.stringify(evidence,null,2));}
if(!evidence.ok)process.exitCode=1;




