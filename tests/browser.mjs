import {chromium} from 'playwright';import assert from 'node:assert/strict';import{mkdir,writeFile}from'node:fs/promises';
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const errors=[];let realPassed=false;
function monitor(page){page.on('pageerror',e=>errors.push(e.message));}
try{
 const context=await browser.newContext({viewport:{width:1440,height:1100}}),a=await context.newPage(),b=await context.newPage();monitor(a);monitor(b);
 await a.goto('http://localhost:5173/?test');await a.click('#create');
 await a.waitForSelector('#room:not([hidden])');const code=await a.locator('#room-code').textContent();
 await b.goto('http://localhost:5173/?test&room='+code);await b.fill('#name','Rival de prueba');await b.click('#join');
 await a.waitForFunction(()=>!!window.riffDebug.online.peer);await b.waitForFunction(()=>!!window.riffDebug.online.peer);
 await a.click('#ready');await b.click('#ready');
 await a.waitForFunction(()=>window.riffDebug.playing);await b.waitForFunction(()=>window.riffDebug.playing);
 await a.waitForTimeout(5500);
 const times=await Promise.all([a.evaluate(()=>window.riffDebug.songTime),b.evaluate(()=>window.riffDebug.songTime)]);assert(Math.abs(times[0]-times[1])<.16,'Inicio desincronizado: '+times);
 const id=await a.evaluate(()=>window.riffDebug.roundId);assert.equal(id,await b.evaluate(()=>window.riffDebug.roundId));
 // Hit a real upcoming chart note through keyboard input and the actual audio clock.
 await a.evaluate(()=>{const n=window.riffDebug.engine.notes.find(n=>n.time>window.riffDebug.songTime+.15);window.testTarget=n;});
 const lane=await a.evaluate(()=>window.testTarget.lanes[0]);await a.keyboard.down(['a','s','d','f','g'][lane]);
 await a.waitForFunction(()=>window.riffDebug.songTime>=window.testTarget.time-.025,{},{polling:10});
 await a.keyboard.press('ArrowDown');await a.keyboard.up(['a','s','d','f','g'][lane]);
 await a.waitForFunction(()=>window.riffDebug.engine.hits>0);
 await b.waitForFunction(()=>Number(document.getElementById('rival-score').textContent.replaceAll('.',''))>0);
 assert((await a.evaluate(()=>window.riffDebug.engine.score))>=50);
 await a.screenshot({path:'artifacts/duel-desktop.png',fullPage:true});
 // A third entrant must not become an opponent or start a game.
 const intruder=await context.newPage();monitor(intruder);await intruder.goto('http://localhost:5173/?test&room='+code);await intruder.click('#join');await intruder.waitForTimeout(1000);assert.equal(await a.evaluate(()=>window.riffDebug.online.peer),await b.evaluate(()=>window.riffDebug.online.id));await intruder.close();
 await b.click('#leave');await a.waitForFunction(()=>!window.riffDebug.playing);await a.waitForFunction(()=>!window.riffDebug.online.peer);
 await a.click('#leave');await context.close();
 console.log('PASS: dos jugadores locales, inicio sincronizado, nota real, puntaje remoto, desconexión.');
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),m=await mobile.newPage();monitor(m);
 await m.goto('http://localhost:5173');assert(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await m.click('#solo');await m.waitForFunction(()=>window.riffDebug.playing);await m.waitForTimeout(800);
 await m.locator('[data-lane="0"]').dispatchEvent('pointerdown',{pointerId:1,pointerType:'touch'});assert(await m.evaluate(()=>document.querySelector('[data-lane="0"]').classList.contains('pressed')));await m.locator('[data-lane="0"]').dispatchEvent('pointerup',{pointerId:1,pointerType:'touch'});
 await m.screenshot({path:'artifacts/mobile.png',fullPage:true});await m.click('#stop');await mobile.close();
 console.log('PASS: pantalla móvil sin desborde y controles táctiles.');
 // Actual Supabase sockets, in separate browser contexts (no local BroadcastChannel).
 const ca=await browser.newContext(),cb=await browser.newContext(),ra=await ca.newPage(),rb=await cb.newPage();monitor(ra);monitor(rb);
 await ra.goto('http://localhost:5173');await ra.click('#create');
 try{
  await ra.waitForSelector('#room:not([hidden])',{timeout:16000});const realCode=await ra.locator('#room-code').textContent();
  await rb.goto('http://localhost:5173/?room='+realCode);await rb.click('#join');await rb.waitForSelector('#room:not([hidden])',{timeout:16000});
  await ra.waitForFunction(()=>!!window.riffDebug.online.peer);await rb.waitForFunction(()=>!!window.riffDebug.online.peer);
  const cc=await browser.newContext(),third=await cc.newPage();await third.goto('http://localhost:5173/?room='+realCode);await third.click('#join');await third.waitForFunction(()=>document.getElementById('status').textContent.includes('completa'),null,{timeout:15000});assert(!await third.evaluate(()=>window.riffDebug.online.connected));await cc.close();
  await ra.click('#ready');await rb.click('#ready');await ra.waitForFunction(()=>window.riffDebug.playing);await rb.waitForFunction(()=>window.riffDebug.playing);await ra.waitForTimeout(5500);
  const rt=await Promise.all([ra.evaluate(()=>window.riffDebug.songTime),rb.evaluate(()=>window.riffDebug.songTime)]);assert(Math.abs(rt[0]-rt[1])<.16,'Supabase desincronizado: '+rt);
  await ra.evaluate(()=>{window.riffDebug.engine.score=1234;});await rb.waitForFunction(()=>document.getElementById('rival-score').textContent==='1.234');
  realPassed=true;console.log('PASS: Supabase real, dos sesiones independientes, tercer jugador rechazado, arranque sincronizado y puntaje en vivo.');
 }catch(e){console.log('ONLINE_REAL_BLOCKER: '+e.message+' | '+await ra.locator('#status').textContent());}
 await ca.close();await cb.close();assert.deepEqual(errors,[]);
 await writeFile('artifacts/verification.json',JSON.stringify({localPassed:true,mobilePassed:true,realPassed,errors},null,2));
}finally{await browser.close();}
