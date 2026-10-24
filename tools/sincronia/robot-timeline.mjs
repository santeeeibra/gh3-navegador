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

export async function instalarRobot(page, chart, {omitir = null, estrella = 0, lead = 0} = {}) {
  await page.evaluate(({notes, omitir, estrella, lead}) => {
    const src = `
      const FRET = [0x1000, 0x2000, 0x8000, 0x4000, 0x0100], DOWN = 0x0002, BACK = 0x0020, ADDR = 0x829B57B0;  // esquema GUITARRA (padtype=guitar, como la copia publicable)
      let M = null, L = null, armed = false, notes = [], omitir = null, estrella = 0, lead = 0;
      const st = {strums: 0, omitidas: 0, back: 0, clockMax: -1e9, clockMode: "original-judgement", presses: []};
      onmessage = (e) => { const d = e.data;
        if (d.type === 'init') ({notes, omitir, estrella, lead} = d);
        if (d.type === 'mem') M = {sab: d.sab, seg: d.seg};
        if (d.type === 'live') L = new Int32Array(d.sab, d.ptr, 11);
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
      let i = 0, frets = 0, strumUntil = 0, backUntil = 0, nextBack = 0, last = -1, n = 0;
      (function loop() { for (;;) {
        Atomics.wait(nap, 0, 0, 1);
        if (++n % 200 === 0) { setTimeout(loop, 0); return; }
        if (!armed || !L) continue;
        const raw = clock(); if (!Number.isFinite(raw)) continue; if (raw > st.clockMax) st.clockMax = raw;
        const now = raw + lead, pnow = performance.now(), callar = omitir && raw >= omitir[0] && raw < omitir[1];
        while (i < notes.length && notes[i].t < now - 150) i++;
        let tap = 0;
        if (i < notes.length) { const x = notes[i];
          if (now >= x.t - 70) frets = callar ? 0 : x.mask & 31;
          if (now >= x.t) { if (callar) st.omitidas++; else { tap = DOWN; strumUntil = pnow + 30; st.strums++; st.presses.push({index:i,target:x.t,clock:now,at:performance.timeOrigin+pnow}); } i++; } }
        if (estrella && raw > estrella && pnow > nextBack) { nextBack = pnow + 3000; backUntil = pnow + 150; tap |= BACK; st.back++; }
        let b = 0; for (let k = 0; k < 5; k++) if (frets & (1 << k)) b |= FRET[k];
        const tr = 0;
        if (pnow < strumUntil) b |= DOWN; if (pnow < backUntil) b |= BACK;
        const key = b | (tr << 16);
        if (key !== last || tap) { if (tap) Atomics.or(L, 10, tap); Atomics.store(L, 2, tr); Atomics.store(L, 1, b); new Float64Array(L.buffer,L.byteOffset+32,1)[0]=performance.timeOrigin+performance.now(); Atomics.add(L, 0, 1); last = key; }
      } })();`;
    const bw = new Worker(URL.createObjectURL(new Blob([src], {type: 'text/javascript'})));
    bw.postMessage({type: 'init', notes, omitir, estrella, lead});
    const st = window.botStats = {};
    bw.onmessage = (e) => Object.assign(st, e.data.st);
    let sentLive = false, armed = false;
    setInterval(() => {
      if (window.g1mem) bw.postMessage({type: 'mem', sab: window.g1mem.sab, seg: window.g1mem.seg});
      if (!sentLive && window.g1live?.sab) { bw.postMessage({type: 'live', sab: window.g1live.sab, ptr: window.g1live.ptr}); sentLive = true; }
      if (!armed && window.d4?.log?.some((l) => /_song.pak.xen/.test(l))) { bw.postMessage({type: 'arm'}); armed = true; }
      bw.postMessage({type: 'stats'});
    }, 500);
  }, {notes: chart.notes, omitir, estrella, lead});
}

// Para pasar a startGame({init}): deja window.g1live/g1mem con la memoria compartida que usa el robot.
export function initMemoria() {
  const W = window.Worker;
  window.Worker = function (...a) { const w = new W(...a); w.addEventListener('message', e => {
    if (e.data?.type === 'g1eInput') window.g1live = {sab: e.data.sab, ptr: e.data.ptr};
    if (e.data?.type === 'g1Mem' || e.data?.type === 'g1eInput') window.g1mem = {sab: e.data.sab, seg: e.data.seg}; }); return w; };
  window.Worker.prototype = W.prototype;
}
