import {chromium} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {startServer} from './server.mjs';
import {validateImage} from './image-check.mjs';
const require=createRequire(new URL('../../../toolchain/bottleship/package.json',import.meta.url));const {PNG}=require('pngjs');
const root='D:/guitar hero/artifacts/graphics-probe/extended';const origin='http://127.0.0.1:5188';
const server=await startServer();
try{for(const name of (process.argv[2]?[process.argv[2]]:['triangle','texture','shader'])){
 const OUT=root+'/'+name+'/bottleship';await mkdir(OUT,{recursive:true});
 const ev={name,at:new Date().toISOString(),origin,runtime:'existing dist read-only, no rebuild',blocked:[],errors:[],console:[],samples:[],visualPass:false};let ctx;
 try{
  ctx=await chromium.launchPersistentContext(root+'/edge-profile-'+name+'-'+(process.env.PROBE_REV??'baseline'),{channel:'msedge',headless:true,viewport:{width:1000,height:760},args:['--enable-unsafe-webgpu','--autoplay-policy=no-user-gesture-required']});
  await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin||['blob:','data:'].includes(u.protocol))return r.continue();ev.blocked.push(u.href);return r.abort();});
  const page=ctx.pages()[0]??await ctx.newPage();page.on('pageerror',e=>ev.errors.push(String(e)));page.on('console',m=>{if(ev.console.length<4000)ev.console.push(m.text());});
  await page.goto(origin+'/?game=dev');await page.waitForFunction(()=>!!window.__BS__?.harness,{}, {timeout:60000});
  ev.environment=await page.evaluate(async()=>{const a=await navigator.gpu?.requestAdapter();return {isolated:crossOriginIsolated,gpu:a?{vendor:a.info.vendor,architecture:a.info.architecture,fallback:a.info.isFallbackAdapter}:null};});
  await page.evaluate(()=>window.__BS__.harness.rpc('logRing',[20000]));
  await page.evaluate(url=>{window.__caseLoad={pending:true};window.__BS__.harness.openWgb(url,{io:{mode:'stream'}}).then(r=>window.__caseLoad={result:r}).catch(e=>window.__caseLoad={error:String(e)});},origin+'/'+name+'.wgb');
  const start=Date.now();
  for(let i=0;i<25;i++){
   await page.waitForTimeout(1000);
   const canvases=await page.locator('canvas').evaluateAll(cs=>cs.map((c,index)=>{const r=c.getBoundingClientRect();return {index,width:r.width,height:r.height,x:r.x,y:r.y};}).filter(c=>c.width>300&&c.height>200));
   const s={second:(Date.now()-start)/1000,canvases};
   if(canvases.length){const main=canvases.sort((a,b)=>b.width*b.height-a.width*a.height)[0];const png=await page.locator('canvas').nth(main.index).screenshot();s.image=validateImage(PNG.sync.read(png),name);if(s.image.pass&&!ev.visualPass){await writeFile(OUT+'/visible-canvas.png',png);await page.screenshot({path:OUT+'/visible-page.png'});ev.visualPass=true;ev.visibleCapture=s.image;}}
   if(i===5&&canvases.length){const main=canvases.sort((a,b)=>b.width*b.height-a.width*a.height)[0];await page.locator('canvas').nth(main.index).screenshot({path:OUT+'/attempted-visible-canvas.png'});await page.screenshot({path:OUT+'/attempted-visible-page.png'});}
   ev.samples.push(s);if(i%5===0)console.log(name,JSON.stringify({second:s.second,pass:s.image?.pass,actual:s.image?.samples.map(x=>x.actual)}));
  }
  ev.load=await page.evaluate(()=>window.__caseLoad);
  ev.guestLog=await page.evaluate(()=>window.__BS__.harness.rpc('fsRead',['C:\\dx9-probe.log'])).catch(e=>({error:String(e)}));
  if(ev.guestLog.content){await writeFile(OUT+'/dx9-probe.log',Buffer.from(ev.guestLog.content,ev.guestLog.encoding==='base64'?'base64':'utf8'));}
  ev.report=await page.evaluate(()=>window.__BS__.harness.report()).catch(e=>({error:String(e)}));
  const logs=await page.evaluate(()=>window.__BS__.harness.rpc('logs',[20000]));await writeFile(OUT+'/runtime-logs.json',JSON.stringify(logs,null,2));
  await page.screenshot({path:OUT+'/final-page.png'});
 }catch(e){ev.failure=String(e.stack??e);console.log(name,ev.failure);}
 finally{await writeFile(OUT+'/evidence.json',JSON.stringify(ev,null,2));if(ctx)await ctx.close();}
 const programLog=ev.guestLog?.content?Buffer.from(ev.guestLog.content,ev.guestLog.encoding==='base64'?'base64':'utf8').toString('utf8'):'';
 const duration=/stage=render-elapsed-ms result=0x([0-9A-F]+)/.exec(programLog);
 const apiPassed=/stage=exit-code result=0x00000000/.test(programLog)&&duration&&parseInt(duration[1],16)>=15000;
 if(!ev.visualPass||!apiPassed||ev.errors.length)process.exitCode=1;
 console.log(name,'visiblePass',ev.visualPass,'apiPassed',!!apiPassed);
}}finally{await new Promise(r=>server.close(r));}





