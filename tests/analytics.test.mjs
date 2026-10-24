import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

test('analytics sends anonymous, bounded events and identifies X traffic',async()=>{
  const requests=[],listeners={},beacons=[];
  const storage=new Map();
  const context={
    crypto:webcrypto,URL,Date,JSON,Math,Promise,setTimeout,clearTimeout,setInterval:()=>0,clearInterval:()=>{},TextEncoder,
    document:{referrer:'https://t.co/example'},
    navigator:{maxTouchPoints:5,sendBeacon:(url,body)=>{beacons.push({url,body});return true;}},
    screen:{width:390,height:844},
    sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    matchMedia:()=>({matches:true}),
    fetch:(url,options)=>{requests.push({url,options});return Promise.resolve({ok:true,status:204});},
    addEventListener:(name,fn)=>{listeners[name]=fn;},
  };
  context.window=context;
  vm.runInNewContext(fs.readFileSync('tools/analytics/gh3-analytics.js','utf8'),context);
  await Promise.resolve();
  assert.equal(requests.length,1);
  const view=JSON.parse(requests[0].options.body);
  assert.deepEqual({event:view.event,source:view.source,device:view.device},{event:'page_view',source:'x',device:'phone'});
  assert.match(view.session_id,/^[0-9a-f-]{36}$/);
  assert.deepEqual(Object.keys(view).sort(),['device','event','metadata','session_id','source']);

  context.gh3Analytics.once('game_started');
  context.gh3Analytics.once('game_started');
  context.gh3Analytics.song('slow_ride');
  assert.equal(requests.filter(r=>JSON.parse(r.options.body).event==='game_started').length,1);
  assert.equal(JSON.parse(requests.at(-1).options.body).metadata.song,'slow_ride');

  listeners.pagehide();
  assert.equal(beacons.length,1);
  const ended=JSON.parse(beacons[0].body);
  assert.equal(ended.event,'session_ended');
  assert.equal(ended.metadata.played,true);
});

test('generated public loader shows progress immediately and records real milestones',()=>{
  const root='artifacts/d1-wasm/ui2/demo';
  const html=fs.readFileSync(`${root}/index.html`,'utf8');
  const ui=fs.readFileSync(`${root}/r5snap-loader-ui.js`,'utf8');
  assert.match(html,/src="gh3-analytics\.js"/);
  assert.match(ui,/Preparando(?:\\u2026|…)/);
  assert.match(ui,/game_started/);
  assert.match(ui,/assets_ready/);
  assert.match(ui,/song_started|\.song\(/);
});
