import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';

const root=path.resolve('artifacts/ui-layout/demo'),out=path.resolve('artifacts/ui-layout');
const server=http.createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\/gh3\//,'')||'index.html';
  const file=path.resolve(root,name);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.json':'application/json','.wasm':'application/wasm','.woff2':'font/woff2','.png':'image/png','.webmanifest':'application/manifest+json','.mp4':'video/mp4'})[path.extname(file)]||'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/gh3/`;
const report={checks:[],errors:[],sizes:[]};let browser;
const check=(name,value)=>{assert.ok(value,name);report.checks.push(name);console.log('OK '+name);};
async function preview(page){
  await page.evaluate(()=>{
    document.body.classList.add('loaderStarted');
    document.getElementById('r5Box').hidden=false;
    const c=document.getElementById('r5Canvas'),ctx=c.getContext('2d');
    ctx.fillStyle='#100d16';ctx.fillRect(0,0,c.width,c.height);
    ctx.textAlign='center';ctx.fillStyle='#c9a45c';ctx.font='500 32px system-ui';ctx.fillText('VISTA PREVIA DE DISTRIBUCIÓN',c.width/2,c.height/2-10);
    ctx.fillStyle='#a99fb6';ctx.font='22px system-ui';ctx.fillText('Aquí se muestra el juego · proporción 16:9',c.width/2,c.height/2+40);
    window.__previewSong=false;window.gh3Input.songMode=()=>window.__previewSong;
    const sab=new SharedArrayBuffer(128);window.gh3Input.attach(sab,0);
  });
  await page.waitForTimeout(1000);
}
try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:800}});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(url,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelector('#gh3Row[data-workspace-ready]')&&window.gh3Input?.getBinds);
  await page.waitForFunction(()=>document.querySelector('#gh3Promo video')&&document.querySelector('#controllerGuide')?.parentElement.id==='gh3ControlsRail');
  for(const [width,height] of [[1570,833],[1440,800],[1280,560],[1024,480]]) {
    await page.setViewportSize({width,height});await page.waitForTimeout(150);
    const landing=await page.evaluate(()=>{
      const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,right:r.right,bottom:r.bottom};};
      return {guide:rect('gh3ControlsRail'),center:rect('gh3LandingStage'),panel:rect('gh3Panel'),play:rect('loaderPlay'),height:document.documentElement.scrollHeight,width:document.documentElement.scrollWidth,parent:document.getElementById('controllerGuide').parentElement.id};
    });
    check('Portada '+width+'×'+height+': guía izquierda, Jugar centro y panel derecha',landing.parent==='gh3ControlsRail'&&landing.guide.right<landing.center.x&&landing.center.right<landing.panel.x&&await page.locator('#loaderPlay').isVisible()&&await page.locator('#gh3Panel .top').isVisible());
    check('Portada '+width+'×'+height+': Jugar y pestañas sin scroll global',landing.height<=height+1&&landing.width<=width+1&&landing.play.bottom<=height);
    await page.screenshot({path:out+'/landing-'+width+'x'+height+'.png'});
  }
  await page.setViewportSize({width:1440,height:800});
  check('Portada no envía botones ni trucos antes del motor',await page.locator('#gh3Start').isDisabled()&&await page.locator('#gh3CheatSongs').isDisabled());
  await preview(page);
  check('Al conectar entrada se habilitan botones del juego',await page.locator('#gh3Start').isEnabled()&&await page.locator('#gh3CheatSongs').isEnabled());
  console.log('Preview game',await page.locator('#r5Canvas').evaluate(el=>{const a=[];while(el){a.push({id:el.id,display:getComputedStyle(el).display,hidden:el.hidden,w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height});el=el.parentElement;}return a;}));
  check('STRUM tiene atajo K además de flecha',await page.evaluate(()=>gh3Input.getBinds()['rasgueo abajo'].includes('KeyK')));
  await page.locator('#r5Canvas').click();await page.keyboard.down('KeyK');
  check('K envía rasgueo al mando compartido',await page.evaluate(()=>(gh3Input.stats.buttons&2)!==0));await page.keyboard.up('KeyK');
  await page.locator('.tabs [data-tab="sound"]').click();
  check('Guía de calibración incluye teclado Xbox PlayStation y guitarra',await page.locator('#gh3CalibrationHelp').textContent().then(t=>t.includes('STRUM')&&t.includes('Xbox')&&t.includes('PlayStation')&&t.includes('barra de rasgueo')&&t.includes('Calibrate Lag')));
  await page.locator('#gh3Vol').focus();await page.locator('#gh3FocusGame').click();
  check('Volver al juego quita foco de ajustes',await page.evaluate(()=>document.activeElement.id==='r5Canvas'));
  await page.keyboard.down('KeyK');check('STRUM funciona después de tocar Sonido',await page.evaluate(()=>(gh3Input.stats.buttons&2)!==0));await page.keyboard.up('KeyK');
  for(const [name,id] of [['Xbox','Xbox 360 Controller (STANDARD GAMEPAD)'],['PlayStation','Wireless Controller (STANDARD GAMEPAD)']]) {
    await page.evaluate(id=>{
      window.__testPad={id,index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:16},()=>({pressed:false,touched:false,value:0}))};
      Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.__testPad]});
    },id);
    for(const [index,bit] of [[12,1],[13,2]]){
      await page.evaluate(index=>{window.__testPad.buttons[index]={pressed:true,touched:true,value:1};},index);await page.waitForTimeout(40);
      check(`${name} cruceta ${index===12?'↑':'↓'} envía STRUM`,await page.evaluate(bit=>(gh3Input.stats.buttons&bit)!==0,bit));
      await page.evaluate(index=>{window.__testPad.buttons[index]={pressed:false,touched:false,value:0};},index);await page.waitForTimeout(40);
      check(`${name} soltar cruceta libera STRUM`,await page.evaluate(()=>(gh3Input.stats.buttons&3)===0));
    }
  }
  await page.evaluate(()=>Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[]}));
  for(const [width,height] of [[1920,925],[1440,800],[1366,650],[1280,560],[1024,600],[1024,480]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(400);
    await page.waitForFunction(()=>document.body.classList.contains('gh3Workspace')&&document.getElementById('controllerGuide').parentElement.id==='gh3ControlsRail');
    const layout=await page.evaluate(()=>{
      const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
      return {guide:rect('gh3ControlsRail'),game:rect('r5Box'),panel:rect('gh3Panel'),start:rect('gh3Start'),full:rect('gh3Full2'),rows:[...document.querySelectorAll('#guideRows .guideRow')].filter(el=>el.getClientRects().length).map(el=>({action:el.dataset.action,bottom:el.getBoundingClientRect().bottom})),scrollH:document.documentElement.scrollHeight,scrollW:document.documentElement.scrollWidth,bodyH:document.body.scrollHeight,innerH:innerHeight,innerW:innerWidth,parent:document.getElementById('controllerGuide').parentElement.id};
    });
    report.sizes.push({width,height,...layout});
    await page.screenshot({path:out+`/desktop-${width}x${height}.png`});
    check(`${width}×${height}: tres columnas`,layout.guide.right<layout.game.x&&layout.game.right<layout.panel.x&&layout.parent==='gh3ControlsRail');
    check(`${width}×${height}: guía completa y botones dentro de ventana`,layout.rows.every(r=>r.bottom<=height)&&layout.full.bottom<=height&&layout.start.bottom<=height&&layout.panel.bottom<=height+1);
    check(`${width}×${height}: sin scroll de página`,layout.scrollH<=height+1&&layout.scrollW<=width+1);
    check(`${width}×${height}: imagen 16:9`,Math.abs(layout.game.w/layout.game.h-16/9)<.02);
  }
  await page.setViewportSize({width:1440,height:800});
  for(const tab of ['keys','sound','gfx','save','cheats']){
    await page.locator(`.tabs [data-tab="${tab}"]`).click();
    check(`Pestaña ${tab} mantiene guía visible`,await page.locator('#controllerGuide').isVisible());
    check(`Pestaña ${tab} muestra su contenido`,await page.locator(`#gh3SettingsBody section[data-tab="${tab}"]`).isVisible());
  }
  check('Trucos queda al lado de Partida',await page.locator('.tabs [data-tab="save"] + [data-tab="cheats"]').count()===1);
  check('Cheats fuera de Partida',await page.locator('section[data-tab="save"] #gh3CheatList').count()===0&&await page.locator('section[data-tab="cheats"] #gh3CheatSongs').count()===1);
  await page.locator('.tabs [data-tab="save"]').click();
  check('Volver a Partida oculta Trucos',!await page.locator('section[data-tab="cheats"]').isVisible());
  await page.locator('.tabs [data-tab="cheats"]').click();
  await page.screenshot({path:out+'/desktop-trucos.png'});
  await page.locator('.tabs [data-tab="keys"]').click();
  await page.locator('#gh3Keys tr').first().locator('button').first().click();await page.keyboard.press('KeyJ');await page.waitForTimeout(500);
  check('Cambiar tecla actualiza guía izquierda',await page.locator('.guideRow[data-action="verde"] .keycaps').textContent().then(t=>t.includes('J')));
  await page.locator('#gh3Start').click();await page.keyboard.down('KeyJ');
  check('Tecla configurada mantiene respuesta visual',await page.locator('.guideRow[data-action="verde"]').evaluate(el=>el.classList.contains('held')));
  await page.keyboard.up('KeyJ');
  check('Soltar libera respuesta visual',!await page.locator('.guideRow[data-action="verde"]').evaluate(el=>el.classList.contains('held')));
  await page.evaluate(()=>{window.__previewSong=true;dispatchEvent(new CustomEvent('gh3stage',{detail:{stage:'songPlaying',song:'slowride'}}));});await page.waitForTimeout(600);
  check('Guía cambia automáticamente a canción',await page.locator('#guideMode').textContent().then(t=>t==='Canción'));
  check('Canción oculta navegación secundaria',!await page.locator('.guideRow[data-action="izquierda"]').isVisible());
  await page.locator('[data-platform="ps4"]').click();
  const symbol=await page.locator('.guideRow[data-action="verde"] .padGlyph').textContent();
  console.log('PS4 verde en canción:',symbol);
  check('Selector PS4 conserva esquema original de canción',symbol==='L2');
  await page.screenshot({path:out+'/desktop-song.png'});
  await page.setViewportSize({width:800,height:700});await page.waitForTimeout(400);
  check('Ventana estrecha devuelve guía al panel',await page.locator('#controllerGuide').evaluate(el=>el.parentElement.dataset.tab==='ctrl'));
  await page.setViewportSize({width:1440,height:800});await page.waitForTimeout(400);
  check('Ampliar recupera guía izquierda sin duplicar',await page.locator('#controllerGuide').count()===1&&await page.locator('#controllerGuide').evaluate(el=>el.parentElement.id==='gh3ControlsRail'));
  await context.close();
  const mobile=await browser.newContext({viewport:{width:896,height:414},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
  const m=await mobile.newPage();m.on('pageerror',e=>report.errors.push(e.message));await m.goto(url,{waitUntil:'networkidle'});await m.waitForFunction(()=>document.querySelector('#gh3Row[data-workspace-ready]'));
  await preview(m);
  check('Celular mantiene panel desplegable',await m.locator('body').evaluate(el=>!el.classList.contains('gh3Workspace'))&&await m.locator('#gh3MenuBtn').isVisible());
  await m.locator('#gh3MenuBtn').click();await m.waitForTimeout(300);
  check('Celular abre menú',await m.locator('body').evaluate(el=>el.classList.contains('gh3DrawerOpen')));
  await m.screenshot({path:out+'/mobile-drawer-debug.png'});
  await m.locator('.tabs [data-tab="ctrl"]').click();check('Celular conserva guía en Controles',await m.locator('#controllerGuide').isVisible());
  await m.screenshot({path:out+'/mobile-landscape.png'});
  await m.locator('#gh3MenuBtn').click();await m.setViewportSize({width:390,height:844});await m.waitForTimeout(300);
  await m.screenshot({path:out+'/mobile-portrait.png'});
  check('Celular conserva un único panel y guía',await m.locator('#gh3Panel').count()===1&&await m.locator('#controllerGuide').count()===1);
  check('Cero errores de página',report.errors.length===0);report.ok=true;
}catch(e){report.ok=false;report.failure=e.stack;process.exitCode=1;console.error(e);}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));fs.writeFileSync(out+'/verification.json',JSON.stringify(report,null,2));}
