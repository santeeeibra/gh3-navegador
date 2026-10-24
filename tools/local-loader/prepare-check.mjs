import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createLoaderServer} from './server.mjs';
const root=path.resolve('artifacts/local-loader'),catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json'))),assets=JSON.parse(fs.readFileSync(path.join(root,'assets.json'))),config=JSON.parse(fs.readFileSync(path.join(root,'server-config.json')));
const out=path.join(root,'prepare-check');fs.mkdirSync(out,{recursive:true});
const report={pageErrors:[],requests:0,bytes:0,rounds:[]};let ctx;
const server=createLoaderServer({root:path.join(root,'demo'),game:config.game,catalog,assets,onRequest:p=>{if(p.startsWith('/local-chunk/'))report.requests++;}});
await new Promise(r=>server.listen(5441,'127.0.0.1',r));
const profile=path.join(out,'edge-profile');
try{
  for(const round of [1,2]){
    ctx=await chromium.launchPersistentContext(profile,{channel:'msedge',headless:true,viewport:{width:1400,height:1000}});
    const page=ctx.pages()[0];page.on('pageerror',e=>report.pageErrors.push(e.message));
    if(round===2)await page.route('**/local-chunk/**',r=>r.abort());
    await page.goto('http://127.0.0.1:5441/');
    await page.waitForFunction(()=>window.gh3Loader&&(!document.getElementById('loaderPrepare').disabled||window.gh3Loader.error),{},{timeout:20000});
    if(round===1)await page.click('#loaderPrepare');
    await page.waitForFunction(()=>window.gh3Loader?.ready||window.gh3Loader?.error,{},{timeout:240000});
    const status=await page.evaluate(()=>({ready:gh3Loader.ready,error:gh3Loader.error,stats:gh3Loader.stats,status:document.getElementById('loaderStatus').textContent,charts:gh3LoaderFiles?.map(f=>({name:f.name,size:f.size})),mounted:picked.length,hasPicker:document.getElementById('dir').getClientRects().length>0,selected:document.getElementById('loaderSongs').value}));
    report.rounds.push({round,...status});assert.equal(status.error,null);assert.equal(status.ready,true);assert.equal(status.mounted,catalog.files.length);assert.equal(status.charts.length,4);assert.equal(status.hasPicker,false);
    if(round===1){
      report.parsedCharts=await page.evaluate(async()=>{const out=[];for(const name of ['slowride','talkdirtytome','hitmewithyourbestshot','storyofmylife']){const c=await gh3Song.loadFromFiles(gh3LoaderFiles,name,'medium');out.push({name,notes:c.notes.length,beats:c.beats.length});}return out;});
      assert.equal(report.parsedCharts.length,4);assert.ok(report.parsedCharts.every(c=>c.notes>100));
    }
    if(round===2){assert.equal(status.stats.downloaded,0);assert.equal(status.stats.cached,status.stats.total);}
    await page.screenshot({path:path.join(out,`ready-${round}.png`),fullPage:true});await ctx.close();ctx=null;
  }
  assert.equal(report.pageErrors.length,0);report.ok=true;
}catch(e){report.error=e.stack;report.ok=false;process.exitCode=1;}
finally{await ctx?.close();await new Promise(r=>server.close(r));const data=JSON.stringify(report,null,2);fs.writeFileSync(path.join(out,'verification.json'),data);fs.writeFileSync(path.join(out,`verification-${Date.now()}.json`),data);}
console.log(JSON.stringify(report));
