#pragma once
// Claude 2026-10-16: variante de tools/sincronia/press_probe.h (Codex) que toma el rasgueo que C1 entregó
// (c1_strum.h: ID, consulta, hora y reloj de la entrega, trastes del instante) en vez de adivinar "el único
// pendiente". Mismos puntos de inserción en sub_8211F8B8 y mismas reglas: f23 (ventanas) usa la hora
// conservada, f29 (historial de trastes/sostenidos) queda nativo; retorno de 82266240, márgenes y score intactos.
// Datos inválidos, viejos, fusionados o trastes distintos -> comportamiento original.
#include <atomic>
#include <cmath>
#include <cstddef>
#include "judgement_probe.h"
#include "c1_strum.h"

inline thread_local c1s::Event sync_press_active{};
inline thread_local bool sync_press_selected = false;
inline thread_local const c1s::Event* sync_press_pending = nullptr;
inline thread_local double sync_press_native_sec = 0, sync_press_used_sec = 0, sync_press_pending_sec = 0;
inline thread_local uint32_t sync_press_seen = 0;  // entregas de C1 ya tomadas por el juicio

// Hora DOM (ms epoch) -> reloj de canción (s). El reloj que devuelve 82266240 avanza a saltos y puede estar
// atrasado respecto de la hora real, nunca adelantado. Con las últimas vueltas (hora, reloj) se estima el
// ritmo (reloj/hora real) y el desfase menos atrasado (máximo de reloj - ritmo*hora en ~1 s).
struct SyncClockMap {
  double t[32]{}, n[32]{};
  uint32_t k = 0, count = 0;
  double anchor_t = 0, anchor_n = 0, rate = 1, last_n = -1, last_t = 0;
  bool valid = false;
  void Reset(double now, double native) { k = count = 0; anchor_t = now; anchor_n = native; rate = 1; valid = false; }
  void Update(double now, double native) {
    if (last_n < 0 || native < last_n - 1e-6 || native > last_n + 1.0 || now - last_t > 1000) Reset(now, native);
    last_n = native; last_t = now;
    t[k % 32] = now; n[k % 32] = native; ++k; if (count < 32) ++count;
    const double dt = now - anchor_t;
    if (dt >= 500) {
      const double r = (native - anchor_n) * 1000 / dt;
      if (r >= 0.5 && r <= 1.2) { rate = valid ? rate + (r - rate) * 0.5 : r; valid = true; }
      else valid = false;
      anchor_t = now; anchor_n = native;
    }
  }
  // Interpola entre las dos vueltas del juicio que rodean a la hora pedida (el reloj nativo de cada vuelta es el
  // valor real de esa vuelta). NaN si no hay mapa confiable (arranque, pausa, salto) o la hora quedó fuera.
  double SongAt(double at_ms) const {  // no necesita el ritmo (rate sólo se informa)
    if (count < 2) return NAN;
    for (uint32_t j = 1; j < count; ++j) {
      const uint32_t b = (k - j) % 32, a = (k - j - 1) % 32;  // a = vuelta anterior a b
      if (t[a] <= at_ms && at_ms <= t[b]) {
        if (t[b] - t[a] > 250 || n[b] < n[a]) return NAN;
        return t[b] > t[a] ? n[a] + (at_ms - t[a]) / (t[b] - t[a]) * (n[b] - n[a]) : n[b];
      }
    }
    return NAN;
  }
};
inline thread_local SyncClockMap sync_clock_map;

inline c1s::Queue* sync_c1_queue() {
  auto* q = reinterpret_cast<c1s::Queue*>(static_cast<char*>(g1e_live_ptr()) + 64);
  return q->magic.load(std::memory_order_relaxed) == c1s::kMagic && q->version.load(std::memory_order_relaxed) == 2 ? q : nullptr;
}

// C1S_SIN_DIAG (copia publicable): sin postMessage por rasgueo ni anuncio; quedan los contadores de la cola.
inline void sync_press_reject(const c1s::Event& e, double native_sec, double now, int reason) {
#ifdef C1S_SIN_DIAG
  (void)e; (void)native_sec; (void)now; (void)reason;
#else
  EM_ASM({(function(){globalThis.__syncJudgeCh.postMessage({type:'syncPressReject',id:$0,eventAt:$1,eventBaseMs:$2*1000,nativeMs:$3*1000,checkedAt:$4,reason:$5});})();}, e.id, e.event_at, e.base_sec, native_sec, now, reason);
#endif
}

// Hora conservada (s de canción) para un evento: DOM convertida (bit2) o reloj al escribir (Codex).
inline double sync_press_event_sec(const c1s::Event& e, uint32_t mode, double* dom_out = nullptr) {
  const double dom = sync_clock_map.SongAt(e.event_at);
  if (dom_out) *dom_out = dom;
  if ((mode & c1s::kModeDom) && std::isfinite(dom)) return dom;
  return e.base_sec;
}

inline double sync_press_begin(uint32_t player, uint32_t controller, double native_sec) {
  sync_press_selected = false; sync_press_pending = nullptr;
  sync_press_native_sec = native_sec; sync_press_used_sec = native_sec;
  if (player != 0 || controller >= 4) return native_sec;
  const double now = EM_ASM_DOUBLE({ return performance.timeOrigin + performance.now(); });
  sync_clock_map.Update(now, native_sec);
  c1s::Queue* qp = sync_c1_queue();
  if (!qp) return native_sec;
  auto& q = *qp;
  q.judge_alive_at.store(now, std::memory_order_relaxed);
#ifndef C1S_SIN_DIAG
  static thread_local double announced = 0;
  if (now - announced > 1000) { announced = now; EM_ASM({(function(){
    if(!globalThis.__syncJudgeCh)globalThis.__syncJudgeCh=new BroadcastChannel('hw60');
    globalThis.__syncJudgeCh.postMessage({type:'syncPressMemory',ptr:$0,c1:2});
  })();}, (uint32_t)(uintptr_t)qp); }
#endif
  const uint32_t mode = q.mode.load(std::memory_order_relaxed);
  const uint32_t n = q.delivered.load(std::memory_order_acquire);
  if (sync_press_seen == 0 || c1s::Before(n, sync_press_seen) || n - sync_press_seen > c1s::kRing) sync_press_seen = n > 0 ? n - 1 : 0;
  // Sonda pura verificada contra sub_820E7C38 y sub_82100F10 (Codex): flags +52 0x1000/0x4000 = rasgueo visto.
  const uint32_t table = sync_u32(0x82A4672C), object = table ? sync_u32(table + (controller + 8) * 4) : 0;
  const uint32_t state = object ? sync_u32(object + 24) : 0, edges = state ? sync_u32(state + 52) : 0;
  const uint32_t fresh = n - sync_press_seen;
  if (fresh == 0) {
    // Nada entregado aún: el próximo de la cola puede posponer la expiración (mismas reglas que Codex).
    const uint32_t r = q.read.load(std::memory_order_relaxed), w = q.write.load(std::memory_order_acquire);
    if (r != w && (mode & c1s::kModeJudge)) {
      const auto& e = q.events[r % c1s::kCap];
      const double sec = sync_press_event_sec(e, mode);
      if (std::isfinite(sec) && now - e.event_at <= 250 && now >= e.event_at && sec >= native_sec - .250 && sec <= native_sec + .002) {
        sync_press_pending = &e; sync_press_pending_sec = sec;
      }
    }
    return native_sec;
  }
  const c1s::Delivery& d = q.ring[(n - 1) % c1s::kRing];
  if (!(edges & 0x5000)) {
    // Entregado pero el original todavía no lo mostró: esperar (posponiendo la expiración) o darlo por perdido.
    if (now - d.consumed_at > 250) {
      q.lost.fetch_add(1, std::memory_order_relaxed); sync_press_reject(d.e, native_sec, now, 5);
      sync_press_seen = n; q.ack.store(d.e.id, std::memory_order_release);
    } else if (mode & c1s::kModeJudge) {
      const double sec = sync_press_event_sec(d.e, mode);
      if (std::isfinite(sec) && sec >= native_sec - .250 && sec <= native_sec + .002) { sync_press_pending = &d.e; sync_press_pending_sec = sec; }
    }
    return native_sec;
  }
  // El original vio un rasgueo. Le corresponde la ÚLTIMA entrega; si hubo más de una desde la vuelta anterior,
  // o C1 las fusionó en una consulta, no se sabe cuál vio: comportamiento original.
  sync_press_seen = n;
  q.ack.store(d.e.id, std::memory_order_release);
  q.judged.fetch_add(1, std::memory_order_relaxed);
  if (fresh > 1 || d.fused) {
    q.multi.fetch_add(1, std::memory_order_relaxed); sync_press_reject(d.e, native_sec, now, 2); return native_sec;
  }
  const uint32_t device = sync_u32(object + 28);
  if (!device || sync_u32(device + 8) != 8) { sync_press_reject(d.e, native_sec, now, 4); return native_sec; }
  const auto byte = [](uint32_t a) { return *(volatile uint8_t*)::rexwasm::Host(a); };
  const uint32_t native_frets = (byte(state + 10) ? 0x1000 : 0) | (byte(state + 9) ? 0x2000 : 0) | (byte(state + 8) ? 0x8000 : 0) |
                                (byte(state + 11) ? 0x4000 : 0) | (byte(state + 12) ? 0x100 : 0);
  if (native_frets != (d.e.buttons & 0xF100)) { sync_press_reject(d.e, native_sec, now, 3); return native_sec; }
  double dom = NAN;
  const double sec = sync_press_event_sec(d.e, mode, &dom);
  if (!std::isfinite(sec) || now - d.e.event_at > 250 || sec < native_sec - .250 || sec > native_sec + .002) {
    sync_press_reject(d.e, native_sec, now, 1); return native_sec;
  }
  sync_press_active = d.e; sync_press_selected = true;
  if (mode & c1s::kModeJudge) sync_press_used_sec = float(sec);
#ifndef C1S_SIN_DIAG
  EM_ASM({(function(){const p=$0,d=new DataView(HEAPU8.buffer);
    globalThis.__syncJudgeCh.postMessage({type:'syncPressEval',c1:2,id:d.getUint32(p+48,true),
      eventAt:d.getFloat64(p,true),writtenAt:d.getFloat64(p+8,true),baseAtWrite:d.getFloat64(p+16,true)*1000,
      buttons:d.getUint32(p+32,true),nativeMs:$1*1000,usedMs:$2*1000,edges:$3,mode:$4,
      deferredExpirations:d.getUint32(p+56,true),domMs:$5*1000,rate:$6,poll:$7,consumedAt:$8,consumedSongMs:$9*1000,
      gapPolls:$10,at:performance.timeOrigin+performance.now()});})();},
    (uint32_t)(uintptr_t)&sync_press_active, native_sec, sync_press_used_sec, edges, mode, dom, sync_clock_map.rate,
    d.poll, d.consumed_at, d.consumed_song, d.gap_polls);
#endif
  return sync_press_used_sec;
}

inline double sync_press_expiry(double threshold, double note_ms) {
  if (!sync_press_pending || sync_press_selected) return threshold;
  // Sólo la comparación de nota pasada espera un evento ya fechado. Si el evento mismo fue tarde, la nota vence igual.
  const double as_of_event = float(threshold - (sync_press_native_sec - sync_press_pending_sec) * 1000);
  return as_of_event < threshold ? as_of_event : threshold;
}

inline void sync_press_inputs(uint32_t frets, uint32_t strummed, uint32_t held) {
  if (!sync_press_selected) return;
#ifndef C1S_SIN_DIAG
  EM_ASM({(function(){globalThis.__syncJudgeCh.postMessage({type:'syncPressInput',id:$0,frets:$1,strummed:$2,held:$3,at:performance.timeOrigin+performance.now()});})();}, sync_press_active.id, frets, strummed, held);
#endif
}

inline void sync_press_result(int kind, uint32_t player, uint32_t index) {
  if (player != 0) return;
#ifndef C1S_SIN_DIAG
  EM_ASM({(function(){globalThis.__syncJudgeCh?.postMessage({type:'syncPressResult',kind:$0,index:$1,
    id:$2,selected:!!$3,nativeMs:$4*1000,usedMs:$5*1000,at:performance.timeOrigin+performance.now()});})();}, kind, index,
    sync_press_selected ? sync_press_active.id : 0, sync_press_selected, sync_press_native_sec, sync_press_used_sec);
#endif
}
