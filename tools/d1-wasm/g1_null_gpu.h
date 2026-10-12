#pragma once
#include <atomic>
#include <cstdint>
#include <chrono>
#include <memory>
#include <rex/graphics/graphics_system.h>
extern "C" uintptr_t r2_watch_host;
namespace g1 {
struct Counters {
 std::atomic<uint32_t> swaps{0}, draws{0}, copies{0}, packets{0}, shaders{0};
 std::atomic<uint32_t> vblanks{0}, interrupts{0}, rptr{0}, wptr{0};
 std::atomic<uint32_t> wait_addr{0}, wait_ref{0}, wait_value{0};
 std::atomic<uint64_t> cp_total_waits{0}, cp_total_wait_us{0}, cp_total_wait_max_us{0};
 std::atomic<uint32_t> cp_sleeps{0}, cp_yields{0}, cp_req_ms{0};
 std::atomic<uint64_t> cp_real_us{0}, cp_real_max_us{0}, cp_hist[6]{}; // <1ms,<2,<4,<8,<16,>=16
 std::atomic<int64_t> first_swap_us{-1};
 std::chrono::steady_clock::time_point start = std::chrono::steady_clock::now();
};
// R2: quién escribe la palabra que espera el CP y cuánto tarda el CP en verlo (reloj steady común).
struct R2Watch {
 std::atomic<uint64_t> seq{0};            // stores del juego que tocaron la palabra
 std::atomic<uint64_t> zero_seq{0};       // seq del último store que la dejó == ref de la espera
 std::atomic<int64_t> zero_ns{0};         // momento de ese store
 std::atomic<uint32_t> ref{0}, addr{0};   // ref y dirección física de la espera vigilada
 // Por espera real (no lista al empezar): a = inicio→escritura, b = escritura→CP la ve.
 std::atomic<uint64_t> waits{0}, attributed{0}, unattributed{0}, immediate{0}, multi{0};
 std::atomic<uint64_t> a_us{0}, b_us{0}, b_max_us{0}, a_hist[6]{}, b_hist[6]{}; // <0.1,<0.5,<1,<4,<16,>=16 ms
};
extern R2Watch r2;
// R2c: cada callback de interrupción gráfica incrementa irq_epoch y hace notify sobre él. El CP lo lee
// ANTES de revisar el flag y duerme solo si no cambió (sin notificaciones perdidas). 0 = Sleep original,
// 1 = evento (G1_CP_WAIT=event). Contadores de la política de evento.
extern std::atomic<uint32_t> irq_epoch;
int CpWaitPolicy();
void NotifyIrq();
struct EventWaitStats { std::atomic<uint64_t> waits{0}, woken{0}, not_equal{0}, timeouts{0}; };
extern EventWaitStats ev;
extern thread_local int irq_source;  // -1 fuera de un callback de interrupción; 0 VBlank, 1 CP
int64_t NowNs();
// VB: medición del VBlank (solo anota tiempos; no cambia la temporización). Desde graphics_system::MarkVblank
// (entrada/salida, incluye el callback de interrupción del juego) y desde IssueSwap.
void NoteVblank(int64_t t0_ns, int64_t t1_ns);
void NoteSwap(int64_t t_ns);
void R2WaitDone(int64_t start_ns, uint64_t seq0, bool waited);
struct WaitStat { uint32_t addr=0, ref=0, info=0, mask=0, lastValue=0; uint64_t n=0, us=0; };
extern WaitStat wait_stats[8];
extern Counters counters;
// R3a: intérprete PM4 reanudable. Retornos de Pump(), pila de lectores y comprobación por tramo
// (G1_R3A_CHECK=1: recorrido en seco vs ejecutado). G1_R3A_YIELD=N fuerza a Pump() a devolver el
// control cada N paquetes (solo prueba de pausa/reanudación; 0 = sin límite, comportamiento normal).
struct R3aStats {
 std::atomic<uint64_t> pumps{0}, ret_idle{0}, ret_waitmem{0}, ret_swapped{0}, ret_yield{0};
 std::atomic<uint64_t> frames_pushed{0}, frames_popped{0}, chunks{0}, failed_packets{0};
 std::atomic<uint64_t> waits_started{0}, waits_finished{0};
 std::atomic<uint32_t> max_depth{1};
 std::atomic<uint64_t> checked_chunks{0}, unchecked_chunks{0}, mismatch_chunks{0};
 std::atomic<uint64_t> expect_packets{0}, exec_packets{0}, expect_draws{0}, exec_draws{0}, expect_swaps{0}, exec_swaps{0};
};
extern R3aStats r3a;
bool R3aCheck();
uint32_t R3aYieldEvery();
// R3b: hilo del CP asíncrono (G1_CP_ASYNC=1 / ?cpasync=1). cp_wake se incrementa y notifica al
// publicar el puntero de escritura, al encolar CallInThread y al apagar.
extern std::atomic<uint32_t> cp_wake;
void NotifyCpWake();
bool CpAsync();
uint32_t R3bBudgetUs();       // G1_R3B_BUDGET_US, por defecto 4000
uint32_t R3bBudgetPackets();  // G1_R3B_BUDGET_PKTS, por defecto 0 (solo tiempo)
struct R3bStats {
 std::atomic<uint64_t> turns{0}, turn_hist[6]{}, turn_max_us{0};  // <0.25,<1,<4,<8,<16,>=16 ms
 std::atomic<uint64_t> arms[6]{};  // none, message, wake, irq, timer, backend
 std::atomic<uint64_t> msg_fired{0}, timer_fired{0}, wait_woken{0}, wait_timeouts{0}, wait_other{0}, wait_not_equal{0};
 std::atomic<uint64_t> stale{0}, reentry{0}, double_arm{0};
 std::atomic<uint64_t> budget_time{0}, budget_packets{0};
 std::atomic<uint64_t> gate_pending{0}, gate_error{0}, backend_ready{0}, backend_fallback{0};
 std::atomic<uint64_t> fake_pending{0}, fake_gate_calls{0};
};
extern R3bStats r3b;
// R3c: latido WebGPU de PRUEBA del backend (no es un cuadro de GH3). Contadores escritos desde JS
// con Atomics sobre esta tabla (int32). Índices en r3c_heartbeat.cpp.
extern std::atomic<int32_t> r3c_stats[16];
std::unique_ptr<rex::system::IGraphicsSystem> Create();
void Report();
}
