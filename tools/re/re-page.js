// Lado página de los espías (build web artifacts/re). Se inyecta con addInitScript.
// Lee/escribe el bloque re_info de la memoria del wasm (window.g1mem.sab, que da el Worker).
// API: reStart({watch:[[addr,len],...], everyMs}) · reDrain() → {samples, hits} · reNames(ids)
(() => {
  const OFF = { counts: 20, names: 24, nfuncs: 28, wlo: 32, wlen: 36, nwatch: 40, watch: 44, hitsPtr: 108, hitsCap: 112, hitsN: 116 };
  const HIT = 48;
  let sab = null, info = 0, u32 = null, u8 = null, prev = null, timer = 0, lastHit = 0;
  const samples = [], hits = [];
  const known = new Map();  // id -> nombre ya enviado

  function find() {
    sab = window.g1mem?.sab;
    if (!sab) return false;
    u32 = new Uint32Array(sab); u8 = new Uint8Array(sab);
    const lim = Math.min(u32.length, (512 << 20) >> 2);
    const magic = [0x2D334847, 0x492D4552, 0x2D4F464E]; // "GH3-" "RE-I" "NFO-"
    for (let i = 0; i < lim; i++) {
      if (u32[i] === magic[0] && u32[i + 1] === magic[1] && u32[i + 2] === magic[2] && u8[i * 4 + 12] === 0x76) { info = i * 4; return true; }
    }
    return false;
  }
  const rd = off => u32[(info + off) >> 2];
  const wr = (off, v) => Atomics.store(u32, (info + off) >> 2, v >>> 0);
  function cstr(p) { let s = ''; for (let i = p; u8[i] && i < p + 96; i++) s += String.fromCharCode(u8[i]); return s; }

  function setWatch(list) {
    wr(OFF.wlen, 0);
    list = (list || []).slice(0, 8);
    list.forEach(([a, l], i) => { wr(OFF.watch + i * 8, a); wr(OFF.watch + i * 8 + 4, l); });
    wr(OFF.nwatch, list.length);
    if (!list.length) return;
    const lo = Math.min(...list.map(x => x[0])), hi = Math.max(...list.map(x => x[0] + x[1]));
    wr(OFF.wlo, lo); wr(OFF.wlen, hi - lo);
  }

  function sample() {
    const n = rd(OFF.nfuncs), cp = rd(OFF.counts) >> 2;
    if (!prev) prev = new Uint32Array(65536);
    const d = [];
    for (let i = 0; i < n; i++) { const c = u32[cp + i], x = (c - prev[i]) >>> 0; if (x) { d.push(i, x); prev[i] = c; } }
    let clock = null; try { clock = window.gh3Song?.clock?.() ?? null; } catch {}
    samples.push({ t: Math.round(performance.now()), clock, song: window.songPak || null, d });
    // aciertos de vigilancia nuevos
    const hn = rd(OFF.hitsN), cap = rd(OFF.hitsCap), hp = rd(OFF.hitsPtr);
    if (hn - lastHit > cap) lastHit = hn - cap;
    const dv = new DataView(sab);
    for (let s = lastHit + 1; s <= hn; s++) {
      const b = hp + ((s - 1) % cap) * HIT;
      if (dv.getUint32(b, true) !== s) continue;
      const fnp = dv.getUint32(b + 12, true);
      hits.push({ seq: s, addr: dv.getUint32(b + 4, true), size: dv.getUint32(b + 8, true), fn: cstr(fnp).replace('__imp__', ''),
        value: dv.getBigUint64(b + 16, true).toString(16), old: dv.getBigUint64(b + 24, true).toString(16),
        lr: dv.getUint32(b + 32, true).toString(16).toUpperCase(), clock: dv.getFloat32(b + 36, true) });
    }
    lastHit = hn;
  }

  window.reStart = async ({ watch = [], everyMs = 250 } = {}) => {
    const t0 = Date.now();
    while (!info) { if (find()) break; if (Date.now() - t0 > 60000) return { error: 'sin bloque re_info' }; await new Promise(r => setTimeout(r, 500)); }
    setWatch(watch);
    sample();
    clearInterval(timer); timer = setInterval(sample, everyMs);
    return { info, nfuncs: rd(OFF.nfuncs), watch };
  };
  window.reSetWatch = setWatch;
  window.reDrain = () => {
    const s = samples.splice(0), h = hits.splice(0);
    const names = {};
    const n = rd(OFF.nfuncs), np = rd(OFF.names) >> 2;
    for (let i = 0; i < n; i++) if (!known.has(i)) { const nm = cstr(u32[np + i]).replace('__imp__', ''); if (nm) { known.set(i, nm); names[i] = nm; } }
    return { samples: s, hits: h, names };
  };
})();
