import {chromium} from 'playwright';import {writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
const evidence={browser:browser.version(),verifiedAt:new Date().toISOString(),results:[],pageErrors:[],ok:false};
try{
 for(const backend of ['webgpu','webgl2']){
  const page=await browser.newPage({viewport:{width:1200,height:900},deviceScaleFactor:2});page.on('pageerror',e=>evidence.pageErrors.push(e.message));
  await page.goto(`http://localhost:5175/graphics.html?backend=${backend}&readback=1&debug=1`);
  await page.waitForFunction(()=>window.__graphicsProbe||!document.querySelector('#graphics-restart').hidden);
  assert.ok(await page.evaluate(()=>!!window.__graphicsProbe),await page.locator('#graphics-status').textContent());
  await page.evaluate(()=>window.__graphicsProbe.pause());
  for(const profile of ['performance','optimal','quality','performance']){
   await page.selectOption('#graphics-profile',profile);
   const result=await page.evaluate(async()=>{
    const probe=window.__graphicsProbe,r=probe.renderer;
    r.uploadTexture({width:2,height:2,data:new Uint8Array(16).fill(255)});
    const triangle=(z,color)=>[-.8,-.8,z,1,...color,0,0, .8,-.8,z,1,...color,1,0, 0,.8,z,1,...color,.5,1];
    r.draw(new Float32Array([...triangle(.25,[1,0,0]),...triangle(.75,[0,0,1])]));
    return await probe.capture();
   });
   assert.ok(result.center[0]>240&&result.center[1]<10&&result.center[2]<10,'La profundidad debe conservar el triangulo rojo cercano');assert.deepEqual(result.errors,[]);assert.ok(result.gpu,'Se registra la GPU');
   evidence.results.push(result);console.log(result.backend,profile,result.plan.width+'x'+result.plan.height,'MSAA',result.plan.samples,'pixel',result.center);
  }
  await page.selectOption('#graphics-profile','quality');await page.reload();await page.waitForFunction(()=>window.__graphicsProbe);assert.equal(await page.locator('#graphics-profile').inputValue(),'quality');
  
  const msaa=await page.evaluate(async()=>{
   const r=window.__graphicsProbe.renderer;window.__graphicsProbe.pause();
   const supported=r.limits.samples;const scans=[];
   r.uploadTexture({width:2,height:2,data:new Uint8Array(16).fill(255)});
   for(const samples of [1,4]){
    r.limits.samples=[samples];r.resize('quality',{width:64,height:64,pixelRatio:1});
    r.draw(new Float32Array([-1,-1,.5,1,1,0,0,0,0, 1,-1,.5,1,1,0,0,1,0, -1,1,.5,1,1,0,0,0,1]));await r.flush();
    const reds=[];for(let x=16;x<25;x++)reds.push((await r.readPixel(x,20))[0]);scans.push({samples:r.plan.samples,reds});
   }
   r.limits.samples=supported;window.__graphicsProbe.setProfile('quality');return {backend:r.backend,scans};
  });
  assert.ok(msaa.scans[1].reds.some(v=>v>15&&v<245),'MSAA debe producir cobertura parcial en el borde');
  assert.ok(msaa.scans[0].reds.every(v=>v<15||v>245),'Sin MSAA el borde debe tener cobertura binaria');
  evidence.msaaEdges??=[];evidence.msaaEdges.push(msaa);
  await page.evaluate(()=>window.__graphicsProbe.resume());
  await page.screenshot({path:`artifacts/graphics/shot-${backend}.png`,fullPage:true});await page.close();
 }
 const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:3});mobile.on('pageerror',e=>evidence.pageErrors.push(e.message));
 await mobile.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true}));
 await mobile.goto('http://localhost:5175/graphics.html');await mobile.waitForFunction(()=>window.__graphicsProbe);
 const fallback=await mobile.evaluate(async()=>{window.__graphicsProbe.pause();return {...await window.__graphicsProbe.capture(),overflow:document.documentElement.scrollWidth>innerWidth};});
 assert.equal(fallback.backend,'WebGL 2');assert.equal(fallback.overflow,false);assert.deepEqual(fallback.errors,[]);evidence.mobileFallback=fallback;
 await mobile.screenshot({path:'artifacts/graphics/shot-mobile-fallback.png',fullPage:true});
 await mobile.goto('http://localhost:5175/original.html');assert.equal(await mobile.locator('#graphics-profile').inputValue(),'optimal');await mobile.selectOption('#graphics-profile','performance');await mobile.goto('http://localhost:5175/graphics.html');await mobile.waitForFunction(()=>window.__graphicsProbe);assert.equal(await mobile.locator('#graphics-profile').inputValue(),'performance');evidence.preferenceShared=true;
 
 evidence.recovery=[];
 for(const backend of ['webgpu','webgl2']){
  const page=await browser.newPage();page.on('pageerror',e=>evidence.pageErrors.push(e.message));
  await page.goto(`http://localhost:5175/graphics.html?backend=${backend}`);await page.waitForFunction(()=>window.__graphicsProbe);
  const gpu=await page.evaluate(()=>window.__graphicsProbe.renderer.metadata);assert.equal(gpu.readback,false);
  // Deterministic lifecycle reproduction; explicitly separate from a real bfcache hit.
  await page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));if(window.__graphicsProbe)throw Error('Renderer no liberado');dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
  await page.waitForFunction(()=>window.__graphicsProbe);let frames=await page.evaluate(()=>window.__graphicsEvidence.frames);
  await page.waitForFunction(n=>window.__graphicsEvidence.frames>n,frames);
  for(const profile of ['quality','performance']){await page.selectOption('#graphics-profile',profile);await page.waitForFunction(()=>window.__graphicsEvidence.frames>0);await page.evaluate(()=>window.__graphicsProbe.renderer.flush());}
  await page.goto('http://localhost:5175/original.html');await page.goBack();await page.waitForFunction(()=>window.__graphicsProbe);frames=await page.evaluate(()=>window.__graphicsEvidence.frames);await page.waitForFunction(n=>window.__graphicsEvidence.frames>n,frames);
  const loss=await page.evaluate(()=>{const r=window.__graphicsProbe.renderer;if(r.device){r.device.destroy();return 'device.destroy';}const ext=r.gl.getExtension('WEBGL_lose_context');if(!ext)throw Error('No hay extension de perdida');ext.loseContext();return 'WEBGL_lose_context';});
  await page.waitForFunction(()=>!document.querySelector('#graphics-restart').hidden);
  const lossMessage=await page.locator('#graphics-status').textContent();await page.locator('#graphics-restart').click();await page.waitForFunction(()=>window.__graphicsProbe);frames=await page.evaluate(()=>window.__graphicsEvidence.frames);await page.waitForFunction(n=>window.__graphicsEvidence.frames>n,frames);
  evidence.recovery.push({backend,gpu,lifecycleEvents:true,navigationBack:true,forcedLoss:loss,lossMessage,restarted:true});await page.close();
 }
 evidence.ok=!evidence.pageErrors.length;
}catch(e){evidence.error=String(e);console.error(e);process.exitCode=1;}
finally{await writeFile('artifacts/graphics/browser-verification.json',JSON.stringify(evidence,null,2));await browser.close();}
