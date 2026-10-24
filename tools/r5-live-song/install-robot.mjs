// Test control only, copied from Claude song-bot (source untouched).
export async function installRobot(page,chart,clockAddr="0x829B57B0",kind="ms",leadMs=-350){
  await page.evaluate(({ notes, addr, kind, lead, leads, strums }) => {
    const src = `
      // Esquema GH3 con mando común (comprobado con imagen en el nativo): verde LT, rojo LB, amarillo RB, azul RT, naranja A.
      const FRET = [0, 0x0100, 0x0200, 0, 0x1000]; let DOWN = 0x0002;  // DOWN = botón de rasgueo del intento (0 = sin rasgueo: el traste se aprieta en el tiempo de la nota)
      let M = null, L = null, armed = false, notes = [], addr = 0, kind = 'ms', lead = 0;
      const st = { strums: 0, clockMax: -1e9, resets: 0, loops: 0, attempts: [] };
      // Barrido: cada reintento usa el siguiente adelanto (ms). Al perder, aprieta A (Reintentar) cada 3 s.
      const LEADS = (self.LEADS || [0]); let att = 0, frozenSince = 0, nextA = 0, aUntil = 0;
      onmessage = (e) => { const d = e.data;
        if (d.type === 'init') { ({ notes, addr, kind, lead } = d); self.LEADS = d.leads; self.STRUMS = d.strums; lead = d.leads[0]; DOWN = d.strums[0]; st.attempts.push({ lead, strum: DOWN, max: -1e9, strums: 0 }); }
        if (d.type === 'mem') M = { sab: d.sab, seg: d.seg };
        if (d.type === 'live') L = new Int32Array(d.sab, d.ptr, 11);
        if (d.type === 'arm') armed = true;
        if (d.type === 'stats') postMessage({ type: 'stats', st, now: clock() });
      };
      const clock = () => { if (!M) return NaN; const t = new Uint32Array(M.sab, M.seg, 256), h = (t[addr >>> 24] + addr) >>> 0;
        if (h + 4 > M.sab.byteLength) return NaN; const v = new DataView(M.sab).getFloat32(h, false); return kind === 'f' ? v * 1000 : v; };
      const nap = new Int32Array(new SharedArrayBuffer(4));
      let i = 0, frets = 0, strumUntil = 0, prev = null, last = -1;
      (function loop() {
        for (;;) {
          Atomics.wait(nap, 0, 0, 1); st.loops++;
          if (!armed || !L) { if (st.loops % 50 === 0) { setTimeout(loop, 0); return; } continue; }
          const raw = clock(); if (!Number.isFinite(raw)) continue;
          const pnow = performance.now();
          if (prev !== null && raw < prev - 1000) { st.resets++; i = 0; frets = 0; att++; lead = self.LEADS[att % self.LEADS.length]; DOWN = self.STRUMS[att % self.STRUMS.length]; st.attempts.push({ lead, strum: DOWN, max: -1e9, strums: 0 }); }
          if (prev === null || raw !== prev) frozenSince = pnow;
          prev = raw; if (raw > st.clockMax) st.clockMax = raw; const A = st.attempts[st.attempts.length - 1]; if (raw > A.max) A.max = raw;
          if (raw > 5000 && pnow - frozenSince > 2500 && pnow > nextA) { nextA = pnow + 3000; aUntil = pnow + 150; Atomics.or(L, 10, 0x1000); }
          if (pnow < aUntil) { Atomics.store(L, 2, 0); Atomics.store(L, 1, 0x1000); Atomics.add(L, 0, 1); last = 0x1000; continue; }
          const now = raw + lead;
          while (i < notes.length && notes[i].t < now - 150) i++;
          let tap = 0;
          if (i < notes.length) { const n = notes[i];
            if (DOWN && now >= n.t - 70) frets = n.mask & 31;
            if (!DOWN && now >= n.t - 90 && now < n.t) frets = 0;  // sin rasgueo: soltar justo antes para volver a apretar
            if (now >= n.t) { if (!DOWN) frets = n.mask & 31; tap = DOWN; strumUntil = performance.now() + 30; st.strums++; A.strums++; i++; } }
          let b = 0; for (let k = 0; k < 5; k++) if (frets & (1 << k)) b |= FRET[k];
          const tr = (frets & 1 ? 255 : 0) | (frets & 8 ? 255 << 8 : 0);
          if (performance.now() < strumUntil) b |= DOWN;
          const key = b | (tr << 16);
          if (key !== last || tap) { if (tap) Atomics.or(L, 10, tap); Atomics.store(L, 2, tr); Atomics.store(L, 1, b); Atomics.add(L, 0, 1); last = key; }
          if (st.loops % 200 === 0) { setTimeout(loop, 0); return; }  // deja entrar mensajes
        }
      })();`;
    const bw = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    window.previewRobot = bw;
    bw.postMessage({ type: 'init', notes, addr, kind, lead, leads, strums });
    const st = window.botStats = { strums: 0, clockMax: -1e9, resets: 0, samples: [] };
    bw.onmessage = (e) => { Object.assign(st, e.data.st); st.samples.push([+(performance.now() / 1000).toFixed(2), +(e.data.now / 1000).toFixed(3), e.data.st.strums]); };
    let sentLive = false, armed = false;
    window.previewRobotInterval = setInterval(() => {
      if (window.g1mem) bw.postMessage({ type: 'mem', sab: window.g1mem.sab, seg: window.g1mem.seg });
      if (!sentLive && window.g1live) { bw.postMessage({ type: 'live', sab: window.g1live.sab, ptr: window.g1live.ptr }); sentLive = true; }
      if (!armed && window.d4.log.some((l) => /_song.pak.xen/.test(l))) { bw.postMessage({ type: 'arm' }); armed = true; }
      bw.postMessage({ type: 'stats' });
    }, 1000);
  }, { notes: chart.notes, addr: parseInt(clockAddr, 16), kind, lead: +leadMs, leads: String(process.env.BOT_LEADS || leadMs).split(',').map(Number), strums: String(process.env.BOT_STRUMS || '2').split(',').map(Number) });

}
