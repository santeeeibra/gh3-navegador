import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import {matchesAudience} from '../tools/analytics/supabase/shared/audience.js';

const root = path.resolve('artifacts/analytics/dashboard-preview');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const server = http.createServer((req, res) => {
  const name = req.url === '/' ? 'index.html' : req.url.slice(1);
  const file = path.join(root, name);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, {'content-type':types[path.extname(file)] || 'application/octet-stream','cache-control':'no-store'});
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const fixture = {
  generated_at:'2026-10-14T18:00:00.000Z',range_days:30,
  totals:{sessions:60,visits:60,play_clicked:37,game_started:27,song_started:8,load_errors:2,cache_fallbacks:5,active_5m:3,average_session_seconds:184},
  event_counts:{page_view:77,play_clicked:51,assets_ready:46,game_started:36,song_started:17,session_ended:27,load_error:2,cache_fallback:5},
  funnel:[['page_view',60],['play_clicked',37],['assets_ready',33],['game_started',27],['song_started',8]].map(([event,sessions])=>({event,sessions,from_previous_pct:0})),
  daily:Array.from({length:30},(_,i)=>({date:`2026-09-${String(15+i).padStart(2,'0')}`,visits:i<16?Math.round((i%5)*1.5):0,starts:i<16?i%3:0,errors:i===12?2:0})).map((row,i)=>i<16?row:{...row,date:`2026-10-${String(i-15).padStart(2,'0')}`,visits:[1,2,4,3,5,7,4,6,8,5,3,6,4,7][i-16]||2,starts:[0,1,2,1,2,3,2,3,4,2,1,3,2,3][i-16]||1}),
  sources:[{label:'direct',sessions:42},{label:'x',sessions:11},{label:'google',sessions:5},{label:'instagram',sessions:2}],
  devices:[{label:'desktop',sessions:39},{label:'phone',sessions:19},{label:'tablet',sessions:2}],
  songs:[{song:'slow_ride',starts:10},{song:'talk_dirty_to_me',starts:4},{song:'hit_me_with_your_best_shot',starts:2},{song:'story_of_my_life',starts:1}],
  error_phases:[{phase:'engine',errors:1},{phase:'assets',errors:1}],latest_event_at:'2026-10-14T17:59:00Z',
  rooms:{available:false,reason:'El duelo online y los apodos todavía no están implementados.'},privacy:'Datos anónimos y agregados. No se guardan IP, correo, nombre ni texto libre.'
};
fixture.feedback={total:2,average:3,ratings:[5,4,3,2,1].map(rating=>({rating,count:rating===5||rating===1?1:0})),categories:[{category:'audio',count:1},{category:'general',count:1}],recent:[
  {created_at:'2026-10-14T18:00:00Z',rating:1,category:'audio',message:'Se corta\nel sonido <img src=x onerror="window.feedbackXss=1">',nickname:'<b>Tester</b>',device:'phone',browser:'Safari'},
  {created_at:'2026-10-14T17:00:00Z',rating:5,category:'general',message:'Funciona perfecto',nickname:'',device:'desktop',browser:'Edge'}
]};
const activityFixture=[
  {at:'2026-10-15T17:55:00Z',event:'load_error',attempt:'Registro ejemplo-A',correlation:'attempt',device:'phone',detail_available:true,metadata:{tester:'codex',geo_country:'AR',geo_region:'Buenos Aires',geo_city:'La Plata',phase:'preparing',error_name:'TypeError',message:'No se pudo cargar una parte <img src=x onerror="window.activityXss=1">',resource:'/gh3/chunks/'+('a'.repeat(64)),status:503,browser:'Safari',version:'vista-previa',cores:2}},
  {at:'2026-10-15T17:54:00Z',event:'cache_fallback',attempt:'Registro ejemplo-A',correlation:'attempt',device:'phone',detail_available:true,metadata:{phase:'preparing',message:'La caché principal no está disponible',severity:'recovered'}},
  {at:'2026-10-15T17:53:00Z',event:'load_error',attempt:'Registro ejemplo-B',correlation:'visit',device:'desktop',detail_available:false,metadata:{tester:'claude',phase:'worker'}},
];

const browser = await chromium.launch({channel:'msedge',headless:true});
try {
  for (const [name, viewport] of [['desktop',{width:1440,height:1100}],['mobile',{width:390,height:844}],['tablet',{width:768,height:1024}],['small',{width:320,height:740}]]) {
    const page = await browser.newPage({viewport});
    await page.emulateMedia({reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const activityQueries=[],summaryQueries=[];
    await page.route('https://nvlwlmyuqorxaupcdbdb.supabase.co/functions/v1/gh3-analytics-dashboard**',async route=>{
      const authorized=route.request().headers().authorization==='Bearer '+('x'.repeat(40));
      const params=new URL(route.request().url()).searchParams;
      let data=fixture;
      if(params.get('view')!=='activity')summaryQueries.push(Object.fromEntries(params));
      if(params.get('view')==='activity'){
        activityQueries.push(Object.fromEntries(params));
        const offset=Number(params.get('offset')||0),type=params.get('type'),date=params.get('date');
        const matching=date==='2026-10-15'?activityFixture.filter(row=>(type==='all'||row.event===type)&&matchesAudience(row.metadata,params.get('audience')||'all')):[];
        const rows=matching.slice(offset,offset+2),hasMore=offset+2<matching.length;
        data={activity:{day:date,time_zone:'America/Argentina/Buenos_Aires',until:'2026-10-15T18:00:00.000Z',events:rows,has_more:hasMore,next_offset:hasMore?offset+2:null}};
      }
      await route.fulfill({status:authorized?200:401,contentType:'application/json',headers:{'access-control-allow-origin':origin},body:JSON.stringify(authorized?data:{error:'unauthorized'})});
    });
    await page.goto(origin,{waitUntil:'networkidle'});
    assert.equal(await page.locator('#login').isVisible(),true);
    await page.locator('#password').fill('wrong-password-that-is-long-enough-123');
    await page.locator('#loginForm button').click();
    await page.waitForFunction(()=>document.getElementById('loginError').textContent.includes('no es válida'));
    assert.match(await page.locator('#loginError').textContent(),/no es válida/);
    await page.locator('#password').fill('x'.repeat(40));
    await page.locator('#loginForm button').click();
    await page.locator('#dashboard').waitFor({state:'visible'});
    await page.evaluate(()=>{for(const fold of document.querySelectorAll('details.fold'))fold.open=true;});
    assert.equal(await page.locator('#activeNow').textContent(),'3');
    assert.equal(await page.locator('#deviceChart svg').count(),1);
    assert.equal(await page.locator('#sourceChart svg').count(),1);
    assert.ok(await page.locator('.kpi svg.icon').count()>=4);
    assert.equal(await page.locator('#feedbackRatings .distribution').nth(1).locator('.bar i').evaluate(node=>node.style.width),'0%');
    await page.locator('#dailyChart circle[tabindex]').first().focus();
    assert.equal(await page.locator('.chart-tooltip').isVisible(),true);
    assert.match(await page.locator('.chart-tooltip').textContent(),/visitas.*arranques/);
    await page.locator('#audience').focus();
    assert.equal(await page.locator('.chart-tooltip').isVisible(),false);
    assert.match(await page.locator('#kpis').textContent(),/60/);
    assert.match(await page.locator('#feedbackSummary').textContent(),/3 \/ 5/);
    assert.equal(await page.locator('.feedback-item').count(),2);
    assert.equal(await page.locator('#feedbackList img').count(),0);
    assert.equal(await page.evaluate(()=>window.feedbackXss),undefined);
    await page.locator('#audience').selectOption('all');
    await page.locator('#activityDate').fill('2026-10-15');await page.locator('#activityDate').dispatchEvent('change');
    await page.waitForFunction(()=>document.querySelectorAll('.activity-item').length===2);
    assert.match(await page.locator('#activityList').textContent(),/14:55:00/);
    assert.match(await page.locator('#activityList').textContent(),/HTTP: 503/);
    assert.match(await page.locator('#activityList').textContent(),/Prueba · Codex/);
    assert.match(await page.locator('#activityList').textContent(),/La Plata · Buenos Aires · Argentina/);
    assert.equal(await page.locator('#activityList img').count(),0);assert.equal(await page.evaluate(()=>window.activityXss),undefined);
    await page.locator('#activityMore').click();await page.waitForFunction(()=>document.querySelectorAll('.activity-item').length===3);
    assert.equal(activityQueries.at(-1).until,'2026-10-15T18:00:00.000Z');
    assert.match(await page.locator('#activityList').textContent(),/Registro antiguo o sin detalle/);
    await page.locator('#activityType').selectOption('cache_fallback');await page.waitForFunction(()=>document.querySelectorAll('.activity-item').length===1);
    assert.match(await page.locator('#activityList').textContent(),/continúa/);
    await page.locator('#activityDate').fill('2026-10-14');await page.locator('#activityDate').dispatchEvent('change');
    await page.waitForFunction(()=>document.getElementById('activityList').textContent.includes('No hay registros'));
    await page.locator('#activityType').selectOption('all');
    await page.locator('#activityDate').fill('2026-10-15');await page.locator('#activityDate').dispatchEvent('change');
    await page.waitForFunction(()=>document.querySelectorAll('.activity-item').length===2);
    await page.locator('#audience').selectOption('unknown');
    await page.waitForFunction(()=>document.querySelectorAll('.activity-item').length===1&&document.querySelector('#activityList').textContent.includes('Sin identificar'));
    assert.equal(summaryQueries.at(-1).audience,'unknown');assert.equal(activityQueries.at(-1).audience,'unknown');
    await page.locator('#audience').selectOption('codex');
    await page.waitForFunction(()=>document.querySelectorAll('.activity-item').length===1&&document.querySelector('#activityList').textContent.includes('Prueba · Codex'));
    await page.locator('#testProfile').selectOption('santi');await page.locator('#saveProfile').click();
    assert.equal(await page.evaluate(()=>localStorage.getItem('gh3-test-profile')),'santi');
    assert.match(await page.locator('#profileStatus').textContent(),/Guardado/);
    await page.locator('#audience').selectOption('all');
    await page.waitForFunction(()=>document.querySelectorAll('.activity-item').length===2);
    await page.locator('#feedbackCategory').selectOption('audio');assert.equal(await page.locator('.feedback-item').count(),1);
    assert.match(await page.locator('#feedbackList').textContent(),/Se corta/);
    await page.locator('#feedbackRating').selectOption('5');assert.equal(await page.locator('.feedback-item').count(),0);
    await page.locator('#feedbackCategory').selectOption('all');await page.locator('#feedbackRating').selectOption('all');
    const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,items:[...document.querySelectorAll('body *')].filter(node=>node.getBoundingClientRect().right>innerWidth+1).slice(0,10).map(node=>({tag:node.tagName,class:node.className?.baseVal??node.className,right:node.getBoundingClientRect().right}))}));
    assert.equal(overflow.scroll>overflow.width,false,JSON.stringify({name,...overflow}));
    const toolbarOverlap=await page.locator('.toolbar').evaluate(node=>{const boxes=[...node.querySelectorAll('select,button')].map(el=>el.getBoundingClientRect());return boxes.some((a,i)=>boxes.some((b,j)=>j>i&&Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1));});
    assert.equal(toolbarOverlap,false,`Controles de período superpuestos a ${name}`);
    assert.equal(errors.length,0,errors.join('\n'));
    await page.close();
  }
  console.log('PASS: panel privado, datos agregados y vista responsive en Edge.');
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
}
