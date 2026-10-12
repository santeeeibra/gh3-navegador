import {chromium} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {startServer} from './server.mjs';
const require=createRequire(new URL('../../toolchain/bottleship/package.json',import.meta.url));
const {PNG}=require('pngjs');
const OUT='D:/guitar hero/artifacts/graphics-probe/bottleship';
await mkdir(OUT,{recursive:true});
const ev={at:new Date().toISOString(),origin:'http://127.0.0.1:5188',profile:OUT+'/edge-profile',runtime:'existing BottleShip dist, read-only; no rebuild; separate origin',pageErrors:[],console:[],blockedRequests:[],samples:[]};
ev.runtimeIndexSha256=createHash('sha256').update(await readFile('D:/guitar hero/toolchain/bottleship/dist/index.html')).digest('hex');
const server=await startServer();let ctx;
try{
 ctx=await chromium.launchPersistentContext(ev.profile,{channel:'msedge',headless:true,viewport:{width:1000,height:760},args:['--enable-unsafe-webgpu','--autoplay-policy=no-user-gesture-required']});
 await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===ev.origin||['blob:','data:'].includes(u.protocol))return r.continue();ev.blockedRequests.push(u.href);return r.abort();});
 const page=ctx.pages()[0]??await ctx.newPage();page.on('pageerror',e=>ev.pageErrors.push(String(e)));page.on('console',m=>{if(ev.console.length<3000)ev.console.push(m.text());});
 await page.goto(ev.origin+'/?game=dev');
 await page.waitForFunction(()=>!!window.__BS__?.harness,{}, {timeout:60000});
 ev.environment=await page.evaluate(async()=>{const a=await navigator.gpu?.requestAdapter();return{isolated:crossOriginIsolated,gpu:a?{vendor:a.info.vendor,architecture:a.info.architecture,fallback:a.info.isFallbackAdapter}:null};});
 await page.evaluate(()=>window.__BS__.harness.rpc('logRing',[20000]));
 await page.evaluate(()=>{window.__probeOpen={state:'pending'};window.__BS__.harness.openWgb('http://127.0.0.1:5188/probe.wgb',{io:{mode:'stream'}}).then(r=>window.__probeOpen={state:'resolved',result:r}).catch(e=>window.__probeOpen={state:'rejected',error:String(e)});});
 const start=Date.now();
 for(let i=0;i<35;i++){
  await page.waitForTimeout(1000);
  const png=await page.screenshot({path:OUT+`/page-${i}.png`});const im=PNG.sync.read(png);let blue=0;
  for(let p=0;p<im.data.length;p+=4)if(im.data[p]===32&&im.data[p+1]===96&&im.data[p+2]===160)blue++;
  ev.samples.push({second:(Date.now()-start)/1000,bluePixels:blue});
  if(blue>100000){await writeFile(OUT+'/observed-blue.png',png);ev.observedBlue=true;
      const shot=await page.evaluate(()=>window.__BS__.harness.rpc('shot',[{source:'screen'}])).catch(e=>({error:String(e)}));
      if(shot?.base64){await writeFile(OUT+'/guest-screen.png',Buffer.from(shot.base64,'base64'));ev.guestShot=true;}
    }
  if(i%5===0)console.log(JSON.stringify(ev.samples.at(-1)));
 }
 ev.guestLog=await page.evaluate(()=>window.__BS__.harness.rpc('fsRead',['C:\\dx9-probe.log'])).catch(e=>({error:String(e)}));
 await writeFile(OUT+'/guest-log-response.json',JSON.stringify(ev.guestLog,null,2));
 ev.open=await page.evaluate(()=>window.__probeOpen);
 ev.report=await page.evaluate(()=>window.__BS__.harness.report()).catch(e=>({error:String(e)}));
 const logs=await page.evaluate(()=>window.__BS__.harness.rpc('logs',[20000]));await writeFile(OUT+'/runtime-logs.json',JSON.stringify(logs,null,2));
 ev.blueFrames=ev.samples.filter(x=>x.bluePixels>100000).length;
 ev.blueObserved=!!ev.observedBlue;
}catch(e){ev.error=String(e.stack??e);console.log(ev.error);}
finally{await writeFile(OUT+'/evidence.json',JSON.stringify(ev,null,2));if(ctx)await ctx.close();await new Promise(r=>server.close(r));}
console.log(JSON.stringify({blueObserved:ev.blueObserved,error:ev.error,blueFrames:ev.blueFrames}));


