// Gobernador adaptativo móvil (Claude 2026-10-13; diseño de Codex en docs/nube/PLAN-MOVIL-PRIORIDADES.md, aprobado por Santi).
// Regla: el audio a ritmo original y los controles/juicio no se negocian; se sacrifican gráficos antes.
// - Mide cada 100 ms, con lecturas Atomics baratas: reserva de audio y su tendencia (SAB del worklet), costo de
//   preparación de snapshots del consumidor, espera de GPU, memoria visual, swaps del juego, latencia de entrada.
// - Estados normal → protegido → mínimo con tres perillas separadas por motivo (CPU, GPU, memoria). Recorta en el
//   mismo tick en que ve riesgo; recupera un escalón por vez sólo tras calma sostenida, con permanencia mínima y
//   una espera que se duplica si vuelve a recortar pronto (sin oscilar).
// - Las acciones las ejecutan el consumidor y el worker GPU (tools/r5-native60/governor-policy.mjs) leyendo el
//   tablero compartido. Nunca ralentiza la canción ni demora entradas: no toca audio, reloj ni mando.
// - Modo: celular = «activo»; PC = «observa» (calcula y registra, no cambia nada). ?gov=1 activo, ?gov=observa, ?gov=0 apagado.
// - Umbrales iniciales, NO calibrados: se ajustan con mediciones en el iPhone 11 real (gh3Governor.setConfig o
//   localStorage 'gh3gov.cfg'). Un promedio visual de 60 no certifica simulación ni respuesta jugable.
// La parte pura (createGovernor) también corre en Node: tests/movil-gobernador.test.mjs.
(function (root) {
  'use strict';
  // Índices del tablero: copia de tools/r5-native60/control.mjs (la prueba verifica que coincidan).
  const CTRL = Object.freeze({ LATCH: 0, PRESENTED: 1, LEVEL: 2, CPU: 3, GPU: 4, MEM: 5, POLICY_SEQ: 6, ACTIVE: 7, SWAPS: 8, SNAPSHOTS: 9,
    GOV_SKIPPED: 10, PREP_US: 11, PREP_MAX_US: 12, BUSY_DROPS: 13, GPU_US: 14, GPU_MAX_US: 15, TEX_GPU_KIB: 16, TEX_CPU_KIB: 17,
    SCALE_PCT: 18, RENDERED: 19, GPU_LOST: 20, SCENE_DEFERRED: 21, ROAD_ONLY: 22, BUF_KIB: 23, VERSION: 24, WORKER_US: 25,
    STAGE: 26, PRELOADED: 27, PRELOAD_PENDING: 28, SONG_BUILDS: 29 });
  // SAB de telemetría del worklet (index.html).
  const TEL = Object.freeze({ LAG: 0, UNDERRUNS: 1, SILENT: 2, SKIPS: 3, BLOCKS: 4, RATE_PPM: 5, MIN_LAG: 6, W: 7, STRETCH: 8, TARGET: 9, PLAYING: 10, PLAYED: 11 });
  const LEVELS = ['normal', 'protegido', 'mínimo'];
  const ACTIONS = { cpu: ['captura en cada swap', 'captura ≤ 1 cada 25 ms, sin texturas nuevas de escena', 'sólo pista/notas/colas/HUD'],
    gpu: ['1280×720', '960×540', '640×360'], mem: ['texturas inactivas 64 MiB', '40 MiB', '24 MiB, sin texturas nuevas de escena'] };
  const CONFIG = {
    tickMs: 100,
    audio: { lowFrac: 0.6, minLowFrac: 0.4, critFrac: 0.25, calmFrac: 0.8, calmMinFrac: 0.5, drainMsPerS: -50, rateLow: 0.985, rateCalm: 0.995, productionLow: 0.97, productionCalm: 0.99 },
    cpu: { prepMs: 12, prepMaxMs: 33, calmPrepMs: 8, calmPrepMaxMs: 20, latencyMs: 60, calmLatencyMs: 35, minSwapsPerSec: 0, calmSwapsPerSec: 0 },
    gpu: { protMs: 12, minMs: 20, maxMs: 40, calmProjectedMs: 9, calmMaxMs: 25 },
    mem: { budgetMiBMobile: 160, budgetMiBPc: 512, protFrac: 0.85, minFrac: 1.1, calmFrac: 0.6 },
    recover: { fromProtMs: 10000, fromMinMs: 5000, minDwellMs: 3000, flapWindowMs: 30000, maxBackoff: 8, resetBackoffMs: 120000 },
    anticipate: { startMs: 6000, songMs: 6000, returnMs: 4000, loadMaxMs: 60000 },
  };
  const SCALES = [1, 0.75, 0.5];
  const merge = (base, over) => { const out = {}; for (const k of Object.keys(base)) out[k] = base[k] && typeof base[k] === 'object' ? { ...base[k], ...(over?.[k] || {}) } : (over?.[k] ?? base[k]); return out; };

  function createGovernor(config) {
    let cfg = merge(CONFIG, config);
    const mk = () => ({ level: 0, since: -1e12, calmSince: null, backoff: 1, lastDropAt: -1e12, zeroSince: 0, why: '' });
    const knobs = { cpu: mk(), gpu: mk(), mem: mk() };
    const floor = { level: 0, until: 0, why: '' };
    const transitions = [], timeIn = [0, 0, 0];
    const out = { level: 0, cpu: 0, gpu: 0, mem: 0, changed: false, risk: null };
    const risk = { audio: 0, audioCalm: true, cpu: 0, cpuCalm: true, gpu: 0, gpuCalm: true, mem: 0, memCalm: true };
    let lastNow = null, level = 0, ticks = 0;

    // Riesgo por fuente. Valores numéricos sólo; los textos se arman sólo cuando cambia un nivel.
    function assess(s) {
      const A = cfg.audio, a = s.audio;
      risk.audio = 0; risk.audioCalm = true;
      if (a && a.playing) {
        const T = a.targetMs || 200;
        if (a.underrunsDelta > 0 || a.minReserveMs < T * A.critFrac) risk.audio = 2;
        else if (a.reserveMs < T * A.lowFrac || a.minReserveMs < T * A.minLowFrac || (a.trendMsPerS < A.drainMsPerS && a.reserveMs < T * 0.9)
          || a.rate < A.rateLow || (a.productionRatio != null && a.productionRatio < A.productionLow)) risk.audio = 1;
        risk.audioCalm = risk.audio === 0 && a.reserveMs >= T * A.calmFrac && a.minReserveMs >= T * A.calmMinFrac && a.rate >= A.rateCalm
          && (a.productionRatio == null || a.productionRatio >= A.productionCalm) && !(a.trendMsPerS < A.drainMsPerS / 2);
      }
      const P = cfg.cpu, c = s.cpu;
      risk.cpu = 0; risk.cpuCalm = true;
      if (c) {
        const lat = c.inputLatencyMs, sw = c.inSong && P.minSwapsPerSec > 0 && c.swapsPerSec != null;
        if ((c.prepMs != null && (c.prepMs > P.prepMs || c.prepMaxMs > P.prepMaxMs)) || (lat != null && lat > P.latencyMs) || (sw && c.swapsPerSec < P.minSwapsPerSec)) risk.cpu = 1;
        risk.cpuCalm = risk.cpu === 0 && (c.prepMs == null || (c.prepMs < P.calmPrepMs && c.prepMaxMs < P.calmPrepMaxMs))
          && (lat == null || lat < P.calmLatencyMs) && (!sw || c.swapsPerSec >= (P.calmSwapsPerSec || P.minSwapsPerSec));
      }
      const G = cfg.gpu, g = s.gpu;
      risk.gpu = 0; risk.gpuCalm = true;
      if (g) {
        if (g.lost || g.gpuMs > G.minMs) risk.gpu = 2;
        else if (g.gpuMs > G.protMs || g.gpuMaxMs > G.maxMs) risk.gpu = 1;
        // Calma = lo que costaría un escalón más de resolución (píxeles ∝ escala²) entra holgado en el cuadro.
        const cur = g.scale || SCALES[knobs.gpu.level], up = SCALES[Math.max(0, knobs.gpu.level - 1)];
        risk.gpuCalm = risk.gpu === 0 && g.gpuMs * (up * up) / (cur * cur) < G.calmProjectedMs && g.gpuMaxMs < G.calmMaxMs;
      }
      const M = cfg.mem, m = s.mem;
      risk.mem = 0; risk.memCalm = true;
      if (m) {
        const budget = m.budgetMiB || M.budgetMiBMobile;
        if (m.lost || m.visualMiB > budget * M.minFrac) risk.mem = 2; else if (m.visualMiB > budget * M.protFrac) risk.mem = 1;
        risk.memCalm = risk.mem === 0 && m.visualMiB < budget * M.calmFrac;
      }
      return risk;
    }
    function reason(name, s) {
      const a = s.audio, c = s.cpu, g = s.gpu, m = s.mem, f = (v) => v == null ? '—' : Math.round(v * 10) / 10;
      const parts = [];
      if (risk.audio) parts.push(a.underrunsDelta > 0 ? 'audio: corte' : `audio: colchón ${f(a.reserveMs)} ms (mín ${f(a.minReserveMs)}), ritmo ${f(a.rate * 100)} %, producción ${a.productionRatio == null ? '—' : f(a.productionRatio * 100) + ' %'}`);
      if (name === 'cpu' && risk.cpu) parts.push(`cpu: preparación ${f(c.prepMs)} ms (máx ${f(c.prepMaxMs)}), latencia ${f(c.inputLatencyMs)} ms`);
      if (name === 'gpu' && risk.gpu) parts.push(g.lost ? 'gpu: dispositivo perdido' : `gpu: ${f(g.gpuMs)} ms (máx ${f(g.gpuMaxMs)})`);
      if (name === 'mem' && risk.mem) parts.push(m.lost ? 'memoria: dispositivo perdido' : `memoria visual ${f(m.visualMiB)} MiB`);
      if (floor.level && s.now < floor.until) parts.push('anticipo: ' + floor.why);
      return parts.join(' · ') || 'calma';
    }
    function step(name, k, target, calm, s) {
      const now = s.now, R = cfg.recover;
      if (target > k.level) {
        if (now - k.lastDropAt < R.flapWindowMs) k.backoff = Math.min(R.maxBackoff, k.backoff * 2);
        k.level = target; k.since = now; k.calmSince = null; k.why = reason(name, s); return true;
      }
      if (k.level === 0) { if (now - k.zeroSince > R.resetBackoffMs) k.backoff = 1; return false; }
      if (!calm) { k.calmSince = null; return false; }
      if (k.calmSince === null) k.calmSince = now;
      if (target >= k.level) return false;  // el anticipo sostiene el nivel; la calma igual se va contando
      const hold = (k.level === 2 ? R.fromMinMs : R.fromProtMs) * k.backoff;
      if (now - k.calmSince >= hold && now - k.since >= R.minDwellMs) {
        k.level--; k.since = now; k.calmSince = now; k.lastDropAt = now; if (!k.level) k.zeroSince = now; k.why = 'recuperación tras calma sostenida'; return true;
      }
      return false;
    }
    // s = { now, audio, cpu, gpu, mem } (cualquiera puede ser null). Devuelve el mismo objeto `out` en cada tick.
    function tick(s) {
      ticks++;
      const now = s.now; assess(s);
      const audioEmergency = risk.audio === 2, audioRisk = risk.audio === 1;
      const flo = now < floor.until ? floor.level : 0;
      const tCpu = Math.max(risk.cpu, risk.audio, flo);
      const tGpu = Math.max(risk.gpu, audioEmergency ? 2 : audioRisk && s.gpu && s.gpu.gpuMs > cfg.gpu.protMs * 0.66 ? 1 : 0, flo);
      const tMem = Math.max(risk.mem, audioEmergency ? 1 : 0);
      const audioOk = risk.audioCalm;
      // Una perilla sólo recupera si su fuente está en calma y el audio también (y el anticipo ya venció: ver step).
      const before0 = knobs.cpu.level, before1 = knobs.gpu.level, before2 = knobs.mem.level;
      let changed = step('cpu', knobs.cpu, tCpu, risk.cpuCalm && audioOk, s);
      changed = step('gpu', knobs.gpu, tGpu, risk.gpuCalm && audioOk, s) || changed;
      changed = step('mem', knobs.mem, tMem, risk.memCalm && audioOk, s) || changed;
      if (lastNow !== null) timeIn[level] += Math.max(0, Math.min(1000, now - lastNow));
      lastNow = now;
      level = Math.max(knobs.cpu.level, knobs.gpu.level, knobs.mem.level);
      if (changed) {
        const why = [...new Set([knobs.cpu, knobs.gpu, knobs.mem].filter((k, i) => k.level !== [before0, before1, before2][i]).map((k) => k.why))].join(' | ');
        transitions.push({ t: Math.round(now), estado: LEVELS[level], de: [before0, before1, before2], a: [knobs.cpu.level, knobs.gpu.level, knobs.mem.level], por: why });
        if (transitions.length > 60) transitions.splice(0, transitions.length - 60);
      }
      out.level = level; out.cpu = knobs.cpu.level; out.gpu = knobs.gpu.level; out.mem = knobs.mem.level; out.changed = changed; out.risk = risk;
      return out;
    }
    // Protección anticipada: nivel mínimo para CPU y GPU hasta `now + ms`. replace = reemplaza el anticipo vigente.
    function anticipate(lvl, ms, why, now, replace = false) {
      const until = now + ms;
      if (replace || now >= floor.until) { floor.level = lvl; floor.until = until; floor.why = why; return; }
      if (lvl > floor.level || until > floor.until) { floor.level = Math.max(lvl, floor.level); floor.until = Math.max(until, floor.until); floor.why = why; }
    }
    return {
      tick, anticipate, knobs, transitions, timeIn, risk, out,
      get level() { return level; }, get ticks() { return ticks; }, get floor() { return { ...floor }; },
      get config() { return cfg; }, setConfig(over) { cfg = merge(cfg, over); },
    };
  }
  // Escribe la política en el tablero sólo si cambió. En modo «observa» deja todo en 0 (no actúa).
  function writeBoard(i32, out, active) {
    if (!i32 || i32.length <= CTRL.VERSION || Atomics.load(i32, CTRL.VERSION) < 1) return false;
    const L = active ? out.level : 0, c = active ? out.cpu : 0, g = active ? out.gpu : 0, m = active ? out.mem : 0, a = active ? 1 : 0;
    if (Atomics.load(i32, CTRL.LEVEL) === L && Atomics.load(i32, CTRL.CPU) === c && Atomics.load(i32, CTRL.GPU) === g && Atomics.load(i32, CTRL.MEM) === m && Atomics.load(i32, CTRL.ACTIVE) === a) return false;
    Atomics.store(i32, CTRL.CPU, c); Atomics.store(i32, CTRL.GPU, g); Atomics.store(i32, CTRL.MEM, m); Atomics.store(i32, CTRL.ACTIVE, a);
    Atomics.store(i32, CTRL.LEVEL, L); Atomics.add(i32, CTRL.POLICY_SEQ, 1);
    return true;
  }
  root.gh3GovernorCore = { CTRL, TEL, CONFIG, LEVELS, ACTIONS, SCALES, createGovernor, writeBoard };
  if (!root.document || typeof root.addEventListener !== 'function') return;

  // ----------------------------- página -----------------------------
  const params = new URLSearchParams(location.search), qv = params.get('gov');
  const mobile = !!(root.gh3Quality?.mobile ?? root.gh3IsMobile);
  const mode = qv === '0' ? 'apagado' : qv === '1' ? 'activo' : qv === 'observa' ? 'observa' : mobile ? 'activo' : 'observa';
  let stage = 0;  // 0 sin dato, 1 cargas/menús, 2 canción en juego (CTRL.STAGE)
  let saved = null; try { saved = JSON.parse(localStorage.getItem('gh3gov.cfg') || 'null'); } catch {}
  const gov = createGovernor(saved || undefined);
  const memBudget = mobile ? gov.config.mem.budgetMiBMobile : gov.config.mem.budgetMiBPc;
  let tel = null, ctl = null, timer = 0, sr = 48000, attachedAt = 0;
  // Muestra reutilizada: sin objetos nuevos por tick.
  const A = { playing: false, reserveMs: 0, minReserveMs: 0, targetMs: 200, underrunsDelta: 0, skipsDelta: 0, rate: 1, productionRatio: null, trendMsPerS: 0 };
  const P = { prepMs: null, prepMaxMs: 0, inputLatencyMs: null, swapsPerSec: null, inSong: false };
  const G = { gpuMs: 0, gpuMaxMs: 0, workerMs: 0, scale: 1, lost: false };
  const M = { visualMiB: 0, budgetMiB: memBudget, lost: false };
  const sample = { now: 0, audio: null, cpu: P, gpu: null, mem: null };
  const prev = { at: 0, blocks: -1, under: 0, skips: 0, w: 0, stretch: 0, swaps: 0, snaps: 0, rendered: 0, frames: 0, reserveEwma: null, lastSnapAt: 0, lastRenderAt: 0, prodW: 0, prodT: 0, prodN: 0 };
  const meas = { audioProduction: null, swapsPerSec: null, snapshotsPerSec: null, presentedFps: null, prepEwma: null, renderedPerSec: null };
  const totals = { underruns: 0, skips: 0, stretched: 0, underrunsAtAttach: null };
  const ewma = (old, v, a) => old == null ? v : old + (v - old) * a;
  const wouldBe = { cpu: 0, gpu: 0, mem: 0 };

  function readAudio(now, dt) {
    if (!tel) return null;
    const blocks = Atomics.load(tel, TEL.BLOCKS), lag = Atomics.load(tel, TEL.LAG), target = Atomics.load(tel, TEL.TARGET) || 9600;
    const minLag = Atomics.exchange(tel, TEL.MIN_LAG, 0x7fffffff), under = Atomics.load(tel, TEL.UNDERRUNS), skips = Atomics.load(tel, TEL.SKIPS);
    const w = Atomics.load(tel, TEL.W) >>> 0, playing = Atomics.load(tel, TEL.PLAYING) === 1 && prev.blocks >= 0 && blocks !== prev.blocks;
    totals.underruns = under; totals.skips = skips; totals.stretched = Atomics.load(tel, TEL.STRETCH);
    A.playing = playing; A.targetMs = target / sr * 1000; A.reserveMs = lag / sr * 1000;
    A.minReserveMs = minLag === 0x7fffffff ? A.reserveMs : minLag / sr * 1000;
    A.underrunsDelta = prev.blocks >= 0 ? under - prev.under : 0; A.skipsDelta = prev.blocks >= 0 ? skips - prev.skips : 0;
    A.rate = (Atomics.load(tel, TEL.RATE_PPM) || 1e6) / 1e6;
    if (playing && dt > 0 && dt < 1000 && prev.blocks >= 0) {
      // Producción en ventanas de ≥1 s (el juego escribe a ráfagas: 100 ms sueltos son ruido) y recién desde la 2.ª ventana.
      prev.prodW += (w - prev.w) >>> 0; prev.prodT += dt;
      if (prev.prodT >= 1000) { const ratio = prev.prodW / (prev.prodT / 1000 * sr); if (ratio < 4) { meas.audioProduction = ewma(meas.audioProduction, ratio, 0.3); prev.prodN++; } prev.prodW = prev.prodT = 0; }
      const r0 = prev.reserveEwma; prev.reserveEwma = ewma(prev.reserveEwma, A.reserveMs, 0.3);
      if (r0 != null) A.trendMsPerS = ewma(A.trendMsPerS, (prev.reserveEwma - r0) / dt * 1000, 0.2);
    } else if (!playing) { meas.audioProduction = null; prev.reserveEwma = null; A.trendMsPerS = 0; prev.prodW = prev.prodT = prev.prodN = 0; }
    A.productionRatio = prev.prodN >= 2 ? meas.audioProduction : null;
    prev.blocks = blocks; prev.under = under; prev.skips = skips; prev.w = w;
    return playing ? A : null;
  }
  function readBoard(now, dt) {
    sample.gpu = null; sample.mem = null; P.prepMs = null; P.prepMaxMs = 0;
    if (!ctl || Atomics.load(ctl, CTRL.VERSION) < 1) return;
    const swaps = Atomics.load(ctl, CTRL.SWAPS), snaps = Atomics.load(ctl, CTRL.SNAPSHOTS), rendered = Atomics.load(ctl, CTRL.RENDERED);
    if (dt > 0 && dt < 1000) {
      meas.swapsPerSec = ewma(meas.swapsPerSec, (swaps - prev.swaps) / dt * 1000, 0.1);
      meas.snapshotsPerSec = ewma(meas.snapshotsPerSec, (snaps - prev.snaps) / dt * 1000, 0.1);
      meas.renderedPerSec = ewma(meas.renderedPerSec, (rendered - prev.rendered) / dt * 1000, 0.1);
    }
    if (snaps !== prev.snaps) prev.lastSnapAt = now;
    if (rendered !== prev.rendered) prev.lastRenderAt = now;
    prev.swaps = swaps; prev.snaps = snaps; prev.rendered = rendered;
    const prepMax = Atomics.exchange(ctl, CTRL.PREP_MAX_US, 0) / 1000, gpuMax = Atomics.exchange(ctl, CTRL.GPU_MAX_US, 0) / 1000;
    if (now - prev.lastSnapAt < 1000) { meas.prepEwma = ewma(meas.prepEwma, Atomics.load(ctl, CTRL.PREP_US) / 1000, 0.25); P.prepMs = meas.prepEwma; P.prepMaxMs = prepMax; }
    P.swapsPerSec = meas.swapsPerSec;
    G.lost = M.lost = Atomics.load(ctl, CTRL.GPU_LOST) === 1;
    if (now - prev.lastRenderAt < 1000 || G.lost) {
      G.gpuMs = Atomics.load(ctl, CTRL.GPU_US) / 1000; G.gpuMaxMs = gpuMax; G.workerMs = Atomics.load(ctl, CTRL.WORKER_US) / 1000;
      G.scale = (Atomics.load(ctl, CTRL.SCALE_PCT) || 100) / 100; sample.gpu = G;
    }
    M.visualMiB = (Atomics.load(ctl, CTRL.TEX_GPU_KIB) + Atomics.load(ctl, CTRL.TEX_CPU_KIB) + Atomics.load(ctl, CTRL.BUF_KIB)) / 1024;
    sample.mem = M;
  }
  function readInput() {
    const L = root.gh3Input?.stats?.lat;
    P.inputLatencyMs = L && L.n ? Math.max(L.ewmaMs, L.pending || 0) : (L && L.pending > 0 ? L.pending : null);
    P.inSong = !!root.gh3Input?.songMode?.();
  }
  function frames(dt) {
    const c = root.d4?.native60Cadence; if (!c) return;
    if (dt > 0 && dt < 1000 && c.frames >= prev.frames) meas.presentedFps = ewma(meas.presentedFps, (c.frames - prev.frames) / dt * 1000, 0.1);
    prev.frames = c.frames;
  }
  function tick() {
    const now = performance.now(), dt = prev.at ? now - prev.at : 0;
    sample.now = now; sample.audio = readAudio(now, dt); readBoard(now, dt); readInput(); frames(dt);
    prev.at = now;
    const o = gov.tick(sample);
    wouldBe.cpu = o.cpu; wouldBe.gpu = o.gpu; wouldBe.mem = o.mem;
    if (ctl) writeBoard(ctl, o, mode === 'activo');
    if (o.changed) { try { root.dispatchEvent(new CustomEvent('gh3governor', { detail: { estado: LEVELS[o.level], cpu: o.cpu, gpu: o.gpu, mem: o.mem, modo: mode } })); } catch {} }
  }
  function start() {
    if (mode === 'apagado' || timer) return;
    attachedAt = performance.now(); gov.anticipate(1, gov.config.anticipate.startMs, 'arranque', attachedAt);
    timer = setInterval(tick, gov.config.tickMs);
  }
  const api = root.gh3Governor = {
    mode, core: gov,
    attachAudio(sab, opts = {}) { tel = new Int32Array(sab); sr = root.r6ctx?.sampleRate || 48000; totals.underrunsAtAttach = Atomics.load(tel, TEL.UNDERRUNS); prev.blocks = -1; api.band = opts.band || 0; start(); },
    attachControl(sab) { const i = new Int32Array(sab); if (i.length > CTRL.VERSION && Atomics.load(i, CTRL.VERSION) >= 1) { ctl = i; if (stage) Atomics.store(ctl, CTRL.STAGE, stage); if (mode !== 'activo') writeBoard(ctl, gov.out, false); start(); } else api.oldConsumer = true; },
    anticipate(why, ms) { gov.anticipate(1, ms, why, performance.now()); },
    setConfig(over, persist) { gov.setConfig(over); if (persist) try { localStorage.setItem('gh3gov.cfg', JSON.stringify(over)); } catch {} },
    tick,
    summary() {
      const o = gov.out, r = (v, d = 1) => v == null ? null : Math.round(v * 10 ** d) / 10 ** d, k = mode === 'activo' ? o : { cpu: 0, gpu: 0, mem: 0 };
      return {
        modo: mode, estado: LEVELS[mode === 'activo' ? o.level : 0], decision: { estado: LEVELS[o.level], cpu: o.cpu, gpu: o.gpu, mem: o.mem },
        acciones: { cpu: ACTIONS.cpu[k.cpu], gpu: ACTIONS.gpu[k.gpu], mem: ACTIONS.mem[k.mem] },
        segundosEnEstado: { normal: r(gov.timeIn[0] / 1000), protegido: r(gov.timeIn[1] / 1000), minimo: r(gov.timeIn[2] / 1000) },
        transiciones: gov.transitions.slice(-20),
        // Métricas separadas: imagen presentada ≠ simulación del juego ≠ respuesta de controles.
        medidas: {
          fpsPresentados: r(meas.presentedFps), swapsJuegoPorSeg: r(meas.swapsPerSec), snapshotsPorSeg: r(meas.snapshotsPerSec), cuadrosGpuPorSeg: r(meas.renderedPerSec),
          produccionAudio: r(meas.audioProduction, 3), colchonMs: r(A.reserveMs), colchonMinMs: r(A.minReserveMs), ritmoAudio: r(A.rate, 4), tendenciaColchonMsPorSeg: r(A.trendMsPerS),
          preparacionMs: r(meas.prepEwma), gpuMs: r(G.gpuMs), workerMs: r(G.workerMs), escala: G.scale, memoriaVisualMiB: r(M.visualMiB), presupuestoMiB: memBudget,
          swapsSalteados: ctl ? Atomics.load(ctl, CTRL.GOV_SKIPPED) : null, descartesPorOcupado: ctl ? Atomics.load(ctl, CTRL.BUSY_DROPS) : null, soloPista: ctl ? Atomics.load(ctl, CTRL.ROAD_ONLY) === 1 : null,
          escenaDiferida: ctl ? Atomics.load(ctl, CTRL.SCENE_DEFERRED) : null, gpuPerdida: G.lost,
          precarga: ctl ? { hechas: Atomics.load(ctl, CTRL.PRELOADED), pendientes: Atomics.load(ctl, CTRL.PRELOAD_PENDING), compiladasEnJuego: Atomics.load(ctl, CTRL.SONG_BUILDS) } : null,
          formatosGpu: root.d4?.songRenderer?.temporal?.compression || null,
          latenciaJuego: root.gh3Input?.latencyReport?.() || null,
          demoraToque: root.gh3Touch?.stats?.evN ? { toques: root.gh3Touch.stats.evN, promedioMs: r(root.gh3Touch.stats.evSumMs / root.gh3Touch.stats.evN), maxMs: r(root.gh3Touch.stats.evMaxMs) } : null,
        },
        // Validación: cualquier corte o salto del sonido esperado es falla. Los contadores no se borran.
        audio: { cortes: totals.underruns, saltos: totals.skips, bloquesEstirados: totals.stretched, limiteRitmo: api.band || 'sin límite (0,96–1,03)', falla: totals.underruns > 0 || totals.skips > 0 },
        consumidorViejo: !!api.oldConsumer, sinTablero: !ctl, sinAudio: !tel,
      };
    },
  };
  // Protección anticipada: carga del nivel, inicio de canción y vuelta desde segundo plano.
  root.addEventListener('gh3stage', (e) => {
    const s = e.detail?.stage, a = gov.config.anticipate, now = performance.now();
    // Precarga (worker GPU): compila lo recordado sólo fuera del tramo de juego.
    if (s) { stage = s === 'songPlaying' ? 2 : 1; if (ctl) Atomics.store(ctl, CTRL.STAGE, stage); }
    if (s === 'loadStart' || s === 'levelConfirmed') gov.anticipate(1, a.loadMaxMs, 'carga del nivel', now);
    if (s === 'songPlaying') gov.anticipate(1, a.songMs, 'inicio de canción', now, true);
  });
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') hiddenAt = performance.now();
    else if (hiddenAt) { gov.anticipate(1, gov.config.anticipate.returnMs, 'vuelta de segundo plano', performance.now()); hiddenAt = 0; }
  });
})(typeof window !== 'undefined' ? window : globalThis);
