import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {inflateRawSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {build} from 'esbuild';
import {selectedPackages,restoreSelection,songIds,discoverSongPackages} from './songs.mjs';
import {validateManifest} from './cache.mjs';
import {createLoaderServer} from './server.mjs';
const root=path.resolve('artifacts/all-songs'),m=validateManifest(JSON.parse(fs.readFileSync(root+'/catalog.json'))),assets=JSON.parse(fs.readFileSync(root+'/assets.json')),config=JSON.parse(fs.readFileSync(root+'/server-config.json'));
const ctx={window:{}};vm.runInNewContext(fs.readFileSync('tools/d1-wasm/gh3-song.js','utf8'),ctx);
const report={songs:[],pageErrors:[],checks:[]};
assert.equal(songIds(m).length,70);assert.equal(selectedPackages(m,'all').length,71);
assert.equal(selectedPackages(m,'first4').length,5);assert.throws(()=>selectedPackages(m,'../invalid'));
assert.equal(restoreSelection(m,['base','one']),'one');assert.equal(restoreSelection(m,selectedPackages(m,'all')),'all');
const minimal={packages:{base:m.packages.base,slowride:m.packages.slowride}};
assert.deepEqual(selectedPackages(minimal,'all'),['base','slowride']);assert.throws(()=>selectedPackages(minimal,'one'));
assert.throws(()=>discoverSongPackages(m.files.filter(f=>f.path.toLowerCase()!=='data/music/one.fsb.xen')));
for(const id of songIds(m)){
 const f=m.files[m.packages[id].files[0]],pak=new Uint8Array(inflateRawSync(fs.readFileSync(path.join(config.game,f.path))));
 const diffs={};for(const diff of ['easy','medium','hard','expert']){
  const chart=ctx.window.gh3Song.parseSongPak(pak,id,diff);assert.ok(chart.notes.length>0,id+' '+diff);assert.ok(chart.beats.length>0,id+' beats');
  assert.ok(chart.notes.every((n,i)=>n.t>=0&&n.len>=0&&(!i||n.t>=chart.notes[i-1].t)),id+' times');diffs[diff]=chart.notes.length;
 }
 report.songs.push({id,title:m.packages[id].title,notes:diffs});
}
report.checks.push('70 audio/chart packages; all 280 difficulty charts parsed; ordered times; missing audio rejected; selection and restoration; Slow Ride-only manifest stays restricted');
const server=createLoaderServer({root:root+'/demo',game:config.game,catalog:m,assets});await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.waitForFunction(()=>!document.getElementById('loaderPrepare').disabled||window.gh3Loader?.error);
 assert.equal(await page.evaluate(()=>gh3Loader.error),null);
 assert.equal(await page.locator('#loaderSongs option').count(),72);
 await page.selectOption('#loaderSongs','one');assert.equal(await page.locator('.trackList b').textContent(),'One');
 await page.selectOption('#loaderSongs','all');assert.equal(await page.locator('.trackList b').count(),70);
 await page.selectOption('#loaderSongs','first4');assert.equal(await page.locator('.trackList b').count(),4);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const fixture=await browser.newPage();await fixture.setContent('<div id="gameState"></div><div id="loaderStatus"></div><div id="box"></div>');
 const bundled=await build({entryPoints:['tools/local-loader/loading.mjs'],bundle:true,write:false,format:'iife',globalName:'Loading'});
 await fixture.addScriptTag({content:bundled.outputFiles[0].text});
 await fixture.evaluate(()=>{window.gh3Song={clock:()=>0};window.testState={manualNavigation:true};window.testView=Loading.createLoadingView(document.getElementById('box'),testState);testView.start();});
 assert.equal(await fixture.locator('#gameLoading').isVisible(),true);
 await fixture.evaluate(()=>testView.message({type:'g1eInput'}));await fixture.waitForTimeout(600);
 assert.equal(await fixture.locator('#gameLoading').isVisible(),false);
 await fixture.evaluate(()=>testView.fail('fixture failure'));assert.equal(await fixture.locator('#gameLoading').isVisible(),true);
 await fixture.close();report.checks.push('Manual song selection exposes menus after motor initialization; fatal errors remain visible');
 assert.equal(report.pageErrors.length,0);report.checks.push('Edge selector single/all/first4 and mobile width; game was not started');report.ok=true;
}finally{await browser?.close();await new Promise(r=>server.close(r));fs.writeFileSync(root+'/verification.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify({ok:report.ok,songs:report.songs.length,charts:report.songs.length*4,checks:report.checks,pageErrors:report.pageErrors}));
