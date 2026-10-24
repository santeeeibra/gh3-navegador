// Robot de accesos rápidos (Claude 2026-10-15): versión reducida de tools/re/install-robot-re.mjs (mismo esquema de mando y reloj 0x829B57B0).
// Usa el esquema de GUITARRA (la copia publicable presenta guitarra, sub_type 7). Diferencias: sin reintentos automáticos (no aprieta A al perder), tramo opcional sin tocar (errores deliberados) y Back periódico (poder estelar).
//   omitir: [desdeMs, hastaMs] de reloj de canción en que NO toca.   estrella: desdeMs a partir del cual aprieta Back cada 3 s (0 = nunca).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {inflateRawSync} from 'node:zlib';

export function leerChart(song, dif = 'medium') {
  const config = JSON.parse(fs.readFileSync('artifacts/all-songs/server-config.json'));
  const cc = {window: {}}; vm.runInNewContext(fs.readFileSync('tools/d1-wasm/gh3-song.js', 'utf8'), cc);
  return cc.window.gh3Song.parseSongPak(new Uint8Array(inflateRawSync(fs.readFileSync(path.join(config.game, `DATA/COMPRESSED/SONGS/${song}_song.pak.xen`)))), song, dif);
}

export async function instalarRobot(page, chart, {omitir = null, estrella = 0, lead = 0, deliveryDelayMs=0, wrongIndex=-1, lateIndex=-1, lateMs=160} = {}) {
  await page.evaluate(({notes, omitir, estrella, lead, deliveryDelayMs,wrongIndex,lateIndex,lateMs}) => {
    const src = `
      const QUEUE={"magic":1398361649,"capacity":64,"header":32,"stride":64},createPressWriter=function createPressWriter(sab, ptr, seg) {
  const h=new Int32Array(sab,ptr,8),dv=new DataView(sab),table=new Uint32Array(sab,seg,256);
  const host=a=>(table[a>>>24]+a)>>>0;
  if((Atomics.load(h,0)>>>0)!==QUEUE.magic) throw Error('Unknown input FIFO ABI');
  return function writePress({eventAt,writtenAt,buttons,triggers=0,source=0,flags=0,seq=0}) {
    const w=Atomics.load(h,1)>>>0,r=Atomics.load(h,2)>>>0;
    if(((w-r)>>>0)>=QUEUE.capacity){Atomics.add(h,3,1);return null;}
    const base=dv.getFloat64(host(0x82BD7C38),false),after=dv.getFloat64(host(0x82BD7C38),false);
    const p=ptr+QUEUE.header+(w%QUEUE.capacity)*QUEUE.stride;
    dv.setFloat64(p,eventAt,true);dv.setFloat64(p+8,writtenAt,true);
    dv.setFloat64(p+16,base,true);dv.setFloat64(p+24,after,true);
    for(const [o,v] of [[32,buttons],[36,triggers],[40,source],[44,flags],[48,w+1],[52,seq]])dv.setUint32(p+o,v>>>0,true);
    dv.setUint32(p+56,0,true);dv.setUint32(p+60,0,true);
    Atomics.store(h,1,(w+1)|0);return w+1;
  };
};
      const FRET = [0x1000, 0x2000, 0x8000, 0x4000, 0x0100], DOWN = 0x0002, BACK = 0x0020, ADDR = 0x829B57B0;  // esquema GUITARRA (padtype=guitar, como la copia publicable)
      let M = null, L = null, writePress=null,deliveryDelayMs=0,wrongIndex=-1,lateIndex=-1,lateMs=160, armed = false, notes = [], omitir = null, estrella = 0, lead = 0;
      const st = {strums: 0, omitidas: 0, back: 0, clockMax: -1e9, clockMode: "original-judgement", presses: []};
      onmessage = (e) => { const d = e.data;
        if (d.type === 'init') ({notes, omitir, estrella, lead,deliveryDelayMs,wrongIndex,lateIndex,lateMs} = d);
        if (d.type === 'mem') M = {sab: d.sab, seg: d.seg};
        if (d.type === 'live') L = new Int32Array(d.sab, d.ptr, 11);
        if (d.type === 'pressQueue' && M && !writePress)writePress=createPressWriter(M.sab,d.ptr,M.seg);
        if (d.type === 'arm') armed = true;
        if (d.type === 'stats') postMessage({type: 'stats', st}); };
      const clock = () => {
        if(!M)return NaN;
        const t=new Uint32Array(M.sab,M.seg,256),dv=new DataView(M.sab);
        const h=a=>(t[a>>>24]+a)>>>0;
        // The base timer also advances before the song is initialised. Do not
        // skip chart notes while loading; the original input loop marks activity.
        if(dv.getFloat32(h(0x829B57B0),false)===0)return NaN;
        return Math.fround(dv.getFloat64(h(0x82BD7C38),false))*1000
          +dv.getFloat32(h(0x829B56C0),false)-dv.getFloat32(h(0x829A0438),false)*1000;
      };
      const nap = new Int32Array(new SharedArrayBuffer(4));
      const pending=[];let i = 0, frets = 0, strumUntil = 0, backUntil = 0, nextBack = 0, last = -1, n = 0;
      (function loop() { for (;;) {
        Atomics.wait(nap, 0, 0, 1);
        if (++n % 200 === 0) { setTimeout(loop, 0); return; }
        if (!armed || !L) continue;
        const raw = clock(); if (!Number.isFinite(raw)) continue; if (raw > st.clockMax) st.clockMax = raw;
        const now = raw + lead, pnow = performance.now(), callar = omitir && raw >= omitir[0] && raw < omitir[1];
        while (i < notes.length && notes[i].t+(i===lateIndex?lateMs:0) < now - 150) i++;
        let tap = 0;
        if (i < notes.length) { const x = notes[i];
          if (now >= x.t - 70) frets = callar ? 0 : i===wrongIndex?((x.mask<<1)|(x.mask>>4))&31:x.mask & 31;
          if (now >= x.t+(i===lateIndex?lateMs:0)) { if (callar) st.omitidas++; else { tap = DOWN; strumUntil = pnow + 30; st.strums++; st.presses.push({index:i,target:x.t,clock:now,at:performance.timeOrigin+pnow}); } i++; } }
        if (estrella && raw > estrella && pnow > nextBack) { nextBack = pnow + 3000; backUntil = pnow + 150; tap |= BACK; st.back++; }
        let b = 0; for (let k = 0; k < 5; k++) if (frets & (1 << k)) b |= FRET[k];
        const tr = 0;
        if (pnow < strumUntil) b |= DOWN; if (pnow < backUntil) b |= BACK;
        const key = b | (tr << 16);
        if (key !== last || tap) {
          let queueId=null;
          if(tap&DOWN && writePress){const nowAt=performance.timeOrigin+performance.now();queueId=writePress({eventAt:nowAt,writtenAt:nowAt,buttons:b,triggers:tr,source:8,flags:4,seq:Atomics.load(L,0)+pending.length+1});const press=st.presses.at(-1);if(press)Object.assign(press,{queueId,queuedAt:nowAt});}
          pending.push({due:pnow+deliveryDelayMs,b,tr,tap,queueId});last=key;
        }
        while(pending.length&&pending[0].due<=pnow){const d=pending.shift();
          if(d.tap)Atomics.or(L,10,d.tap);Atomics.store(L,2,d.tr);Atomics.store(L,1,d.b);
          new Float64Array(L.buffer,L.byteOffset+32,1)[0]=performance.timeOrigin+performance.now();Atomics.add(L,0,1);
          if(d.queueId){const press=st.presses.find(x=>x.queueId===d.queueId);if(press)press.deliveredAt=performance.timeOrigin+performance.now();}
        }
      } })();`;
    const bw = new Worker(URL.createObjectURL(new Blob([src], {type: 'text/javascript'})));
    bw.postMessage({type: 'init', notes, omitir, estrella, lead,deliveryDelayMs,wrongIndex,lateIndex,lateMs});
    const st = window.botStats = {};
    bw.onmessage = (e) => Object.assign(st, e.data.st);
    let sentLive = false, armed = false;
    setInterval(() => {
      if (window.g1mem) bw.postMessage({type: 'mem', sab: window.g1mem.sab, seg: window.g1mem.seg});
      if (!sentLive && window.g1live?.sab) { bw.postMessage({type: 'live', sab: window.g1live.sab, ptr: window.g1live.ptr}); sentLive = true; }
      if (!armed && window.d4?.log?.some((l) => /_song.pak.xen/.test(l))) { bw.postMessage({type: 'arm'}); armed = true; }
      if(window.syncPress?.ptr)bw.postMessage({type:'pressQueue',ptr:window.syncPress.ptr});
      bw.postMessage({type: 'stats'});
    }, 500);
  }, {notes: chart.notes, omitir, estrella, lead,deliveryDelayMs,wrongIndex,lateIndex,lateMs});
}

// Para pasar a startGame({init}): deja window.g1live/g1mem con la memoria compartida que usa el robot.
export function initMemoria() {
  const W = window.Worker;
  window.Worker = function (...a) { const w = new W(...a); w.addEventListener('message', e => {
    if (e.data?.type === 'g1eInput') window.g1live = {sab: e.data.sab, ptr: e.data.ptr};
    if (e.data?.type === 'g1Mem' || e.data?.type === 'g1eInput') window.g1mem = {sab: e.data.sab, seg: e.data.seg}; }); return w; };
  window.Worker.prototype = W.prototype;
}
