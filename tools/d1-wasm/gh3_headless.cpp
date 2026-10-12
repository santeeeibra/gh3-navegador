#include "g1d_metrics.h"
#include "g1_null_gpu.h"
#include "g1c_xma.h"
#include "g1e_input.h"
#include <cstring>
// Paso D2: arranque de GH3 (código recompilado) SIN ventana ni imagen; audio silencioso, para WebAssembly.
// Hace lo mismo que ReXApp (src/ui/rex_app.cpp) sin la parte de ventana/ImGui:
//   Runtime::Setup -> LoadXexImage("game:\default.xex") -> PrepareModuleLaunch -> Resume.
// Uso (Node, carpetas montadas por d3_mounts.js): gh3-headless /game /data [segundos] [nivel de log] [none|null] [silent|nop]
// Los datos de usuario y caché van a la carpeta de datos; la del juego solo se lee.
#include "gh3_init.h"

#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <memory>
#include <thread>

#include <rex/audio/nop/nop_audio_system.h>
#include <rex/audio/silent/silent_audio_system.h>
#include <rex/input/input_system.h>
#include <rex/input/nop/nop_input_driver.h>
#include <rex/kernel/init.h>
#include <rex/logging.h>
#include <rex/runtime.h>
#include <rex/system/kernel_state.h>
#include <rex/system/thread_state.h>
#include <rex/system/xthread.h>
#include <rex/system/util/object_table.h>

#include "rex_wasm_seg.h"

#include <emscripten/emscripten.h>

namespace {
double Seconds(std::chrono::steady_clock::time_point t0) {
  return std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
}
}  // namespace

#define D2MARK(msg) (std::fprintf(stderr, "[d2] %.2f s %s\n", Seconds(t0), msg), std::fflush(stderr))

int main(int argc, char** argv) {
  auto t0 = std::chrono::steady_clock::now();
  D2MARK("main");
  if (argc < 3) {
    std::fprintf(stderr, "uso: %s <carpeta del juego> <carpeta de datos> [segundos]\n", argv[0]);
    return 2;
  }
  std::filesystem::path game = argv[1];
  std::filesystem::path data = argv[2];
  int seconds = argc > 3 ? std::atoi(argv[3]) : 20;
  const char* log_level = argc > 4 ? argv[4] : "info";  // info, debug, trace

  D2MARK("InitLogging");
  {
    auto log_config = rex::BuildLogConfig(nullptr, log_level, {});
    log_config.log_to_console = true;  // sin ventana: todo a stdout
    log_config.console_pattern = "[%l] [%n] [t%t] %v";
    rex::InitLogging(log_config);
  }
  D2MARK("logging listo");
  REXLOG_INFO("gh3-headless (WASM) starting");
  REXLOG_INFO("  Game directory: {}", game.string());
  REXLOG_INFO("  Data directory: {}", data.string());

  auto runtime = std::make_unique<rex::Runtime>(game, data / "user", std::filesystem::path{},
                                                data / "cache", std::filesystem::path{});
  bool xma_decode=!(argc>7 && std::strcmp(argv[7],"silent-consume")==0);
  g1c::SetDecode(xma_decode);
  REXLOG_INFO("[g1c] XMA mode: {}",xma_decode?"decode":"silent-consume");
  rex::RuntimeConfig config;
  bool null_gpu = argc > 5 && std::strcmp(argv[5], "null") == 0;
  if (null_gpu) config.graphics = g1::Create();
  REXLOG_INFO("[g1] GPU mode: {}", null_gpu ? "null" : "none");
  bool silent_audio = !(argc > 6 && std::strcmp(argv[6], "nop") == 0);
  if (silent_audio) config.audio_factory = REX_AUDIO_BACKEND(rex::audio::silent::SilentAudioSystem);
  else config.audio_factory = REX_AUDIO_BACKEND(rex::audio::nop::NopAudioSystem);
  REXLOG_INFO("[g1b] Audio mode: {}", silent_audio ? "silent" : "nop (G1 negative control)");
  // G1e: argumento 8 = calendario de botones ("150:start", "-" = solo en vivo). Sin él, mando quieto (nop).
  const char* press_plan = argc > 8 ? argv[8] : nullptr;
  REXLOG_INFO("[g1e] Input: {}", press_plan ? press_plan : "nop");
  config.input_factory = [press_plan](bool) -> std::unique_ptr<rex::system::IInputSystem> {
    auto input = std::make_unique<rex::input::InputSystem>(nullptr);
    if (press_plan) input->AddDriver(g1e::Create(press_plan));
    else input->AddDriver(std::make_unique<rex::input::nop::NopInputDriver>(nullptr, 0));
    return input;
  };
  config.kernel_init = rex::kernel::InitializeKernel;

  D2MARK("Runtime::Setup");
  auto status = runtime->Setup(PPCImageConfig, std::move(config));
  if (XFAILED(status)) {
    REXLOG_ERROR("Runtime setup failed: {:08X}", status);
    return 1;
  }
  REXLOG_INFO("[d2] Runtime setup OK at {:.2f} s", Seconds(t0));
  if (PPCImageConfig.register_modules) PPCImageConfig.register_modules(runtime->kernel_state());

  D2MARK("LoadXexImage");
  status = runtime->LoadXexImage("game:\\default.xex");
  if (XFAILED(status)) {
    REXLOG_ERROR("Failed to load XEX: {:08X}", status);
    return 1;
  }
  REXLOG_INFO("[d2] XEX loaded at {:.2f} s", Seconds(t0));

  D2MARK("PrepareModuleLaunch");
  auto main_thread = runtime->PrepareModuleLaunch();
  if (!main_thread) {
    REXLOG_ERROR("Failed to launch module");
    return 1;
  }
  main_thread->Resume();
  REXLOG_INFO("[d2] Main guest thread resumed at {:.2f} s; running {} s", Seconds(t0), seconds);

  // Sin gráficos el juego se queda esperando el GPU (igual que nativo sin gpu_plugin); se mide
  // hasta dónde llega en un tiempo fijo y se sale.
  // Cada 0,5 s: estado del hilo principal guest (para ver si corre, dónde va y si está trabado).
  auto* thread = main_thread.get();
  for (int i = 0; i < seconds * 2; ++i) {
    std::this_thread::sleep_for(std::chrono::milliseconds(500));
    if (null_gpu && i % 2 == 1) {g1::Report();g1d::Report();}
    if (silent_audio && i % 2 == 1) rex::audio::silent::Report();
    if (i % 2 == 1) g1c::Report();
    if (i % 20 == 19) {
      auto threads = runtime->kernel_state()->object_table()->GetObjectsByType<rex::system::XThread>();
      for (auto& th : threads) {
        auto* c=th->thread_state()?th->thread_state()->context():nullptr;
        if(!c)continue;
        std::fprintf(stderr,"[g1b-thread] t=%.2f id=%u start=%08X running=%d lr=%08X r1=%08X r3=%08X r4=%08X r28=%08X r29=%08X r30=%08X r31=%08X stack=",Seconds(t0),th->thread_id(),th->creation_params()->start_address,int(th->is_running()),uint32_t(c->lr),c->r1.u32,c->r3.u32,c->r4.u32,c->r28.u32,c->r29.u32,c->r30.u32,c->r31.u32);
        auto word=[](uint32_t a){return __builtin_bswap32(*reinterpret_cast<volatile uint32_t*>(rexwasm::Host(a)));};
        uint32_t sp=c->r1.u32;
        for(int depth=0;depth<12 && sp>=0x70000000 && sp<0x80000000;depth++) {
          uint32_t next=word(sp);if(next<=sp || next-sp>0x10000 || next>=0x80000000)break;
          std::fprintf(stderr,"%08X,",word(next-8));sp=next;
        }
        std::fprintf(stderr,"\n");
      }
    }
    auto* ctx = thread->thread_state() ? thread->thread_state()->context() : nullptr;
    std::fprintf(stderr, "[d3] %.1f s running=%d lr=%08X r1=%08X r3=%08X ind=%08X\n", Seconds(t0),
                 int(thread->is_running()), ctx ? uint32_t(ctx->lr) : 0u, ctx ? ctx->r1.u32 : 0u,
                 ctx ? ctx->r3.u32 : 0u, ctx ? ctx->last_indirect_target : 0u);
    if (ctx && i % 4 == 0) {  // 32 bytes en r3 (p. ej. la sección crítica que espera)
      const uint8_t* p = rexwasm::Host(ctx->r3.u32);
      std::fprintf(stderr, "[d3]   mem[r3]:");
      for (int b = 0; b < 32; ++b) std::fprintf(stderr, "%s%02X", b % 4 ? "" : " ", p[b]);
      std::fprintf(stderr, "  thread_obj=%08X\n", thread->guest_object());
    }
  }
  REXLOG_INFO("[d2] Stopping after {:.2f} s", Seconds(t0));
  std::fflush(nullptr);
  emscripten_force_exit(0);  // _Exit desde un pthread no cierra el proceso de Node
}
