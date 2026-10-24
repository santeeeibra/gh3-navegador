// G1: PM4 real, sin rasterizar, resolver imagenes ni ejecutar memexport.
#include "g1_null_gpu.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#ifdef __EMSCRIPTEN__
#include <emscripten/atomic.h>
#endif
#include <mutex>
#include <string>
#include <pthread.h>
#include <rex/system/xthread.h>
#include <algorithm>
#include <map>
#include <vector>
#include <rex/graphics/command_processor.h>
#include <rex/graphics/pipeline/shader/shader.h>
#include <rex/graphics/registers.h>
#include "r3c_heartbeat.h"
#define XXH_INLINE_ALL
#include <xxhash.h>
#include "r5_snapshot.h"
#include "r5_frame.h"
#ifdef __EMSCRIPTEN__
#include <emscripten/eventloop.h>
#endif
namespace g1 {
Counters counters;
using namespace rex::graphics;
class NullCP final : public CommandProcessor {
 public:
 using CommandProcessor::CommandProcessor;
 void IssueSwap(uint32_t frontbuffer, uint32_t width, uint32_t height) override {
   auto us=std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now()-counters.start).count();
   int64_t unset=-1; counters.first_swap_us.compare_exchange_strong(unset,us);
   const uint32_t n = ++counters.swaps;
   NoteSwap(NowNs());
   r5snap::OnSwap();  // R5snap: no hace nada si está apagado
   if (r5frame_on_) r5frame::OnSwap(FrameCtx(), frontbuffer, width, height);  // R5F: apagado por defecto
   // R3c: latido de prueba (no bloquea; si está apagado o falló, no hace nada).
   if (r3c_on_) r3c::OnSwap(n);
 }
 void TracePlaybackWroteMemory(uint32_t,uint32_t) override {}
 void RestoreEdramSnapshot(const void*) override {}
 protected:
 bool SetupContext() override { return true; }
 // R3b: compuerta del backend. Pending mientras el latido R3c inicializa WebGPU, o cuando la prueba
 // G1_R3B_FAKE_PENDING="N:ms" simula un backend ocupado cada N swaps durante ms milisegundos.
 BackendStatus BackendGate(uint32_t opcode) override {
   // R5snap (apagado por defecto): reserva un slot para el draw seleccionado o informa su error.
   if (r5snap_on_) {
     const BackendStatus s = r5snap::Gate(opcode, active_vertex_shader_, active_pixel_shader_);
     if (s != BackendStatus::kDone) return s;
   }
   if (opcode != 0x64) return BackendStatus::kDone;  // PM4_XE_SWAP
   if (r3c_on_ && r3c::State() == 1) return BackendStatus::kPending;
   if (fake_every_) {
     ++r3b.fake_gate_calls;
     if (fake_busy_) return BackendStatus::kPending;
     if (!fake_cleared_ && fake_swaps_ % fake_every_ == fake_every_ - 1) {
       fake_busy_ = true;
       ++r3b.fake_pending;
#ifdef __EMSCRIPTEN__
       emscripten_set_timeout([](void* self) {
         auto* cp = static_cast<NullCP*>(self);
         cp->fake_busy_ = false;
         cp->fake_cleared_ = true;
         cp->CpAsyncBackendReady();
       }, fake_ms_, this);
#endif
       return BackendStatus::kPending;
     }
     fake_cleared_ = false;
     ++fake_swaps_;  // Done: este swap se ejecuta ahora mismo (sin ceder entre compuerta y paquete)
   }
   return BackendStatus::kDone;
 }
 void CpAsyncBackendInit() override {
   if (r5snap::Enabled()) { r5snap::Init(this, register_file_); r5snap_on_ = true; }
   if (const char* e = std::getenv("G1_R3B_FAKE_PENDING")) {
     unsigned n = 0, ms = 0;
     if (std::sscanf(e, "%u:%u", &n, &ms) == 2 && n) { fake_every_ = n; fake_ms_ = ms; }
   }
   if (r3c::Enabled()) {
     r3c_on_ = true;
     g_heartbeat_cp = this;
     r3c::Init([] { if (g_heartbeat_cp) g_heartbeat_cp->CpAsyncBackendReady(); });
   }
 }
 static inline NullCP* g_heartbeat_cp = nullptr;
 bool r3c_on_ = false, r5snap_on_ = false;
 uint32_t fake_every_ = 0, fake_ms_ = 0, fake_swaps_ = 0;
 bool fake_busy_ = false, fake_cleared_ = false;
 void ShutdownContext() override {}
 // R5F: contexto para la captura de cuadros (registros, memoria y shaders activos).
 r5frame::Ctx FrameCtx() { return {register_file_, memory_, &trace_writer_, active_vertex_shader_, active_pixel_shader_}; }
 const bool r5frame_on_ = r5frame::Enabled();
 bool IssueDraw(xenos::PrimitiveType prim,uint32_t count,IndexBufferInfo* ib,bool explicit_major) override {
   ++counters.draws;
   if(register_file_->Get<reg::RB_MODECONTROL>().edram_mode == xenos::EdramMode::kCopy) return IssueCopy();
   if (r5frame_on_) {
     r5frame::IndexDesc d;
     if (ib) { d.dma = true; d.format = uint32_t(ib->format); d.endian = uint32_t(ib->endianness); d.phys = ib->guest_base; d.bytes = uint32_t(ib->length); }
     r5frame::OnDraw(FrameCtx(), register_file_->values[XE_GPU_REG_VGT_DRAW_INITIATOR], uint32_t(prim), count, d, explicit_major);
   }
   if (r5snap_on_) {
     r5snap::IndexDesc d;
     if (ib) { d.dma = true; d.format = uint32_t(ib->format); d.endian = uint32_t(ib->endianness); d.phys = ib->guest_base; d.bytes = uint32_t(ib->length); }
     r5snap::OnDraw(register_file_->values[XE_GPU_REG_VGT_DRAW_INITIATOR], uint32_t(prim), count, d, explicit_major,
                    active_vertex_shader_, active_pixel_shader_);
   }
   return true;
 }
 bool IssueCopy() override { ++counters.copies; if (r5snap_on_) r5snap::OnCopy(); if (r5frame_on_) r5frame::OnCopy(FrameCtx()); return true; }
 void BackendDrawPacketEnd(DrawEnd end) override { if (r5snap_on_) r5snap::OnDrawEnd(int(end)); if (r5frame_on_) r5frame::OnDrawEnd(FrameCtx(), int(end)); }
 Shader* LoadShader(xenos::ShaderType type,uint32_t,const uint32_t* data,uint32_t count) override {
   // Exact bytes plus type as key; no translation or host compilation.
   std::vector<uint32_t> key(data,data+count); key.push_back(uint32_t(type));
   auto& shader=shaders_[key];
   // R5snap: hash XXH3 de los bytes BE del guest (como el nativo) solo si está pedido.
   // R5F también necesita el hash (mismo XXH3 de bytes BE, sin registrar en el log).
   if(!shader) { shader=std::make_unique<Shader>(type,r5snap::Enabled()?r5snap::HashUcode(int(type),data,count):r5frame::Enabled()?XXH3_64bits(data,size_t(count)*4):0,data,count); ++counters.shaders; }
   return shader.get();
 }
 std::map<std::vector<uint32_t>,std::unique_ptr<Shader>> shaders_;
};
class NullGS final : public GraphicsSystem {
 public:
 std::string name() const override { return "G1 null GPU"; }
 protected:
 void CreateProvider(bool) override {} // No host GPU or presenter.
 std::unique_ptr<CommandProcessor> CreateCommandProcessor() override {
   return std::make_unique<NullCP>(this,kernel_state_);
 }
};
std::unique_ptr<rex::system::IGraphicsSystem> Create() {
 counters.start=std::chrono::steady_clock::now();
 return std::make_unique<NullGS>();
}
WaitStat wait_stats[8];
R2Watch r2;
std::atomic<uint32_t> irq_epoch{0};
EventWaitStats ev;
R3aStats r3a;
R3bStats r3b;
std::atomic<int32_t> r3c_stats[16];
std::atomic<uint32_t> cp_wake{0};
void NotifyCpWake() {
 cp_wake.fetch_add(1);
#ifdef __EMSCRIPTEN__
 emscripten_atomic_notify(reinterpret_cast<void*>(&cp_wake), EMSCRIPTEN_NOTIFY_ALL_WAITERS);
#endif
}
static uint32_t EnvU32(const char* name, uint32_t def) { const char* e = std::getenv(name); return e && *e ? uint32_t(std::strtoul(e, nullptr, 10)) : def; }
bool CpAsync() { static bool v = [] { const char* e = std::getenv("G1_CP_ASYNC"); return e && std::strcmp(e, "1") == 0; }(); return v; }
uint32_t R3bBudgetUs() { static uint32_t v = EnvU32("G1_R3B_BUDGET_US", 4000); return v; }
uint32_t R3bBudgetPackets() { static uint32_t v = EnvU32("G1_R3B_BUDGET_PKTS", 0); return v; }
bool R3aCheck() {
 static bool v = [] { const char* e = std::getenv("G1_R3A_CHECK"); return e && std::strcmp(e, "1") == 0; }();
 return v;
}
uint32_t R3aYieldEvery() {
 static uint32_t v = [] { const char* e = std::getenv("G1_R3A_YIELD"); uint32_t n = e ? uint32_t(std::strtoul(e, nullptr, 10)) : 0;
   std::fprintf(stderr, "[r3a] {\"yieldEvery\":%u,\"check\":%s}\n", n, R3aCheck() ? "true" : "false"); return n; }();
 return v;
}
int CpWaitPolicy() {
 static int p = [] { const char* e = std::getenv("G1_CP_WAIT"); int v = (e && std::strcmp(e, "event") == 0) ? 1 : 0;
   std::fprintf(stderr, "[r2c] {\"cpWait\":\"%s\"}\n", v ? "event" : "sleep"); return v; }();
 return p;
}
void NotifyIrq() {
 irq_epoch.fetch_add(1);
#ifdef __EMSCRIPTEN__
 emscripten_atomic_notify(reinterpret_cast<void*>(&irq_epoch), EMSCRIPTEN_NOTIFY_ALL_WAITERS);
#endif
}
thread_local int irq_source = -1;
int64_t NowNs() {
 return std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now().time_since_epoch()).count();
}
// Escritores vistos (función generada + hilo), pocos: tabla fija bajo mutex (~60 llamadas/s).
struct Writer { int src=-2; const char* fn=nullptr; char thread[32]={}; unsigned long tid=0; uint32_t size=0; uint64_t n=0, to_ref=0, other=0; uint32_t last=0; };
static Writer writers[16];
static std::mutex writers_mu;
}  // namespace g1
extern "C" uintptr_t r2_watch_host = 0;
extern "C" void r2_watch_hit(const char* fn, uint64_t, uint32_t size, uintptr_t) {
 using namespace g1;
 uint32_t now = __builtin_bswap32(*(volatile uint32_t*)r2_watch_host);  // valor de la palabra tras el store
 int64_t t = NowNs();
 uint64_t s = ++r2.seq;
 bool to_ref = now == r2.ref.load();
 if (to_ref) { r2.zero_ns = t; r2.zero_seq = s; }
 unsigned long tid = (unsigned long)pthread_self();
 std::lock_guard<std::mutex> lk(writers_mu);
 for (auto& w : writers) {
   if (w.n && (w.fn != fn || w.tid != tid || w.size != size || w.src != irq_source)) continue;
   w.src = irq_source;
   if (!w.n) { auto* xt = rex::system::XThread::GetCurrentThread(); std::snprintf(w.thread, sizeof w.thread, "%s", xt ? xt->name().c_str() : "?"); }
   w.fn = fn; w.tid = tid; w.size = size; w.n++; (to_ref ? w.to_ref : w.other)++; w.last = now;
   break;
 }
}
namespace g1 {
// Muestras por espera atribuida (para mediana/p95); 16384 alcanzan para ~4 min a 60 esperas/s.
static constexpr uint32_t kR2Samples = 16384;
static uint32_t r2_a_samples[kR2Samples], r2_b_samples[kR2Samples];
static std::atomic<uint32_t> r2_nsamples{0};
static std::string R2Pct(const uint32_t* src, uint32_t n) {
 if (!n) return "null";
 std::vector<uint32_t> v(src, src + n); std::sort(v.begin(), v.end());
 char buf[96]; std::snprintf(buf, sizeof buf, "{\"p50\":%u,\"p95\":%u,\"p99\":%u}", v[n / 2], v[std::min<uint32_t>(n - 1, uint32_t(n * 0.95))], v[std::min<uint32_t>(n - 1, uint32_t(n * 0.99))]);
 return buf;
}
static int R2Bucket(uint64_t us) { return us < 100 ? 0 : us < 500 ? 1 : us < 1000 ? 2 : us < 4000 ? 3 : us < 16000 ? 4 : 5; }
void R2WaitDone(int64_t start_ns, uint64_t seq0, bool waited) {
 if (!waited) { r2.immediate++; return; }
 int64_t end = NowNs();
 r2.waits++;
 uint64_t zs = r2.zero_seq.load();
 if (zs <= seq0) { r2.unattributed++; return; }  // la vio cambiar sin store vigilado (kernel, stwcx, vector)
 if (r2.seq.load() - seq0 > 1) r2.multi++;
 int64_t zt = r2.zero_ns.load();
 uint64_t a = zt > start_ns ? uint64_t(zt - start_ns) / 1000 : 0, b = end > zt ? uint64_t(end - zt) / 1000 : 0;
 { uint32_t i = r2_nsamples.fetch_add(1); if (i < kR2Samples) { r2_a_samples[i] = uint32_t(a); r2_b_samples[i] = uint32_t(b); } }
 r2.attributed++; r2.a_us += a; r2.b_us += b; r2.a_hist[R2Bucket(a)]++; r2.b_hist[R2Bucket(b)]++;
 uint64_t m = r2.b_max_us.load(); while (b > m && !r2.b_max_us.compare_exchange_weak(m, b)) {}
}
// VB: tiempos de VBlank y swaps en tablas fijas (un escritor por tabla). Report() calcula intervalos,
// percentiles y cantidad por segundo con los tiempos relativos al primer VBlank del proceso.
constexpr uint32_t kVbSamples = 1u << 15;
static int64_t vb_t0[kVbSamples], vb_dur[kVbSamples], sw_t[kVbSamples];
static std::atomic<uint32_t> vb_n{0}, sw_n{0};
static std::atomic<int64_t> vb_origin{0};
void NoteVblank(int64_t t0_ns, int64_t t1_ns) {
 int64_t z = 0; vb_origin.compare_exchange_strong(z, t0_ns);
 uint32_t i = vb_n.load(std::memory_order_relaxed); if (i >= kVbSamples) return;
 vb_t0[i] = t0_ns; vb_dur[i] = t1_ns - t0_ns; vb_n.store(i + 1, std::memory_order_release);
}
void NoteSwap(int64_t t_ns) {
 uint32_t i = sw_n.fetch_add(1); if (i < kVbSamples) sw_t[i] = t_ns; else sw_n.store(kVbSamples);
}
static std::string VbPct(std::vector<int64_t> v) {
 if (v.empty()) return "null";
 std::sort(v.begin(), v.end()); size_t n = v.size();
 auto at = [&](double q) { return double(v[std::min(n - 1, size_t(double(n) * q))]) / 1000.0; };
 char b[160]; std::snprintf(b, sizeof b, "{\"n\":%zu,\"p50\":%.1f,\"p95\":%.1f,\"p99\":%.1f,\"max\":%.1f,\"min\":%.1f}", n, at(0.5), at(0.95), at(0.99), double(v[n-1]) / 1000.0, double(v[0]) / 1000.0);
 return b;
}
static std::string VbPerSecond(const int64_t* t, uint32_t n, int64_t origin) {
 std::vector<uint32_t> c;
 for (uint32_t i = 0; i < n; i++) { if (t[i] < origin) continue; size_t s = size_t((t[i] - origin) / 1000000000); if (s >= c.size()) c.resize(s + 1, 0); c[s]++; }
 std::string o = "["; for (size_t i = 0; i < c.size(); i++) { if (i) o += ","; o += std::to_string(c[i]); } return o + "]";
}
static void VbReport() {
 uint32_t n = std::min(vb_n.load(std::memory_order_acquire), kVbSamples), m = std::min(sw_n.load(), kVbSamples);
 int64_t org = vb_origin.load();
 std::vector<int64_t> iv, du, sv; uint32_t burst = 0, late = 0;  // burst <2 ms (recuperación en ráfaga), late >25 ms
 for (uint32_t i = 0; i < n; i++) { du.push_back(vb_dur[i]); if (i) { int64_t d = vb_t0[i] - vb_t0[i-1]; iv.push_back(d); if (d < 2000000) burst++; if (d > 25000000) late++; } }
 std::vector<int64_t> st(sw_t, sw_t + m); std::sort(st.begin(), st.end());
 for (uint32_t i = 1; i < m; i++) sv.push_back(st[i] - st[i-1]);
 std::fprintf(stderr, "[vb] {\"vblanks\":%u,\"swaps\":%u,\"spanS\":%.3f,\"intervalUs\":%s,\"callbackUs\":%s,\"burstLt2ms\":%u,\"lateGt25ms\":%u,\"swapIntervalUs\":%s,\"vblanksPerSecond\":%s,\"swapsPerSecond\":%s}\n",
   n, m, n ? double(vb_t0[n-1] - org) / 1e9 : 0.0, VbPct(iv).c_str(), VbPct(du).c_str(), burst, late, VbPct(sv).c_str(),
   VbPerSecond(vb_t0, n, org).c_str(), VbPerSecond(st.data(), m, org).c_str());
}
void Report() {
 VbReport();
 r5snap::Report();
 r5frame::Report();
 double t=std::chrono::duration<double>(std::chrono::steady_clock::now()-counters.start).count();
 std::fprintf(stderr,"[g1] {\"t\":%.6f,\"swaps\":%u,\"draws\":%u,\"copies\":%u,\"packets\":%u,\"shaders\":%u,\"vblanks\":%u,\"interrupts\":%u,\"rptr\":%u,\"wptr\":%u,\"firstSwapSeconds\":%.6f,\"waitAddr\":%u,\"waitRef\":%u,\"waitValue\":%u}\n",
 t,counters.swaps.load(),counters.draws.load(),counters.copies.load(),counters.packets.load(),counters.shaders.load(),
 counters.vblanks.load(),counters.interrupts.load(),counters.rptr.load(),counters.wptr.load(),
 counters.first_swap_us.load()/1e6,counters.wait_addr.load(),counters.wait_ref.load(),counters.wait_value.load());
 std::fprintf(stderr,"[g1cp] {\"sleeps\":%u,\"yields\":%u,\"reqMsSum\":%u,\"realUsSum\":%llu,\"realUsMax\":%llu,\"hist_lt1_2_4_8_16_ge16\":[%llu,%llu,%llu,%llu,%llu,%llu]}\n",
 counters.cp_sleeps.load(),counters.cp_yields.load(),counters.cp_req_ms.load(),(unsigned long long)counters.cp_real_us.load(),(unsigned long long)counters.cp_real_max_us.load(),
 (unsigned long long)counters.cp_hist[0].load(),(unsigned long long)counters.cp_hist[1].load(),(unsigned long long)counters.cp_hist[2].load(),(unsigned long long)counters.cp_hist[3].load(),(unsigned long long)counters.cp_hist[4].load(),(unsigned long long)counters.cp_hist[5].load());
 std::fprintf(stderr,"[g1total] {\"waits\":%llu,\"avgUs\":%.0f,\"totalMs\":%.0f,\"maxUs\":%llu}\n",(unsigned long long)counters.cp_total_waits.load(),double(counters.cp_total_wait_us.load())/double(counters.cp_total_waits.load()?counters.cp_total_waits.load():1),counters.cp_total_wait_us.load()/1000.0,(unsigned long long)counters.cp_total_wait_max_us.load());
 for(auto& w:wait_stats) if(w.n) std::fprintf(stderr,"[g1wait] {\"addr\":\"%08X\",\"info\":\"%X\",\"ref\":%u,\"mask\":\"%X\",\"lastValue\":%u,\"n\":%llu,\"avgUs\":%.0f,\"totalMs\":%.0f}\n",w.addr,w.info,w.ref,w.mask,w.lastValue,(unsigned long long)w.n,double(w.us)/double(w.n),double(w.us)/1000.0);
 {
   uint64_t at = r2.attributed.load(), d = at ? at : 1;
   auto h = [](std::atomic<uint64_t>* x) { static char buf[96]; std::snprintf(buf, sizeof buf, "[%llu,%llu,%llu,%llu,%llu,%llu]", (unsigned long long)x[0].load(), (unsigned long long)x[1].load(), (unsigned long long)x[2].load(), (unsigned long long)x[3].load(), (unsigned long long)x[4].load(), (unsigned long long)x[5].load()); return std::string(buf); };
   std::fprintf(stderr, "[r2] {\"watchHost\":%s,\"addr\":\"%08X\",\"ref\":%u,\"stores\":%llu,\"waits\":%llu,\"attributed\":%llu,\"unattributed\":%llu,\"immediate\":%llu,\"multiStore\":%llu,\"avgStartToWriteUs\":%.0f,\"avgWriteToSeenUs\":%.0f,\"maxWriteToSeenUs\":%llu,\"hist_lt0.1_0.5_1_4_16_ge16ms\":{\"a\":%s,\"b\":%s}}\n",
     r2_watch_host ? "true" : "false", r2.addr.load(), r2.ref.load(), (unsigned long long)r2.seq.load(), (unsigned long long)r2.waits.load(), (unsigned long long)at, (unsigned long long)r2.unattributed.load(), (unsigned long long)r2.immediate.load(), (unsigned long long)r2.multi.load(),
     double(r2.a_us.load()) / d, double(r2.b_us.load()) / d, (unsigned long long)r2.b_max_us.load(), h(r2.a_hist).c_str(), h(r2.b_hist).c_str());
   { uint32_t n = std::min(r2_nsamples.load(), kR2Samples);
     std::fprintf(stderr, "[r2pct] {\"n\":%u,\"aUs\":%s,\"bUs\":%s}\n", n, R2Pct(r2_a_samples, n).c_str(), R2Pct(r2_b_samples, n).c_str()); }
   std::fprintf(stderr, "[r2c] {\"cpWait\":\"%s\",\"eventWaits\":%llu,\"woken\":%llu,\"notEqual\":%llu,\"timeouts\":%llu,\"irqEpoch\":%u}\n", CpWaitPolicy() ? "event" : "sleep", (unsigned long long)ev.waits.load(), (unsigned long long)ev.woken.load(), (unsigned long long)ev.not_equal.load(), (unsigned long long)ev.timeouts.load(), irq_epoch.load());
   std::lock_guard<std::mutex> lk(writers_mu);
   for (auto& w : writers) if (w.n) std::fprintf(stderr, "[r2writer] {\"fn\":\"%s\",\"irqSource\":%d,\"thread\":\"%s\",\"tid\":\"%lx\",\"size\":%u,\"n\":%llu,\"toRef\":%llu,\"other\":%llu,\"last\":%u}\n", w.fn, w.src, w.thread, w.tid, w.size, (unsigned long long)w.n, (unsigned long long)w.to_ref, (unsigned long long)w.other, w.last);
 }
 { auto u = [](const std::atomic<uint64_t>& x) { return (unsigned long long)x.load(); };
   std::fprintf(stderr, "[r3a] {\"pumps\":%llu,\"idle\":%llu,\"waitMem\":%llu,\"swapped\":%llu,\"yield\":%llu,\"chunks\":%llu,\"framesPushed\":%llu,\"framesPopped\":%llu,\"maxDepth\":%u,\"failedPackets\":%llu,\"waitsStarted\":%llu,\"waitsFinished\":%llu,\"checkedChunks\":%llu,\"uncheckedChunks\":%llu,\"mismatchChunks\":%llu,\"packets\":[%llu,%llu],\"draws\":[%llu,%llu],\"swaps\":[%llu,%llu]}\n",
     u(r3a.pumps), u(r3a.ret_idle), u(r3a.ret_waitmem), u(r3a.ret_swapped), u(r3a.ret_yield), u(r3a.chunks), u(r3a.frames_pushed), u(r3a.frames_popped), r3a.max_depth.load(), u(r3a.failed_packets),
     u(r3a.waits_started), u(r3a.waits_finished), u(r3a.checked_chunks), u(r3a.unchecked_chunks), u(r3a.mismatch_chunks),
     u(r3a.expect_packets), u(r3a.exec_packets), u(r3a.expect_draws), u(r3a.exec_draws), u(r3a.expect_swaps), u(r3a.exec_swaps)); }
 { auto u = [](const std::atomic<uint64_t>& x) { return (unsigned long long)x.load(); };
   std::fprintf(stderr, "[r3b] {\"async\":%s,\"turns\":%llu,\"turnHist_lt0.25_1_4_8_16_ge16ms\":[%llu,%llu,%llu,%llu,%llu,%llu],\"turnMaxUs\":%llu,\"arms_msg_wake_irq_timer_backend\":[%llu,%llu,%llu,%llu,%llu],\"msgFired\":%llu,\"timerFired\":%llu,\"waitWoken\":%llu,\"waitTimeouts\":%llu,\"waitOther\":%llu,\"waitNotEqual\":%llu,\"stale\":%llu,\"reentry\":%llu,\"doubleArm\":%llu,\"budgetTime\":%llu,\"budgetPackets\":%llu,\"gatePending\":%llu,\"gateError\":%llu,\"backendReady\":%llu,\"backendFallback\":%llu,\"fakePending\":%llu}\n",
     CpAsync() ? "true" : "false", u(r3b.turns), u(r3b.turn_hist[0]), u(r3b.turn_hist[1]), u(r3b.turn_hist[2]), u(r3b.turn_hist[3]), u(r3b.turn_hist[4]), u(r3b.turn_hist[5]), u(r3b.turn_max_us),
     u(r3b.arms[1]), u(r3b.arms[2]), u(r3b.arms[3]), u(r3b.arms[4]), u(r3b.arms[5]), u(r3b.msg_fired), u(r3b.timer_fired), u(r3b.wait_woken), u(r3b.wait_timeouts), u(r3b.wait_other), u(r3b.wait_not_equal),
     u(r3b.stale), u(r3b.reentry), u(r3b.double_arm), u(r3b.budget_time), u(r3b.budget_packets), u(r3b.gate_pending), u(r3b.gate_error), u(r3b.backend_ready), u(r3b.backend_fallback), u(r3b.fake_pending)); }
 { std::fprintf(stderr, "[r3c] {");
   static const char* names[] = {"state", "swapsSeen", "submitted", "skipGpuBusy", "posted", "skipPresentBusy", "presentedAck", "gpuDone", "readbacks", "readbackOk", "readbackBad", "gpuErrors", "initMs", "maxGpuInflight", "maxPresentInflight", "deviceLost"};
   for (int i = 0; i < 16; ++i) std::fprintf(stderr, "%s\"%s\":%d", i ? "," : "", names[i], r3c_stats[i].load());
   std::fprintf(stderr, "}\n"); }
 std::fflush(stderr);
}
}
