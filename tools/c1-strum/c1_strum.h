// C1 v2 (Claude, 2026-10-16): cada rasgueo viaja con su ID desde la página hasta el mando original.
// Vive pegado al estado en vivo de C1: g1e_live_ptr() + 64 (los 11 campos de C1 no cambian).
// Cabecera (32 B) + eventos = ABI v1 de Codex (tools/sincronia/press-queue.mjs, SyncPressEvent):
// la página escribe con el mismo createPressWriter. Después vienen el acuse y el registro de entregas.
//
// Recorrido: página escribe evento (hora DOM, trastes, ID) -> C1 lo entrega al juego en una consulta de
// GetState (anota consulta, hora y reloj de canción de esa entrega) -> el juicio (sub_8211F8B8) ve el flanco
// de rasgueo del mando original, toma ESA entrega y escribe el acuse (ack = ID).
#pragma once
#include <atomic>
#include <cmath>
#include <cstddef>
#include <cstdint>

namespace c1s {
constexpr uint32_t kMagic = 0x53594e31, kVersion = 2, kCap = 64, kRing = 16;
constexpr uint32_t kUp = 0x0001, kDown = 0x0002, kStrum = kUp | kDown;
// mode (lo escribe la página): bit0 = el juicio usa la hora conservada (candidato de Codex, syncpress=1);
// bit1 = C1 entrega cada rasgueo por separado (consulta suelta entre dos, trastes del instante del rasgueo,
// sostiene el rasgueo hasta el acuse del juicio); bit2 = hora conservada = hora DOM pasada al reloj de canción.
constexpr uint32_t kModeJudge = 1, kModeSingle = 2, kModeDom = 4;
constexpr double kAckTimeoutMs = 120;   // sin acuse (menú, pausa): se suelta igual
constexpr double kJudgeAliveMs = 500;   // el juicio corre (canción): si no, C1 no toca el rasgueo
constexpr double kTwinMs = 250;         // un flanco del vivo es el «gemelo» de un evento de la cola publicado hace <= 250 ms

struct alignas(8) Event {
  double event_at, written_at, base_sec, base_after;  // hora del evento y de escritura (ms epoch), reloj al escribir (s)
  uint32_t buttons, triggers, source, flags, id, seq, reserved[2];
};
struct alignas(8) Delivery {  // 96 B: copia del evento + cómo lo entregó C1
  Event e;
  uint32_t poll, gap_polls, fused, mode;
  double consumed_at, consumed_song;  // hora (ms epoch) y reloj de canción (s) de la consulta que lo entregó
};
struct alignas(8) Queue {
  std::atomic<uint32_t> magic{kMagic}, write{0}, read{0}, dropped{0}, mode{0}, rejected{0}, gaps{0}, delivered{0};
  Event events[kCap]{};
  std::atomic<uint32_t> version{kVersion}, ack{0}, polls{0}, lost{0}, ack_timeouts{0}, fused{0}, judged{0}, multi{0};
  std::atomic<double> judge_alive_at{0};  // última vuelta del juicio (ms epoch)
  std::atomic<uint32_t> native{0}, spare{0};  // rasgueos sin evento en la cola (robot, ?press=, otra fuente): pasan igual
  Delivery ring[kRing]{};
};
static_assert(sizeof(Event) == 64 && offsetof(Queue, events) == 32 && sizeof(Delivery) == 96);
static_assert(offsetof(Queue, version) == 32 + 64 * 64 && offsetof(Queue, ring) == 32 + 64 * 64 + 48);

inline bool Before(uint32_t a, uint32_t b) { return int32_t(a - b) < 0; }

inline void Record(Queue& q, const Event& e, uint32_t poll, double now, double song, uint32_t gap, uint32_t fused,
                   uint32_t mode) {
  const uint32_t n = q.delivered.load(std::memory_order_relaxed) + 1;
  Delivery& d = q.ring[(n - 1) % kRing];
  d.e = e;
  d.poll = poll; d.gap_polls = gap; d.fused = fused; d.mode = mode;
  d.consumed_at = now; d.consumed_song = song;
  q.delivered.store(n, std::memory_order_release);
}

// Estado propio de C1 (un solo lector de GetState a la vez: lo protege g_mutex).
struct PollState {
  uint32_t shown = 0;     // bits de rasgueo presentados en la consulta anterior
  uint32_t wait_id = 0;   // rasgueo entregado que espera acuse
  uint32_t snap_b = 0, snap_tr = 0, snap_strum = 0;
  uint32_t gap = 0;
  double wait_since = 0;
  bool overrode = false;  // esta consulta mostró los trastes guardados (C1 conserva los toques cortos del vivo)
  uint32_t prev_in = 0;   // rasgueo que C1 iba a presentar en la consulta anterior (para ver flancos nuevos)
  uint32_t seen_w = 0, credit = 0;  // eventos publicados aún sin su flanco gemelo en el vivo
  double credit_at = 0;
  uint32_t native = 0, native_bits = 0;  // flancos sin evento pendientes de mostrar
};

// Una consulta GetState. b/tr = lo que C1 iba a presentar (vivo + toques cortos); live_held = botones
// mantenidos de verdad. Devuelve true si esta consulta entregó (o marcó) un rasgueo de la cola.
inline bool Poll(Queue& q, PollState& s, uint32_t live_held, uint32_t& b, uint32_t& tr, double now, double song) {
  s.overrode = false;
  const uint32_t rising = b & kStrum & ~s.prev_in;
  s.prev_in = b & kStrum;
  if (q.magic.load(std::memory_order_relaxed) != kMagic) return false;
  const uint32_t mode = q.mode.load(std::memory_order_relaxed);
  const uint32_t poll = q.polls.fetch_add(1, std::memory_order_relaxed) + 1;
  uint32_t r = q.read.load(std::memory_order_relaxed);
  const uint32_t w = q.write.load(std::memory_order_acquire);
  const bool judge_alive = now - q.judge_alive_at.load(std::memory_order_relaxed) < kJudgeAliveMs;
  if (!(mode & kModeSingle) || !judge_alive) {
    // Sólo marcar: C1 no cambia lo que ve el juego. Cada evento queda asociado a la consulta en que C1 lo vio;
    // varios en la misma consulta = el juego recibe UN flanco (fusionados) y el juicio no les asigna hora.
    s.wait_id = 0; s.shown = b & kStrum; s.seen_w = w; s.credit = 0; s.native = 0;
    if (r == w) return false;
    const uint32_t n = w - r;
    if (n > kCap) { q.rejected.fetch_add(n, std::memory_order_relaxed); q.read.store(w, std::memory_order_release); return false; }
    for (; r != w; ++r) Record(q, q.events[r % kCap], poll, now, song, 0, n > 1 ? n : 0, mode);
    if (n > 1) q.fused.fetch_add(n - 1, std::memory_order_relaxed);
    q.read.store(w, std::memory_order_release);
    return true;
  }
  // Entrega individual. Un flanco del vivo con su evento en la cola NO crea otro (lo crea el evento); uno sin evento
  // (la página no lo escribió: robot, ?press=, otra fuente) pasa igual, como en el C1 publicado.
  if (w != s.seen_w) { s.credit += w - s.seen_w; s.seen_w = w; s.credit_at = now; }
  if (s.credit && now - s.credit_at > kTwinMs) s.credit = 0;
  if (rising) {
    if (s.credit) --s.credit;
    else { ++s.native; s.native_bits = rising; q.native.fetch_add(1, std::memory_order_relaxed); }
  }
  uint32_t strum = live_held & kStrum & s.shown;  // mantener apretado sí (sin flanco nuevo)
  if (s.wait_id) {
    if (!Before(q.ack.load(std::memory_order_acquire), s.wait_id)) s.wait_id = 0;
    else if (now - s.wait_since > kAckTimeoutMs) { s.wait_id = 0; q.ack_timeouts.fetch_add(1, std::memory_order_relaxed); }
    else {  // sigue mostrando el rasgueo y los trastes de su instante hasta que el juicio lo vea
      b = (s.snap_b & ~kStrum) | s.snap_strum; tr = s.snap_tr; s.shown = s.snap_strum; s.overrode = true;
      return false;
    }
  }
  bool delivered = false;
  if (r != w) {
    if (s.shown) { strum = 0; ++s.gap; q.gaps.fetch_add(1, std::memory_order_relaxed); }  // soltar: el próximo es flanco nuevo
    else {
      const Event& e = q.events[r % kCap];
      if (!std::isfinite(e.event_at) || !std::isfinite(e.written_at)) {
        q.rejected.fetch_add(1, std::memory_order_relaxed);
      } else {
        s.snap_strum = (e.buttons & kStrum) ? (e.buttons & kStrum) : kDown;
        s.snap_b = e.buttons; s.snap_tr = e.triggers;
        b = (e.buttons & ~kStrum); tr = e.triggers; strum = s.snap_strum; s.overrode = true;
        Record(q, e, poll, now, song, s.gap, 0, mode);
        s.gap = 0; s.wait_id = e.id; s.wait_since = now;
        delivered = true;
      }
      q.read.store(r + 1, std::memory_order_release);
    }
  } else if (s.native) {
    if (s.shown) { strum = 0; ++s.gap; }
    else { strum = s.native_bits ? s.native_bits : kDown; --s.native; s.gap = 0; }
  }
  b = (b & ~kStrum) | strum;
  s.shown = strum;
  return delivered;
}
}  // namespace c1s
