// Fase 2: pruebas del runtime de hilos de rexglue (src/core/threading_posix.cpp,
// timer_queue.cpp y el backend fiber_emscripten.cpp) compilado a WebAssembly con pthreads.
// No es GH3: ejercita las primitivas que usan el kernel y los hilos guest.
//
// REXWASM_NO_SAFEPOINT: control negativo. El hilo "guest" no llama a SafePoint(),
// como si no se hubiera instrumentado el codigo generado; la suspension remota debe fallar.

#include <rex/thread.h>
#include <rex/thread/fiber.h>

#include <atomic>
#include <chrono>
#include <cstdio>
#include <string>
#include <vector>

#include <emscripten.h>

namespace rex::thread {
void SafePoint();  // threading_posix.cpp (parche WASM)
}

using namespace rex::thread;
using namespace std::chrono;
using namespace std::chrono_literals;

static int g_pass = 0, g_fail = 0;
static std::string g_json = "[";

static void check(const char* name, bool ok, const std::string& detail = "") {
  (ok ? g_pass : g_fail)++;
  std::printf("%s %s %s\n", ok ? "PASS" : "FAIL", name, detail.c_str());
  if (g_json.size() > 1) g_json += ",";
  g_json += "{\"name\":\"" + std::string(name) + "\",\"ok\":" + (ok ? "true" : "false") +
            ",\"detail\":\"" + detail + "\"}";
}

static double ms_since(steady_clock::time_point t0) {
  return duration<double, std::milli>(steady_clock::now() - t0).count();
}

static volatile int g_sink;
static inline void guest_safepoint() {
#ifndef REXWASM_NO_SAFEPOINT
  SafePoint();
#else
  g_sink = g_sink + 1;  // evita un bucle vacio (comportamiento indefinido en C++)
#endif
}

static Thread::CreationParameters params(bool suspended = false) {
  Thread::CreationParameters p;
  p.stack_size = 256 * 1024;
  p.create_suspended = suspended;
  return p;
}

static void test_threads_waitall() {
  std::atomic<int> sum{0};
  std::vector<std::unique_ptr<Thread>> ts;
  for (int i = 1; i <= 4; i++) {
    ts.push_back(Thread::Create(params(), [&sum, i] {
      set_current_thread_id(0x100 + i);
      for (int k = 0; k < 100000; k++) sum.fetch_add(i, std::memory_order_relaxed);
    }));
  }
  std::vector<WaitHandle*> hs;
  for (auto& t : ts) hs.push_back(t.get());
  auto r = WaitAll(hs, false, 5000ms);
  check("hilos_4_waitall", r == WaitResult::kSuccess && sum == 1000000,
        "sum=" + std::to_string(sum.load()));
}

static void test_event_pingpong() {
  auto ping = Event::CreateAutoResetEvent(false);
  auto pong = Event::CreateAutoResetEvent(false);
  const int N = 2000;
  std::atomic<int> seen{0};
  auto t = Thread::Create(params(), [&] {
    for (int i = 0; i < N; i++) {
      if (Wait(ping.get(), false, 2000ms) != WaitResult::kSuccess) return;
      seen++;
      pong->Set();
    }
  });
  auto t0 = steady_clock::now();
  int ok = 0;
  for (int i = 0; i < N; i++) {
    ping->Set();
    if (Wait(pong.get(), false, 2000ms) == WaitResult::kSuccess) ok++;
  }
  double el = ms_since(t0);
  Wait(t.get(), false, 2000ms);
  char d[96];
  std::snprintf(d, sizeof d, "%d/%d idas y vueltas, %.1f us cada una", ok, N, el * 1000.0 / N);
  check("evento_autoreset_pingpong", ok == N && seen == N, d);
}

static void test_waitany_manual() {
  auto a = Event::CreateManualResetEvent(false);
  auto b = Event::CreateManualResetEvent(false);
  auto t = Thread::Create(params(), [&] {
    Sleep(20ms);
    b->Set();
  });
  WaitHandle* hs[] = {a.get(), b.get()};
  auto [r, idx] = WaitAny(hs, 2, false, 2000ms);
  // Manual-reset: sigue senalado despues de la espera.
  auto r2 = Wait(b.get(), false, 0ms);
  check("evento_manual_waitany", r == WaitResult::kSuccess && idx == 1 && r2 == WaitResult::kSuccess,
        "idx=" + std::to_string(idx));
  Wait(t.get(), false, 2000ms);
}

static void test_semaphore() {
  auto sem = Semaphore::Create(0, 64);
  std::atomic<int> consumed{0};
  std::vector<std::unique_ptr<Thread>> cs;
  for (int c = 0; c < 3; c++) {
    cs.push_back(Thread::Create(params(), [&] {
      while (Wait(sem.get(), false, 300ms) == WaitResult::kSuccess) consumed++;
    }));
  }
  for (int i = 0; i < 30; i++) {
    int prev = 0;
    sem->Release(1, &prev);
  }
  for (auto& c : cs) Wait(c.get(), false, 3000ms);
  check("semaforo_productor_3_consumidores", consumed == 30, "consumidos=" + std::to_string(consumed.load()));
}

static void test_mutant() {
  auto m = Mutant::Create(false);
  int counter = 0;  // protegido por el mutante, sin atomics a proposito
  std::vector<std::unique_ptr<Thread>> ts;
  for (int i = 0; i < 4; i++) {
    ts.push_back(Thread::Create(params(), [&] {
      for (int k = 0; k < 2000; k++) {
        Wait(m.get(), false);
        counter++;
        m->Release();
      }
    }));
  }
  for (auto& t : ts) Wait(t.get(), false, 5000ms);
  check("mutante_exclusion", counter == 8000, "counter=" + std::to_string(counter));
}

static void test_timers() {
  auto once = Timer::CreateSynchronizationTimer();
  auto t0 = steady_clock::now();
  once->SetOnceAfter(rex::chrono::hundrednanoseconds(30 * 10000));  // 30 ms
  auto r = Wait(once.get(), false, 2000ms);
  double el = ms_since(t0);
  char d[64];
  std::snprintf(d, sizeof d, "%.1f ms (pedido 30 ms)", el);
  check("timer_unico_30ms", r == WaitResult::kSuccess && el >= 29.0 && el < 200.0, d);

  auto rep = Timer::CreateSynchronizationTimer();
  int ticks = 0;
  t0 = steady_clock::now();
  rep->SetRepeatingAfter(rex::chrono::hundrednanoseconds(10 * 10000), 10ms);
  while (ms_since(t0) < 200.0) {
    if (Wait(rep.get(), false, 50ms) == WaitResult::kSuccess) ticks++;
  }
  rep->Cancel();
  check("timer_repetido_10ms", ticks >= 12 && ticks <= 21, "ticks en 200 ms=" + std::to_string(ticks));
}

static void test_create_suspended() {
  std::atomic<bool> ran{false};
  auto t = Thread::Create(params(true), [&] { ran = true; });
  Sleep(30ms);
  bool before = ran;
  uint32_t prev = 0;
  t->Resume(&prev);
  auto r = Wait(t.get(), false, 2000ms);
  check("hilo_creado_suspendido", !before && ran && prev == 1 && r == WaitResult::kSuccess,
        "prev=" + std::to_string(prev));
}

static void test_remote_suspend() {
  std::atomic<uint64_t> counter{0};
  std::atomic<bool> stop{false};
  auto t = Thread::Create(params(), [&] {
    while (!stop) {
      counter.fetch_add(1, std::memory_order_relaxed);
      guest_safepoint();  // en el port lo inserta el codegen (prologos / saltos hacia atras)
    }
  });
  Sleep(20ms);
  t->Suspend();
  Sleep(10ms);  // margen para llegar al punto seguro
  uint64_t a = counter;
  Sleep(50ms);
  uint64_t b = counter;
  t->Resume();
  Sleep(20ms);
  uint64_t c = counter;
  stop = true;
  Wait(t.get(), false, 2000ms);
  check("suspension_remota", a == b && c > b,
        "suspendido " + std::to_string(b - a) + " pasos, reanudado +" + std::to_string(c - b));
}

static void test_apc() {
  auto never = Event::CreateManualResetEvent(false);
  std::atomic<int> apc_ran_on{0};
  std::atomic<int> result{-1};
  std::atomic<bool> waiting{false};
  auto t = Thread::Create(params(), [&] {
    set_current_thread_id(0x777);
    waiting = true;
    result = static_cast<int>(Wait(never.get(), true, 3000ms));
  });
  while (!waiting) Sleep(1ms);
  Sleep(10ms);
  auto t0 = steady_clock::now();
  t->QueueUserCallback([&] { apc_ran_on = static_cast<int>(current_thread_id()); });
  Wait(t.get(), false, 4000ms);
  char d[96];
  std::snprintf(d, sizeof d, "corrio en 0x%x, %.1f ms", apc_ran_on.load(), ms_since(t0));
  check("apc_espera_alertable", result == static_cast<int>(WaitResult::kUserCallback) && apc_ran_on == 0x777, d);
}

static void test_terminate() {
  std::atomic<bool> alive{false};
  auto t = Thread::Create(params(), [&] {
    alive = true;
    for (;;) guest_safepoint();
  });
  while (!alive) Sleep(1ms);
  t->Terminate(7);
  auto r = Wait(t.get(), false, 2000ms);
  check("terminar_hilo_remoto", r == WaitResult::kSuccess, "");
}

static void test_tls() {
  auto h = AllocateTlsHandle();
  SetTlsValue(h, 111);
  std::atomic<uintptr_t> other{0};
  auto t = Thread::Create(params(), [&] {
    SetTlsValue(h, 222);
    other = GetTlsValue(h);
  });
  Wait(t.get(), false, 2000ms);
  check("tls_por_hilo", GetTlsValue(h) == 111 && other == 222, "");
  FreeTlsHandle(h);
}

// --- Fibers: dos fibers guest que se alternan, en un hilo guest (no el principal). ---
struct FiberCtx {
  Fiber* main;
  Fiber* a;
  Fiber* b;
  std::string trace;
};
static FiberCtx* g_fc;  // por hilo de prueba; solo un hilo usa fibers a la vez

static void fiber_a(void*) {
  for (int i = 0; i < 3; i++) {
    g_fc->trace += 'a';
    Fiber::SwitchTo(g_fc->b);
  }
  g_fc->trace += 'A';
  Fiber::SwitchTo(g_fc->main);
  for (;;) Fiber::SwitchTo(g_fc->main);  // no debe volver de la entrada
}
static void fiber_b(void*) {
  // Marco profundo con variable local viva a traves de los cambios.
  int local = 1000;
  for (int i = 0; i < 3; i++) {
    g_fc->trace += 'b';
    local += i;
    Fiber::SwitchTo(g_fc->a);
  }
  g_fc->trace += (local == 1003) ? 'B' : 'X';
  Fiber::SwitchTo(g_fc->main);
  for (;;) Fiber::SwitchTo(g_fc->main);
}

static void test_fibers() {
  std::string trace;
  bool current_ok = false;
  auto t = Thread::Create(params(), [&] {
    FiberCtx fc;
    g_fc = &fc;
    fc.main = Fiber::ConvertCurrentThread();
    fc.a = Fiber::Create(64 * 1024, fiber_a, nullptr);
    fc.b = Fiber::Create(64 * 1024, fiber_b, nullptr);
    Fiber::SwitchTo(fc.a);  // a b a b a b A
    fc.trace += '|';
    Fiber::SwitchTo(fc.b);  // b continua: B
    current_ok = Fiber::Current() == fc.main;
    fc.a->Destroy();
    fc.b->Destroy();
    fc.main->Destroy();
    trace = fc.trace;
  });
  Wait(t.get(), false, 3000ms);
  check("fibers_alternados_en_hilo_guest", trace == "abababA|B" && current_ok, trace);
}

static void test_fiber_switch_cost() {
  double us = -1;
  auto t = Thread::Create(params(), [&] {
    FiberCtx fc;
    g_fc = &fc;
    fc.main = Fiber::ConvertCurrentThread();
    static int n;
    n = 0;
    fc.a = Fiber::Create(64 * 1024, [](void*) {
      for (;;) {
        n++;
        Fiber::SwitchTo(g_fc->main);
      }
    }, nullptr);
    auto t0 = steady_clock::now();
    for (int i = 0; i < 2000; i++) {
      Fiber::SwitchTo(fc.a);
#ifdef ONLY_COST
      if (i % 250 == 0) std::printf("i=%d n=%d\n", i, n);
#endif
    }
    us = ms_since(t0) * 1000.0 / 4000.0;
    if (n != 2000) us = -1;
    fc.a->Destroy();
    fc.main->Destroy();
  });
  Wait(t.get(), false, 5000ms);
  char d[64];
  std::snprintf(d, sizeof d, "%.2f us por cambio", us);
  check("fibers_costo_cambio", us > 0, d);
}

extern "C" EMSCRIPTEN_KEEPALIVE const char* rex_results_json() { return g_json.c_str(); }

int main() {
  std::printf("rexglue hilos/kernel en wasm%d, %u CPU logicas\n", int(sizeof(void*) * 8),
              logical_processor_count());
  auto t0 = steady_clock::now();
#ifdef ONLY_COST
  test_fiber_switch_cost();
#endif
  test_threads_waitall();
  test_event_pingpong();
  test_waitany_manual();
  test_semaphore();
  test_mutant();
  test_timers();
  test_create_suspended();
  test_remote_suspend();
  test_apc();
#ifndef REXWASM_NO_SAFEPOINT
  test_terminate();
#else
  // Sin SafePoint el join de un bucle infinito no puede terminar.
  std::printf("SKIP terminar_hilo_remoto: control negativo sin SafePoint\n");
#endif
  test_tls();
  test_fibers();
  test_fiber_switch_cost();
  g_json += "]";
  std::printf("RESULTADO %d/%d en %.0f ms\n", g_pass, g_pass + g_fail, ms_since(t0));
  MAIN_THREAD_EM_ASM({ if (typeof Module.onDone === 'function') Module.onDone($0, $1, $2); }, g_pass, g_fail, g_json.c_str());
  return g_fail;
}
