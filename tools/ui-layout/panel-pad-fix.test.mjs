import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function input(root, stamp = 97, checkpoints = false) {
  let now = 100, song = true;
  const timers = [], events = [], micro=[];
  const pad = {id:'Wireless Controller (STANDARD GAMEPAD)', mapping:'standard', timestamp:stamp,
    buttons:Array.from({length:16},()=>({value:0,pressed:false})), axes:[0,0,0,0]};
  const sab = new SharedArrayBuffer(16384), ptr = 256, dv = new DataView(sab), queue = ptr + 64;
  dv.setUint32(queue,0x53594e31,true); dv.setUint32(queue+32+4096,2,true);
  const ctx = {console, Atomics, Int32Array, Uint32Array, Float64Array, DataView, URLSearchParams,
    location:{search:'?padtype=guitar'}, performance:{timeOrigin:1700000000000,now:()=>now},
    navigator:{getGamepads:()=>[pad]}, localStorage:{getItem:()=>null},
    setInterval:(fn)=>{timers.push(fn);return timers.length;}, clearInterval:()=>{}, setTimeout:()=>{},
    queueMicrotask:fn=>micro.push(fn), BroadcastChannel:class{addEventListener(){}},
    document:{getElementById:()=>null,activeElement:null},
    addEventListener:(type,fn,capture)=>events.push({type,fn,capture})};
  ctx.window=ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(root+'/c1-strum-page.js','utf8'),ctx);
  vm.runInContext(fs.readFileSync(root+'/gh3-input.js','utf8'),ctx);
  ctx.gh3Input.songMode=()=>song; ctx.gh3Input.attach(sab,ptr);
  const poll = timers.at(-1);
  return {ctx,dv,queue,events, pad, poll,
    at(t){now=t;}, song(s){song=s;},
    button(i,value,ts){pad.buttons[i]={value,pressed:value>.5};pad.timestamp=ts;poll();},
    records(){const n=dv.getUint32(queue+4,true);return Array.from({length:n},(_,i)=>{
      const p=queue+32+i*64;return {at:dv.getFloat64(p,true),written:dv.getFloat64(p+8,true),buttons:dv.getUint32(p+32,true)};
    });},
    key(type,code,t){for(const ev of events.filter(e=>e.type===type).sort((a,b)=>Number(!!b.capture)-Number(!!a.capture))){ev.fn({code,timeStamp:t,target:{tagName:'BODY'},preventDefault(){}});if(checkpoints)while(micro.length)micro.shift()();}while(micro.length)micro.shift()();}
  };
}
const base='artifacts/d1-wasm/c1strum-pub/demo', fixed='artifacts/panel-pad-fix/demo', origin=1700000000000;
test('control: publicada pierde la hora inicial si el mando cambia antes del rasgueo',()=>{
  const x=input(base);x.button(6,1,97);x.at(108);x.button(4,1,106);x.at(132);x.poll();
  assert.equal(x.records()[0].at,origin+106);
});
test('PS4: acorde conserva primer toque y no renueva la espera con otro botón',()=>{
  const x=input(fixed);x.button(6,1,97);x.at(108);x.button(4,1,106);x.at(124);x.poll();
  const [e]=x.records();assert.equal(e.at,origin+97);assert.equal(e.written,origin+124);
  assert.equal(e.buttons&0xF100,0x3000);assert.equal(x.records().length,1);
  x.at(132);x.poll();assert.equal(x.records().length,1);
});
for(const ts of [0,NaN,20,300])test('timestamp inválido '+ts+' usa la primera observación',()=>{
  const x=input(fixed);x.button(6,1,ts);x.at(124);x.poll();assert.equal(x.records()[0].at,origin+100);
});
test('pausa cancela rasgueo pendiente y no lo deja disparar al volver',()=>{
  const x=input(fixed);x.button(6,1,97);x.song(false);x.at(110);x.poll();x.at(140);x.poll();
  assert.equal(x.records().length,0);
});
test('teclado conserva hora de rasgueo, trastes y repetición',()=>{
  const x=input(fixed);x.key('keydown','Digit1',99);x.key('keydown','ArrowDown',100);
  x.at(104);x.key('keyup','ArrowDown',104);x.at(110);x.key('keydown','ArrowDown',110);
  assert.equal(x.records().length,2);assert.equal(x.records()[0].buttons&0xF100,0x1000);
});
test('control: limpieza entre listeners pierde hora real del teclado en publicada',()=>{
  const x=input(base,97,true);x.key('keydown','Digit1',75);x.key('keydown','ArrowDown',80);
  assert.equal(x.records()[0].at,origin+100);
});
test('teclado retrasado: hora original sobrevive a limpieza entre listeners y keyup',()=>{
  const x=input(fixed,97,true);x.key('keydown','Digit1',75);x.key('keydown','ArrowDown',80);
  x.at(110);x.key('keyup','ArrowDown',105);
  assert.equal(x.records()[0].at,origin+80);assert.equal(x.records()[0].written,origin+100);
  x.at(140);x.key('keydown','ArrowDown',120);
  assert.equal(x.records()[1].at,origin+120);assert.equal(x.records()[1].written,origin+140);
});
test('menú mantiene Cruz como A sin disparar rasgueo automático',()=>{
  const x=input(fixed);x.song(false);x.button(0,1,99);x.at(140);x.poll();
  assert.equal(x.ctx.gh3Input.stats.buttons,0x1000);assert.equal(x.records().length,0);
});

function panelTicks(root) {
  const nodes=new Map(),timers=[];let created=0,removed=0;
  const el=()=>({style:{},dataset:{},appendChild(e){if(e.id){nodes.set(e.id,e);created++;}},
    append(){},remove(){nodes.delete(this.id);removed++;},querySelector:()=>null});
  const panel=el();panel.offsetParent={};nodes.set('gh3Panel',panel);
  const ctx={console,performance:{now:()=>100},Date, URLSearchParams,
    document:{head:el(),body:{classList:{contains:()=>false}},addEventListener:()=>{},
      createElement:el,getElementById:id=>nodes.get(id),querySelectorAll:()=>[]},
    window:null,visualViewport:null,requestAnimationFrame:()=>{},addEventListener:()=>{},
    setInterval:(fn,ms)=>{timers.push({fn,ms});return timers.length;}};
  ctx.window=ctx;vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(root+'/gh3-movil-ctl.js','utf8'),ctx);
  vm.runInContext(fs.readFileSync(root+'/gh3-notas.js','utf8'),ctx);
  for(let i=0;i<20;i++)for(const t of timers)if(t.ms===1000)t.fn();
  return{created,removed,logsRemain:Array.isArray(ctx.gh3TouchHides)&&Array.isArray(ctx.gh3PageEvents)};
}
test('control: scripts publicados crean y borran el diagnóstico una vez por segundo',()=>{
  const r=panelTicks(base);assert.equal(r.created,20);assert.equal(r.removed,20);
});
test('panel corregido no reaparece en 20 ciclos y conserva los registros',()=>{
  const r=panelTicks(fixed);assert.equal(r.created,0);assert.equal(r.removed,0);assert.ok(r.logsRemain);
});
