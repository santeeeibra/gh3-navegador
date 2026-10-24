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

export async function instalarRobot(page, chart, {omitir = null, estrella = 0, lead = -350, rasgueoMs = 30, autoLead = false} = {}) {
  await page.evaluate(({notes, omitir, estrella, lead, rasgueoMs, autoLead}) => {
    const src = `
      const FRET = [0x1000, 0x2000, 0x8000, 0x4000, 0x0100], DOWN = 0x0002, BACK = 0x0020, ADDR = 0x829B57B0;  // esquema GUITARRA (padtype=guitar, como la copia publicable)
      let M = null, L = null, armed = false, notes = [], omitir = null, estrella = 0, lead = 0, rasgueoMs = 30;  // rasgueoMs: cuánto se mantiene apretado el rasgueo
      const st = {strums: 0, omitidas: 0, back: 0, clockMax: -1e9};
      onmessage = (e) => { const d = e.data;
        if (d.type === 'init') ({notes, omitir, estrella, lead, rasgueoMs} = d);
        if (d.type === 'lead') lead = d.lead;
        if (d.type === 'mem') M = {sab: d.sab, seg: d.seg};
        if (d.type === 'live') L = new Int32Array(d.sab, d.ptr, 11);
        if (d.type === 'arm') armed = true;
        if (d.type === 'stats') postMessage({type: 'stats', st}); };
      const clock = () => { if (!M) return NaN; const t = new Uint32Array(M.sab, M.seg, 256), h = (t[ADDR >>> 24] + ADDR) >>> 0;
        return h + 4 > M.sab.byteLength ? NaN : new DataView(M.sab).getFloat32(h, false); };
      const nap = new Int32Array(new SharedArrayBuffer(4));
      let sleepMs = 1, i = 0, frets = 0, strumUntil = 0, backUntil = 0, nextBack = 0, last = -1, n = 0;
      (function loop() { for (;;) {
        // Claude 2026-10-17: espera según la próxima nota (antes 1 ms fijo: el perfil mostraba el hilo al 99 %).
        Atomics.wait(nap, 0, 0, sleepMs); sleepMs = 1;
        if (++n % 200 === 0) { setTimeout(loop, 0); return; }
        if (!armed || !L) { sleepMs = 50; continue; }
        const raw = clock(); if (!Number.isFinite(raw)) continue; if (raw > st.clockMax) st.clockMax = raw;
        const now = raw + lead, pnow = performance.now(), callar = omitir && raw >= omitir[0] && raw < omitir[1];
        while (i < notes.length && notes[i].t < now - 150) i++;
        let tap = 0;
        if (i < notes.length && pnow >= strumUntil && pnow >= backUntil) sleepMs = Math.max(1, Math.min(8, Math.floor(notes[i].t - 70 - now - 2)));
        if (i < notes.length) { const x = notes[i];
          if (now >= x.t - 70) frets = callar ? 0 : x.mask & 31;
          if (now >= x.t) { if (callar) st.omitidas++; else { tap = DOWN; strumUntil = pnow + rasgueoMs; st.strums++; } i++; } }
        if (estrella && raw > estrella && pnow > nextBack) { nextBack = pnow + 3000; backUntil = pnow + 150; tap |= BACK; st.back++; }
        let b = 0; for (let k = 0; k < 5; k++) if (frets & (1 << k)) b |= FRET[k];
        const tr = 0;
        if (pnow < strumUntil) b |= DOWN; if (pnow < backUntil) b |= BACK;
        const key = b | (tr << 16);
        if (key !== last || tap) { if (tap) Atomics.or(L, 10, tap); Atomics.store(L, 2, tr); Atomics.store(L, 1, b); Atomics.add(L, 0, 1); last = key; }
      } })();`;
    const bw = new Worker(URL.createObjectURL(new Blob([src], {type: 'text/javascript'})));
    bw.postMessage({type: 'init', notes, omitir, estrella, lead, rasgueoMs});
    const st = window.botStats = {};
    bw.onmessage = (e) => Object.assign(st, e.data.st);
    let sentLive = false, armed = false;
    setInterval(() => {
      if (window.g1mem) bw.postMessage({type: 'mem', sab: window.g1mem.sab, seg: window.g1mem.seg});
      if (!sentLive && window.g1live?.sab) { bw.postMessage({type: 'live', sab: window.g1live.sab, ptr: window.g1live.ptr}); sentLive = true; }
      if (!armed && window.d4?.log?.some((l) => /_song.pak.xen/.test(l))) { bw.postMessage({type: 'arm'}); armed = true; }
      bw.postMessage({type: 'stats'});
    }, 500);
    // autoLead (Claude 2026-10-21): se calibra mirando la botonera. Necesita el contador visual (robot-visual.mjs, modo 'contar'),
    // que anota a qué altura desaparece cada gema en el cuadro del juego: acertada temprano = más arriba, tarde = más abajo;
    // fallo = pasa de y 670. Cada 4 acertadas mueve el adelanto (máx. 30 ms) para que la mediana quede en y 630 (≈ 0,36 px por ms,
    // medido en alta: −350 → y 657 con fallos; −250 → 621 y −200 → 618 sin fallos). Bien de hora la altura toca un piso ~620:
    // por eso el objetivo es 630 (con 620 nunca lo alcanzaba y se pasaba de temprano). Los fallos no dicen si fue temprano o tarde: no mueven nada.
    if (autoLead) {
      const al = window.autoLead = {lead, hist: []}; let visto = 0, ys = [];
      setInterval(() => {
        const f = window.visBot?.finales; if (!f) return;
        for (; visto < f.length; visto++) {
          const x = f[visto], antes = al.lead;
          if (x.y < 670) { ys.push(x.y); if (ys.length >= 4) { const m = [...ys].sort((a, b) => a - b)[ys.length >> 1]; al.lead += Math.max(-30, Math.min(30, (m - 630) / 0.36)); ys = []; } }
          al.lead = Math.round(Math.max(-500, Math.min(-100, al.lead)));
          if (al.lead !== antes) { bw.postMessage({type: 'lead', lead: al.lead}); al.hist.push({c: x.c, lead: al.lead}); }
        }
      }, 100);
    }
  }, {notes: chart.notes, omitir, estrella, lead, rasgueoMs, autoLead});
}

// Para pasar a startGame({init}): deja window.g1live/g1mem con la memoria compartida que usa el robot.
export function initMemoria() {
  const W = window.Worker;
  window.Worker = function (...a) { const w = new W(...a); w.addEventListener('message', e => {
    if (e.data?.type === 'g1eInput') window.g1live = {sab: e.data.sab, ptr: e.data.ptr};
    if (e.data?.type === 'g1Mem' || e.data?.type === 'g1eInput') window.g1mem = {sab: e.data.sab, seg: e.data.seg}; }); return w; };
  window.Worker.prototype = W.prototype;
}
