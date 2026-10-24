import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {chromium,webkit,devices} from 'playwright';
const root=path.resolve('artifacts/resolucion-interna/demo'),out=path.resolve('artifacts/resolucion-interna');
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://local').pathname.replace(/^\/gh3\//,'')||'index.html';
  const file=path.resolve(root,name);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.json':'application/json','.png':'image/png','.mp4':'video/mp4','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}/gh3/`,report={cases:[],engine_started:false};
try{
  for(const kind of ['edge','webkit']){
    const browser=await (kind==='edge'?chromium.launch({channel:'msedge',headless:true}):webkit.launch({headless:true}));
    try{
      const context=await browser.newContext(kind==='edge'?{viewport:{width:1440,height:900}}:{...devices['iPhone 11 landscape'],userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1'});
      await context.route('https://nvlwlmyuqorxaupcdbdb.supabase.co/**',route=>route.fulfill({status:204}));
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      page.setDefaultTimeout(7000);
      await page.goto(base+'?gfx=url&r5liveconsumer=r5snap-native60-colas.js',{waitUntil:'networkidle'});
      if(await page.locator('#gh3GpuCard').isVisible())await page.locator('#gh3GpuCard button').first().click();
      await page.locator('#gh3RenderScale').waitFor({state:'attached'});
      await page.evaluate(()=>{document.body.classList.add('loaderStarted','gh3DrawerOpen');document.querySelector('#gh3Panel .tabs [data-tab="gfx"]').click();});
      await page.locator('#gh3RenderScale').selectOption('0.75');
      assert.equal(await page.evaluate(()=>localStorage.getItem('gh3-render-scale')),'0.75');
      await page.reload({waitUntil:'networkidle'});
      if(await page.locator('#gh3GpuCard').isVisible())await page.locator('#gh3GpuCard button').first().click();
      assert.equal(await page.locator('#gh3RenderScale').inputValue(),'0.75');
      await page.evaluate(()=>{document.body.classList.add('loaderStarted','gh3DrawerOpen');document.querySelector('#gh3Panel .tabs [data-tab="gfx"]').click();});
      assert.match(await page.locator('#gh3RenderScaleStatus').textContent(),/Se aplicará al iniciar/);
      if(kind==='edge')await page.locator('#a60Sync').waitFor({state:'attached',timeout:4000});
      const rect=await page.locator('#gh3RenderScale').boundingBox();assert.ok(rect.height>=40);
      await page.locator('#gh3RenderScale').scrollIntoViewIfNeeded();
      const unobscured=await page.locator('#gh3RenderScale').evaluate(el=>{const r=el.getBoundingClientRect(),top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return top===el||el.contains(top);});
      assert.equal(unobscured,true,'Selector accesible, sin un cartel por encima');
      await page.locator('#gh3Panel').screenshot({path:path.join(out,`panel-${kind}.png`)});
      await page.goto(base+'?gfx=url&r5liveconsumer=r5snap-song-render.js',{waitUntil:'networkidle'});
      assert.equal(await page.locator('#gh3RenderScale').isDisabled(),true);
      assert.match(await page.locator('#gh3RenderScaleStatus').textContent(),/modo gráfico actual no admite/);
      // Windows WebKit lacks AudioContext; the existing loader already reports this.
      const unexpected=errors.filter(message=>kind!=='webkit'||!message.includes("Can't find variable: AudioContext"));
      assert.deepEqual(unexpected,[]);
      report.cases.push({kind,stored:true,touchHeight:rect.height,legacyDisabled:true,errors,unsupportedWebKitRuntime:kind==='webkit'});
      await context.close();
    }finally{await browser.close();}
  }
  report.pass=true;fs.writeFileSync(path.join(out,'ui-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
