import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright';
import geoHandler from '../tools/analytics/geo-handler.mjs';

const root=path.resolve('artifacts/monitor-ubicacion/preview/.vercel/output/static/gh3');
const prepared=JSON.parse(await fs.readFile('artifacts/monitor-ubicacion/prepared.json'));
const html=await fs.readFile(path.join(root,'index.html'),'utf8');
const meta=html.match(/<meta name="gh3-build"[^>]+>/)[0];
// Load exactly the staged telemetry and build metadata, without the game/worker.
const pageHTML=`<!doctype html><html><head>${meta}<script src="gh3-visit-context.js"></script><script src="gh3-analytics.js"></script></head><body>PRUEBA LOCAL DE TELEMETRÍA · SIN MOTOR</body></html>`;
let noGeo=false;
const server=http.createServer(async(req,res)=>{
  if(req.url.startsWith('/api/gh3-location')){
    if(noGeo){res.writeHead(503).end('{}');return;}
    return geoHandler({method:req.method,headers:{'x-vercel-ip-country':'AR','x-vercel-ip-country-region':'B','x-vercel-ip-city':'La%20Plata','x-forwarded-for':'10.1.2.3'}},res);
  }
  if(new URL(req.url,'http://local').pathname==='/gh3/')return res.writeHead(200,{'content-type':'text/html;charset=utf-8'}).end(pageHTML);
  const name=path.posix.basename(new URL(req.url,'http://local').pathname);
  if(!['gh3-analytics.js','gh3-visit-context.js'].includes(name))return res.writeHead(404).end();
  res.writeHead(200,{'content-type':'application/javascript'}).end(await fs.readFile(path.join(root,name)));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'msedge',headless:true});
const report={game_started:false,live_events_sent:0,cases:[]};
try{
  const context=await browser.newContext();
  await context.addInitScript(()=>Object.defineProperty(navigator,'webdriver',{get:()=>false}));
  const events=[],errors=[];
  await context.route('https://nvlwlmyuqorxaupcdbdb.supabase.co/functions/v1/gh3-analytics',async route=>{
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'content-type'}});
    events.push(route.request().postDataJSON());
    await route.fulfill({status:204,headers:{'access-control-allow-origin':'*'}});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const views=()=>events.filter(e=>e.event==='page_view');
  await page.goto(origin+'/gh3/?prueba=santi');await page.waitForFunction(()=>window.gh3VisitContext?.data.geo_country==='AR');
  await assertEventually(()=>views().length===1);
  assert.equal(views()[0].metadata.tester,'santi');assert.equal(views()[0].metadata.geo_city,'La Plata');assert.equal(views()[0].metadata.version,prepared.version);
  assert.equal(await page.evaluate(()=>location.search),'');
  await page.reload();await assertEventually(()=>views().length===2);assert.equal(views()[1].metadata.tester,'santi');
  assert.equal(views()[0].session_id,views()[1].session_id);
  await page.goto(origin+'/gh3/?prueba=codex');await assertEventually(()=>views().length===3);
  assert.equal(views()[2].metadata.tester,'codex');assert.notEqual(views()[2].session_id,views()[1].session_id);
  await page.goto(origin+'/gh3/?prueba=ninguna');await assertEventually(()=>views().length===4);assert.equal(views()[3].metadata.tester,'unknown');
  // The private panel can change localStorage in another tab; game reload must rotate.
  await page.evaluate(()=>localStorage.setItem('gh3-test-profile','claude'));
  await page.reload();await assertEventually(()=>views().length===5);assert.equal(views()[4].metadata.tester,'claude');assert.notEqual(views()[4].session_id,views()[3].session_id);
  noGeo=true;await page.reload();await assertEventually(()=>views().length===6);assert.equal(views()[5].metadata.geo_country,undefined);
  assert.deepEqual(errors,[]);assert.doesNotMatch(JSON.stringify(events),/10\.1\.2\.3|latitude|longitude/);
  report.cases.push('marca persistente','cambio separa sesión','quitar marca','ubicación de cabeceras','versión disponible antes de eventos','ubicación caída no bloquea','sin IP/GPS','cero errores de página');
  await context.close();
  report.pass=true;
  await fs.writeFile('artifacts/monitor-ubicacion/browser-context.json',JSON.stringify(report,null,2));
  console.log('PASS: contexto de visita real en Edge; marcas, ubicación, versión y fallback. Backend interceptado; no se inició el motor.');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
async function assertEventually(predicate){for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,25));}assert.ok(predicate());}
