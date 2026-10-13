// Canción híbrida (Claude): autopista de notas PROVISORIA dibujada por la página sobre el GH3 original en wasm.
// El juego original pone el audio, juzga aciertos/fallos y lleva el puntaje; esta página solo dibuja las notas
// reales de la canción (leídas del .pak.xen de la carpeta que elige el usuario, sin servidor) al ritmo del reloj
// de la canción que el juego guarda en su memoria (lectura del SharedArrayBuffer, sin escribir nada).
// Formato: songs/<nombre>_song.pak.xen = deflate crudo → PAK (entradas de 32 B, offset relativo a la entrada)
// → QB big-endian; la tabla <nombre>_song_<dificultad> es un arreglo de enteros [tiempo ms, largo ms, máscara].
(() => {
  const T = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  const qbKey = (s) => { let c = 0xFFFFFFFF; for (const ch of s.toLowerCase()) c = T[(c ^ ch.charCodeAt(0)) & 255] ^ (c >>> 8); return c >>> 0; };

  // Devuelve {notes:[{t,len,mask}], beats:[ms]} o lanza un error explicando qué faltó.
  function parseSongPak(pak, name, diff) {
    const dv = new DataView(pak.buffer, pak.byteOffset, pak.byteLength);
    const qbType = qbKey('.qb');
    let qb = null;
    for (let e = 0; e + 32 <= pak.length; e += 32) {
      const type = dv.getUint32(e), off = dv.getUint32(e + 4), size = dv.getUint32(e + 8);
      if (type === qbKey('.last') || type === 0x2CB3EF3B) break;
      if (type === qbType || type === 0xA7F505C4) {
        const cand = pak.subarray(e + off, e + off + size);
        if (findItem(cand, qbKey(`${name}_song_${diff}`)) >= 0) { qb = cand; break; }
      }
    }
    if (!qb) throw new Error(`no encontré la tabla ${name}_song_${diff} en el pak`);
    const notes = [], raw = intArray(qb, qbKey(`${name}_song_${diff}`));
    for (let i = 0; i + 2 < raw.length; i += 3) notes.push({ t: raw[i], len: raw[i + 1], mask: raw[i + 2] });
    let beats = [];
    try { beats = intArray(qb, qbKey(`${name}_fretbars`)); } catch {}
    return { notes, beats };
  }
  function findItem(qb, key) {
    const dv = new DataView(qb.buffer, qb.byteOffset, qb.byteLength);
    for (let i = 28; i + 20 <= qb.length; i += 4) if (dv.getUint32(i) === key && (dv.getUint32(i - 4) & 0xFFFF00FF) === 0x00200000) return i - 4;
    return -1;
  }
  function intArray(qb, key) {
    const dv = new DataView(qb.buffer, qb.byteOffset, qb.byteLength), it = findItem(qb, key);
    if (it < 0) throw new Error('tabla ausente');
    const d = dv.getUint32(it + 12), hdr = dv.getUint32(d), n = dv.getUint32(d + 4);
    if ((hdr & 0xFF00) !== 0x0100) throw new Error(`tabla ${key.toString(16)} no es de enteros (${hdr.toString(16)})`);
    if (n === 0) return [];
    const p = n === 1 ? d + 8 : dv.getUint32(d + 8), out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = dv.getInt32(p + i * 4);
    return out;
  }
  async function inflateRaw(file) {
    const ds = new DecompressionStream('deflate-raw');
    return new Uint8Array(await new Response(file.stream().pipeThrough(ds)).arrayBuffer());
  }

  // ---- Dibujo ----
  const COLORS = ['#2ecc40', '#ff4136', '#ffdc00', '#0074d9', '#ff851b'];
  const S = window.gh3Song = { parseSongPak, qbKey, inflateRaw, chart: null, clock: null, offsetMs: 0, lookMs: 1400, stats: {} };
  S.loadFromFiles = async (files, name = 'slowride', diff = 'medium') => {
    const f = [...files].find((x) => (x.webkitRelativePath || x.name).toLowerCase().endsWith(`songs/${name}_song.pak.xen`));
    if (!f) throw new Error(`falta ${name}_song.pak.xen en la carpeta elegida`);
    S.chart = parseSongPak(await inflateRaw(f), name, diff);
    S.chart.name = name; S.chart.diff = diff;
    return S.chart;
  };
  // Reloj: dirección guest del reloj de la canción (BE) dentro de la memoria del juego.
  S.attachClock = (sab, seg, addr, kind = 'f') => {
    const t = new Uint32Array(sab, seg, 256), dv = new DataView(sab);
    // kind: 'f' float segundos, 'ms' float milisegundos, 'i' entero milisegundos.
    S.clock = () => { const h = (t[addr >>> 24] + addr) >>> 0; return kind === 'f' ? dv.getFloat32(h, false) * 1000 : kind === 'ms' ? dv.getFloat32(h, false) : dv.getUint32(h, false); };
  };
  S.draw = (cv, held = 0) => {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.fillStyle = '#111'; g.fillRect(0, 0, W, H);
    const waiting = S.waitText ? S.waitText() : 'Esperando la canción…';
    if (!S.chart || !S.clock || !(S.clock() < 0 || S.clock() > 0)) { g.fillStyle = '#ccc'; g.font = '17px sans-serif'; const lines = ['']; for (const w of waiting.split(' ')) { if ((lines[lines.length - 1] + ' ' + w).length > 38) lines.push(w); else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + w).trim(); }
      lines.forEach((l, k) => g.fillText(l, 16, 40 + k * 26)); return; }
    const now = S.clock ? S.clock() + S.offsetMs : NaN;
    const laneW = W / 5, strike = H - 70, pxPerMs = (strike - 20) / S.lookMs;
    const y = (t) => strike - (t - now) * pxPerMs;
    g.strokeStyle = '#333'; g.lineWidth = 1;
    for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(i * laneW, 0); g.lineTo(i * laneW, H); g.stroke(); }
    if (Number.isFinite(now)) {
      g.strokeStyle = '#444';
      for (const b of S.chart.beats) { const yy = y(b); if (yy < -5 || yy > H) continue; g.beginPath(); g.moveTo(0, yy); g.lineTo(W, yy); g.stroke(); }
      for (const n of S.chart.notes) {
        if (n.t + n.len < now - 200) continue;
        if (n.t > now + S.lookMs) break;
        for (let i = 0; i < 5; i++) {
          if (!(n.mask & (1 << i))) continue;
          const cx = i * laneW + laneW / 2;
          if (n.len > 0) { g.fillStyle = COLORS[i]; g.globalAlpha = 0.5; g.fillRect(cx - 6, y(n.t + n.len), 12, y(n.t) - y(n.t + n.len)); g.globalAlpha = 1; }
          g.fillStyle = COLORS[i]; g.beginPath(); g.ellipse(cx, y(n.t), laneW * 0.32, 14, 0, 0, 7); g.fill();
          if (n.mask & 0x20) { g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke(); }
        }
      }
    }
    for (let i = 0; i < 5; i++) {
      const cx = i * laneW + laneW / 2;
      g.lineWidth = 4; g.strokeStyle = COLORS[i]; g.beginPath(); g.ellipse(cx, strike, laneW * 0.34, 16, 0, 0, 7); g.stroke();
      if (held & (1 << i)) { g.fillStyle = COLORS[i]; g.globalAlpha = 0.6; g.fill(); g.globalAlpha = 1; }
    }
    g.fillStyle = '#ddd'; g.font = '14px sans-serif';
    g.fillText(Number.isFinite(now) ? `reloj del juego ${(now / 1000).toFixed(2)} s · ${S.chart.name} ${S.chart.diff} · ${S.chart.notes.length} notas` : 'esperando el reloj de la canción…', 8, H - 12);
  };
})();
