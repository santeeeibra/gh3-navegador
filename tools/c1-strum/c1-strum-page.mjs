// Claude 2026-10-16: escritor de la cola de rasgueos C1 v2 (tools/c1-strum/c1_strum.h), basado en
// tools/sincronia/press-page.mjs (Codex). Diferencias: la cola vive en g1e_live_ptr()+64 (se conecta al
// enganchar los controles, también en menús), Gamepad usa gp.timestamp si es reciente, y ?c1strum=<bits>
// elige el modo (1 juicio con hora conservada, 2 entrega individual en C1, 4 hora DOM -> reloj de canción).
import {QUEUE, eventEpoch} from '../sincronia/press-queue.mjs';

const SONG_CLOCK = 0x82BD7C38;

export function createC1Writer(sab, ptr, getSeg) {
  const h = new Int32Array(sab, ptr, 8), dv = new DataView(sab);
  if ((Atomics.load(h, 0) >>> 0) !== QUEUE.magic || dv.getUint32(ptr + 32 + 64 * 64, true) !== 2) return null;
  const songClock = () => {
    const seg = getSeg();
    if (!seg) return NaN;
    const base = new Uint32Array(sab, seg, 256)[SONG_CLOCK >>> 24];
    return base ? dv.getFloat64((base + SONG_CLOCK) >>> 0, false) : NaN;
  };
  return function write({eventAt, writtenAt, buttons, triggers = 0, source = 0, flags = 0, seq = 0}) {
    const w = Atomics.load(h, 1) >>> 0, r = Atomics.load(h, 2) >>> 0;
    if (((w - r) >>> 0) >= QUEUE.capacity) { Atomics.add(h, 3, 1); return null; }
    const base = songClock(), after = songClock();
    const p = ptr + QUEUE.header + (w % QUEUE.capacity) * QUEUE.stride;
    dv.setFloat64(p, eventAt, true); dv.setFloat64(p + 8, writtenAt, true);
    dv.setFloat64(p + 16, base, true); dv.setFloat64(p + 24, after, true);
    for (const [o, v] of [[32, buttons], [36, triggers], [40, source], [44, flags], [48, w + 1], [52, seq]]) dv.setUint32(p + o, v >>> 0, true);
    dv.setUint32(p + 56, 0, true); dv.setUint32(p + 60, 0, true);
    Atomics.store(h, 1, (w + 1) | 0);  // último: publica el evento
    return w + 1;
  };
}

(() => {
  const q = new URLSearchParams(location.search);
  // Copia publicable: esbuild define C1STRUM_DEFAULT=7 (?c1strum=0 lo apaga). Pruebas: 0 salvo ?c1strum / ?syncpress=1.
  const def = typeof C1STRUM_DEFAULT === 'number' ? C1STRUM_DEFAULT : 0;
  const mode = q.has('c1strum') ? (Number(q.get('c1strum')) | 0) & 7 : (q.get('syncpress') === '1' ? 1 : def);
  // Tabla de segmentos (para leer el reloj al escribir): la publica el worker del juego en 'g1Mem'.
  let seg = 0;
  const hook = setInterval(() => {
    const w = window.g1worker;
    if (!w) return;
    clearInterval(hook);
    w.addEventListener('message', (e) => { if (e.data?.type === 'g1Mem' || e.data?.type === 'g1eInput') seg = e.data.seg || seg; });
  }, 300);
  let writer = null, lastEvent = null, header = null, sab = null, ptr = 0;
  const st = window.syncPress = {events: [], acks: [], mode, c1: 2};
  // Táctil: hora del último evento de puntero (gh3-touch la guarda al tocar y la reenvía en rasgueos demorados).
  st.touchAt = () => (lastEvent && lastEvent.type.startsWith('pointer') ? lastEvent.at : performance.timeOrigin + performance.now());
  for (const type of ['keydown', 'keyup', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel']) addEventListener(type, (e) => {
    const mark = eventEpoch(e.timeStamp, performance.timeOrigin, performance.now());
    lastEvent = {...mark, type};
    queueMicrotask(() => { if (lastEvent?.type === type && lastEvent.at === mark.at) lastEvent = null; });
  }, true);
  const connect = (s, p) => {
    if (writer && p === ptr) return;
    const wr = createC1Writer(s, p, () => window.g1mem?.seg || seg);
    if (!wr) return;
    writer = wr; sab = s; ptr = p; st.ptr = p;
    header = new Int32Array(s, p, 8);
    Atomics.store(header, 4, mode);
  };
  // Controles enganchados (menú incluido): la cola está en el estado en vivo + 64.
  window.c1StrumAttach = (s, livePtr) => connect(s, livePtr + 64);
  new BroadcastChannel('hw60').addEventListener('message', (e) => {
    const d = e.data;
    if (d?.type === 'syncPressMemory' && d.c1 === 2 && window.g1mem?.sab) connect(window.g1mem.sab, d.ptr);
    if (d?.type === 'syncPressEval' && st.acks.length < 2000) st.acks.push(d);
  });
  window.syncPressWrite = (buttons, triggers, source, seq, explicitAt) => {
    if (!writer) return;
    if (!(mode & 2) && !window.gh3Input?.songMode?.()) return;  // sin entrega individual: sólo en canción (como Codex)
    const writtenAt = performance.timeOrigin + performance.now();
    // Rasgueo táctil demorado (separar pulsos, rasgueo automático): conserva la hora del toque original.
    const touchAt = window.gh3Input?.touchAt;
    const touch = (source & 4) && Number.isFinite(touchAt) && touchAt <= writtenAt + 1 && touchAt >= writtenAt - 1000 ? {at: touchAt, flags: 16} : null;
    let mark = Number.isFinite(explicitAt) ? {at: explicitAt, flags: 4} : touch || lastEvent;
    const ts = window.gh3Input?.padTs;  // Gamepad: hora del último cambio que informa el navegador
    if (!mark && (source & 2) && Number.isFinite(ts) && ts > 0) {
      const at = performance.timeOrigin + ts;
      if (at <= writtenAt + 1 && at >= writtenAt - 50) mark = {at, flags: 8};
    }
    mark ||= {at: writtenAt, flags: 2};
    const id = writer({eventAt: mark.at, writtenAt, buttons, triggers, source, flags: mark.flags, seq});
    if (st.events.length < 2000) st.events.push({id, eventAt: mark.at, writtenAt, buttons, triggers, source, flags: mark.flags, seq});
  };
  const at = (o) => header ? Atomics.load(new Uint32Array(sab, ptr + 32 + 64 * 64, 8), o) >>> 0 : 0;
  Object.defineProperty(st, 'queueStats', {enumerable: true, get: () => header ? {
    written: Atomics.load(header, 1) >>> 0, read: Atomics.load(header, 2) >>> 0, dropped: Atomics.load(header, 3) >>> 0,
    rejected: Atomics.load(header, 5) >>> 0, gaps: Atomics.load(header, 6) >>> 0, delivered: Atomics.load(header, 7) >>> 0,
    ack: at(1), polls: at(2), lost: at(3), ackTimeouts: at(4), fused: at(5), judged: at(6), multi: at(7),
    native: Atomics.load(new Uint32Array(sab, ptr + 32 + 64 * 64 + 40, 1), 0) >>> 0} : null});
})();
