// Prueba nativa de c1_strum.h (sin juego): g++ -std=c++20 -I. c1_strum_test.cpp && ./a.out
#include "c1_strum.h"
#include <cstdio>
#include <memory>
using namespace c1s;
static int fails = 0;
#define CHECK(c) do { if (!(c)) { std::printf("FALLA línea %d: %s\n", __LINE__, #c); ++fails; } } while (0)

static void Push(Queue& q, double at, uint32_t buttons) {
  uint32_t w = q.write.load();
  Event& e = q.events[w % kCap];
  e = {}; e.event_at = at; e.written_at = at; e.base_sec = at / 1000; e.base_after = e.base_sec; e.buttons = buttons; e.id = w + 1;
  q.write.store(w + 1);
}
struct Sim {
  std::unique_ptr<Queue> q = std::make_unique<Queue>();
  PollState s;
  double now = 1000;
  uint32_t poll(uint32_t live, uint32_t* tr_out = nullptr) {
    uint32_t b = live, tr = 0; now += 16; q->judge_alive_at.store(now);
    Poll(*q, s, live, b, tr, now, now / 1000);
    if (tr_out) *tr_out = tr;
    return b;
  }
  void ack() { q->ack.store(q->ring[(q->delivered.load() - 1) % kRing].e.id); }
};

int main() {
  const uint32_t G = 0x1000, R = 0x2000;
  {  // 1) dos rasgueos que caen entre dos consultas: dos flancos separados, cada uno con sus trastes
    Sim t; t.q->mode.store(kModeSingle | kModeJudge);
    Push(*t.q, 1001, G | kDown); Push(*t.q, 1002, R | kDown);
    uint32_t b = t.poll(0);  CHECK((b & kDown) && (b & G) && !(b & R));
    CHECK(t.q->delivered.load() == 1 && t.q->ring[0].e.id == 1);
    b = t.poll(0); CHECK((b & kDown) && (b & G));          // sin acuse: sigue mostrando el primero
    t.ack(); b = t.poll(0); CHECK(!(b & kStrum));           // acuse: suelta una consulta
    b = t.poll(0); CHECK((b & kDown) && (b & R) && !(b & G)); // segundo flanco con SUS trastes
    CHECK(t.q->delivered.load() == 2 && t.q->ring[1].e.id == 2 && t.q->ring[1].gap_polls == 1);
    t.ack(); b = t.poll(0); CHECK(!(b & kStrum));
  }
  {  // 2) sin acuse (menú/pausa): suelta igual tras kAckTimeoutMs
    Sim t; t.q->mode.store(kModeSingle);
    Push(*t.q, 1001, kDown); Push(*t.q, 1002, kUp);
    int down = 0, up = 0, edges = 0; uint32_t prev = 0;
    for (int i = 0; i < 40; ++i) { uint32_t b = t.poll(0) & kStrum; if (b & ~prev) ++edges; if (b & kDown) ++down; if (b & kUp) ++up; prev = b; }
    CHECK(edges == 2 && down > 0 && up > 0 && t.q->ack_timeouts.load() == 2);
  }
  {  // 3) mantener el rasgueo: no crea flancos nuevos sin evento
    Sim t; t.q->mode.store(kModeSingle);
    Push(*t.q, 1001, G | kDown);
    uint32_t b = t.poll(G | kDown); CHECK(b & kDown); t.ack();
    for (int i = 0; i < 5; ++i) { b = t.poll(G | kDown); CHECK((b & kDown) && (b & G)); }
    b = t.poll(G); CHECK(!(b & kDown));
  }
  {  // 7) flanco del vivo SIN evento en la cola (robot, ?press=): pasa igual, como el C1 publicado
    Sim t; t.q->mode.store(kModeSingle); Push(*t.q, 1001, kDown); t.poll(kDown); t.ack(); t.poll(0);  // cola en uso
    uint32_t b = t.poll(G | kDown); CHECK((b & kDown) && (b & G) && t.q->native.load() == 1);
    b = t.poll(G); CHECK(!(b & kDown));
  }
  {  // 8) evento + su gemelo del vivo en la misma consulta = UN solo flanco
    Sim t; t.q->mode.store(kModeSingle);
    Push(*t.q, 1001, G | kDown);
    uint32_t b = t.poll(G | kDown); CHECK(b & kDown); t.ack();
    b = t.poll(G); CHECK(!(b & kDown));
    b = t.poll(G); CHECK(!(b & kDown) && t.q->native.load() == 0 && t.q->delivered.load() == 1);
  }
  {  // 9) gemelo que llega 90 ms después del evento (entrega demorada): tampoco duplica
    Sim t; t.q->mode.store(kModeSingle);
    Push(*t.q, 1001, G | kDown);
    uint32_t b = t.poll(G); CHECK(b & kDown); t.ack();
    for (int i = 0; i < 5; ++i) t.poll(G);
    b = t.poll(G | kDown); CHECK(!(b & kDown) && t.q->native.load() == 0);
  }
  {  // 4) modo marcar (sin entrega individual): no cambia lo que ve el juego; dos en una consulta = fusionados
    Sim t; t.q->mode.store(kModeJudge);
    Push(*t.q, 1001, G | kDown); Push(*t.q, 1002, G | kDown);
    uint32_t b = t.poll(G); CHECK(b == G);
    CHECK(t.q->delivered.load() == 2 && t.q->ring[1].fused == 2 && t.q->fused.load() == 1);
  }
  {  // 5) juicio sin correr (menú): aunque pida individual, C1 sólo marca
    Sim t; t.q->mode.store(kModeSingle);
    Push(*t.q, 1001, kDown);
    uint32_t b = 0, tr = 0; t.now += 16;  // judge_alive_at viejo
    Poll(*t.q, t.s, kDown, b = kDown, tr, t.now, 1); CHECK(b == kDown && t.q->delivered.load() == 1 && t.s.wait_id == 0);
  }
  {  // 6) gatillos del instante (mando común: verde = LT)
    Sim t; t.q->mode.store(kModeSingle);
    uint32_t w = t.q->write.load(); Push(*t.q, 1001, kDown); t.q->events[w % kCap].triggers = 255;
    uint32_t tr = 0; t.poll(0, &tr); CHECK(tr == 255);
  }
  std::printf(fails ? "c1_strum: %d FALLAS\n" : "c1_strum: 9/9 PASS\n", fails);
  return fails != 0;
}
