import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const out='artifacts/touch-zones';fs.mkdirSync(out,{recursive:true});
const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0;background:#000}#r5Canvas{position:fixed;inset:0;width:100vw;height:100vh;object-fit:contain}</style><canvas id="r5Canvas" width="1280" height="720"></canvas><script src="/input.js"></script><script>gh3Input.songMode=()=>true;const memory=new SharedArrayBuffer(64);gh3Input.attach(memory,0);window.state=()=>({frets:gh3Input.stats.frets,buttons:gh3Input.stats.buttons,triggers:gh3Input.stats.triggers});const g=r5Canvas.getContext('2d');g.fillStyle='#111';g.fillRect(0,0,1280,720);['#2ecc40','#ff3b30','#ffd60a','#0a84ff','#ff9500'].forEach((color,i)=>{g.strokeStyle=color;g.lineWidth=4;g.beginPath();g.ellipse(1280*(.34+i*.08),720*.885,42,15,0,0,Math.PI*2);g.stroke();});</script><script src="/touch.js"></script>`;
const server=http.createServer((req,res)=>{res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Content-Type',req.url==='/'?'text/html':'text/javascript');res.end(req.url==='/'?html:fs.readFileSync(req.url==='/input.js'?'artifacts/d1-wasm/touch/gh3-input.js':'src/original/gh3-touch.js'));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const report={checks:[],errors:[]};let browser;
const check=(name,condition)=>{assert.ok(condition,name);report.checks.push(name);console.log('OK '+name);};
try{
 browser=await chromium.launch({channel:'msedge',headless:true});
 const ctx=await browser.newContext({viewport:{width:896,height:414},hasTouch:true,isMobile:true});const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 const url=`http://127.0.0.1:${server.address().port}/`;await page.goto(url);await page.waitForFunction(()=>gh3Touch?.enabled());const cdp=await ctx.newCDPSession(page);
 const rects=()=>page.evaluate(()=>[...document.querySelectorAll('[data-fret]')].map(z=>{const r=z.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};}));
 let zones=await rects();
 const send=async(type,pts)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});await page.waitForTimeout(25);};
 const fret=(i,id=i+1)=>({x:zones[i].x,y:zones[i].y,id});
 const end=()=>send('touchEnd',[]);
 for(let i=0;i<5;i++){
  await send('touchStart',[fret(i)]);check('nota '+i+' corresponde a su círculo',(await page.evaluate(()=>state().frets))===(1<<i));await end();
 }
 check('alineación con imagen contain y bandas negras',Math.abs(zones[0].x-(80+736*.34))<1&&Math.abs(zones[0].y-414*.885)<1);
 await send('touchStart',[fret(0),fret(2),fret(4)]);check('acorde verde amarillo naranja',(await page.evaluate(()=>state().frets))===21);
 await send('touchStart',[0,1,2,3,4].map(i=>fret(i)));check('acorde de cinco notas',(await page.evaluate(()=>state().frets))===31);
 const strum=await page.locator('.strum').boundingBox();await send('touchStart',[...[0,1,2,3,4].map(i=>fret(i)),{id:9,x:strum.x+strum.width/2,y:strum.y+strum.height/2}]);
 check('acorde y rasgueo simultáneos',await page.evaluate(()=>state().frets===31 && gh3Touch.stats.strums===1));await end();
 await send('touchStart',[fret(1,11),fret(1,12)]);await send('touchEnd',[fret(1,12)]);check('dos dedos en una nota: soltar uno mantiene la nota',(await page.evaluate(()=>state().frets))===2);await end();
 await send('touchStart',[fret(0)]);await send('touchMove',[fret(3,1)]);check('deslizar verde a azul',(await page.evaluate(()=>state().frets))===8);
 await send('touchCancel',[]);check('cancelar libera todas las notas',(await page.evaluate(()=>state().frets))===0);
 await send('touchStart',[fret(0)]);await page.evaluate(()=>dispatchEvent(new Event('blur')));check('perder foco libera las notas',(await page.evaluate(()=>state().frets))===0);await end();
 await page.click('.settings');check('vista previa visible',await page.locator('#gh3Touch').evaluate(e=>e.classList.contains('preview')));
 await page.locator('[name=offset]').fill('7');await page.locator('[name=width]').fill('80');await page.locator('[name=height]').fill('25');
 const config=await page.evaluate(()=>gh3Touch.getSettings());check('sliders actualizan configuración',config.offset===7&&config.width===80&&config.height===25);
 const adjusted=await rects();check('ajustes cambian altura ancho y tamaño',adjusted[2].y!==zones[2].y&&adjusted[2].w<zones[2].w&&adjusted[2].h>zones[2].h);
 await send('touchStart',[{x:adjusted[4].x,y:adjusted[4].y,id:1}]);check('vista previa no activa notas',(await page.evaluate(()=>state().frets))===0);await end();
 await page.screenshot({path:out+'/preview.png'});await page.reload();await page.waitForFunction(()=>gh3Touch?.enabled());check('configuración conservada al recargar',JSON.stringify(await page.evaluate(()=>gh3Touch.getSettings()))===JSON.stringify(config));
 await page.click('.settings');await page.click('.reset');check('restablecer valores predeterminados',await page.evaluate(()=>JSON.stringify(gh3Touch.getSettings())===JSON.stringify({offset:0,width:100,height:18})));await page.click('.close');
 await page.keyboard.down('KeyA');check('teclado verde conservado',(await page.evaluate(()=>state().frets))===1);await page.keyboard.up('KeyA');
 zones=await rects();await send('touchStart',[fret(2)]);await page.keyboard.down('KeyA');check('teclado y táctil combinados',(await page.evaluate(()=>state().frets))===5);await page.keyboard.up('KeyA');await end();
 await page.setViewportSize({width:414,height:896});await page.waitForTimeout(100);zones=await rects();check('zonas adaptadas a vertical',zones.every(z=>z.x-z.w/2>=0&&z.x+z.w/2<=414&&z.y-z.h/2>=0&&z.y+z.h/2<=896));await send('touchStart',[fret(4)]);check('nota correcta en vertical',(await page.evaluate(()=>state().frets))===16);await end();
 check('gestos bloqueados en áreas de juego',await page.evaluate(()=>getComputedStyle(document.querySelector('.f0')).touchAction==='none'&&getComputedStyle(document.querySelector('#r5Canvas')).touchAction==='none'));
 check('sin scroll zoom ni selección',await page.evaluate(()=>{const z=document.querySelector('.f0');const e=new Event('touchmove',{bubbles:true,cancelable:true});z.dispatchEvent(e);return e.defaultPrevented&&getComputedStyle(z).userSelect==='none'&&scrollY===0&&visualViewport.scale===1;}));
 await page.evaluate(()=>{localStorage.setItem('gh3TouchZones.v1','{"offset":999,"width":-10,"height":"bad"}');});await page.reload();check('configuración inválida se acota',await page.evaluate(()=>JSON.stringify(gh3Touch.getSettings())===JSON.stringify({offset:20,width:60,height:18})));
 await page.evaluate(()=>{gh3Touch.disable();gh3Touch.enable();});check('reactivar sin duplicar panel',await page.locator('#gh3Touch').count()===1);
 check('sin errores de página',report.errors.length===0);report.ok=true;
}catch(e){report.ok=false;report.error=e.stack;process.exitCode=1;console.error(e);}
finally{await browser?.close();await new Promise(r=>server.close(r));fs.writeFileSync(out+'/verification.json',JSON.stringify(report,null,2));}

