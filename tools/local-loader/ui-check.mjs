import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createLoaderServer} from './server.mjs';
const root=path.resolve('artifacts/local-loader'),out=path.join(root,'ui-check');fs.mkdirSync(out,{recursive:true});
const catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json'))),assets=JSON.parse(fs.readFileSync(path.join(root,'assets.json'))),config=JSON.parse(fs.readFileSync(path.join(root,'server-config.json')));
const server=createLoaderServer({root:path.join(root,'demo'),game:config.game,catalog,assets});await new Promise(r=>server.listen(5441,'127.0.0.1',r));
const report={pageErrors:[],checks:[]};let ctx;
try{
  ctx=await chromium.launchPersistentContext(path.join(root,'prepare-check/edge-profile'),{channel:'msedge',headless:true,viewport:{width:1400,height:1000}});
  const page=ctx.pages()[0];page.on('pageerror',e=>report.pageErrors.push(e.message));await page.goto('http://127.0.0.1:5441/');
  await page.waitForFunction(()=>window.gh3Loader?.ready||window.gh3Loader?.error,{},{timeout:60000});
  assert.equal(await page.evaluate(()=>gh3Loader.ready),true);assert.equal(await page.locator('#loaderPercent').textContent(),'100 %');
  assert.ok(await page.locator('#controllerGuide').isVisible());assert.equal(await page.locator('.guideRow[data-action=verde] .padGlyph').textContent(),'A');
  await page.click('[data-platform=ps4]');assert.equal(await page.locator('.guideRow[data-action=verde] .padGlyph').textContent(),'✕');assert.equal(await page.locator('.guideRow[data-action=rojo] .padGlyph').textContent(),'○');
  await page.selectOption('#guideContext','song');assert.equal(await page.locator('.guideRow[data-action=verde] .padGlyph').textContent(),'L2');assert.equal(await page.locator('.guideRow[data-action=azul] .padGlyph').textContent(),'R2');
  await page.click('[data-platform=xbox]');assert.equal(await page.locator('.guideRow[data-action=verde] .padGlyph').textContent(),'LT');
  // The guide must follow the actual existing saved-key capture, including reset.
  await page.evaluate(()=>gh3Input.capture('verde',1,()=>{}));await page.keyboard.press('j');await page.waitForTimeout(400);assert.ok((await page.locator('.guideRow[data-action=verde] .keycaps').textContent()).includes('J'));
  await page.evaluate(()=>gh3Input.resetBinds());await page.waitForTimeout(400);
  await page.locator('body').click({position:{x:5,y:5}});await page.keyboard.down('a');assert.ok(await page.locator('.guideRow[data-action=verde]').evaluate(el=>el.classList.contains('held')));await page.keyboard.up('a');assert.ok(!await page.locator('.guideRow[data-action=verde]').evaluate(el=>el.classList.contains('held')));
  await page.selectOption('#guideContext','auto');await page.click('[data-platform=ps4]');
  await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  report.checks.push('Exact menu/song Xbox/PS4 equivalences; saved rebind/reset; held-key feedback; 100% preparation; desktop and 390px without horizontal overflow');
  // An isolated state fixture tests loading signals without starting GH3/GPU.
  const fixture=await ctx.newPage();fixture.on('pageerror',e=>report.pageErrors.push(e.message));
  await fixture.route('**/loading-fixture',r=>r.fulfill({contentType:'text/html',body:'<html lang="es"><body><div id="gameState"></div><div id="loaderStatus"></div><div id="navStat"></div><ol id="songSteps"></ol><div id="box"></div></body></html>'}));
  await fixture.route('**/loading-test.mjs',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync('tools/local-loader/loading.mjs','utf8')}));
  await fixture.goto('http://127.0.0.1:5441/loading-fixture');
  await fixture.evaluate(async()=>{const now=performance.now.bind(performance);window.timeJump=0;performance.now=()=>now()+timeJump;window.clock=0;window.gh3Song={clock:()=>clock};window.testState={};window.view=(await import('/loading-test.mjs')).createLoadingView(document.getElementById('box'),testState);view.start();view.message({type:'engineLoad',loaded:50,total:100,done:false});});
  await fixture.waitForTimeout(600);assert.ok((await fixture.locator('#loadDetail').textContent()).includes('50 %'));
  await fixture.evaluate(()=>view.message({type:'mark',what:'wasm listo'}));await fixture.waitForTimeout(600);assert.equal(await fixture.evaluate(()=>testState.phase),'navigation');
  await fixture.evaluate(()=>{window.navSeen={menu:true};document.getElementById('navStat').textContent='Menú principal → Carrera…';});await fixture.waitForTimeout(600);assert.equal(await fixture.locator('#loadTitle').textContent(),'Entrando a Carrera');
  await fixture.evaluate(()=>timeJump+=25000);await fixture.waitForTimeout(600);assert.ok(await fixture.locator('#loadWait').isVisible());assert.ok(await fixture.locator('#loadRetry').isVisible());
  await fixture.evaluate(()=>{window.songPak='slowride';view.message({type:'log'});});await fixture.waitForTimeout(600);assert.equal(await fixture.evaluate(()=>testState.phase),'song');
  await fixture.screenshot({path:path.join(out,'loading-fixture.png')});
  await fixture.evaluate(()=>clock=-1000);await fixture.waitForTimeout(600);assert.ok(!await fixture.locator('#gameLoading').isVisible());
  await fixture.evaluate(()=>clock=0);await fixture.waitForTimeout(600);assert.ok(!await fixture.locator('#gameLoading').isVisible());
  await fixture.evaluate(()=>view.message({type:'exit',code:'abort',what:'fixture failure'}));await fixture.waitForTimeout(600);assert.ok(await fixture.locator('#gameLoading').isVisible());assert.ok((await fixture.locator('#loadDetail').textContent()).includes('fixture failure'));assert.ok(await fixture.locator('#loadRetry').isVisible());
  report.checks.push('Measured engine progress; runtime/menu/song milestones; idle warning/retry; countdown clears overlay; menus stay usable; fatal error remains visible');
  assert.equal(report.pageErrors.length,0);report.ok=true;
}catch(e){report.ok=false;report.error=e.stack;process.exitCode=1;}
finally{await ctx?.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
