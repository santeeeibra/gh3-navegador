// Paso D2: piezas mínimas para enlazar el runtime sin ventana, sin Asyncify y sin UI.
// Cada una indica qué falta para la versión completa.
#include <cstdio>
#include <cstdlib>
#include <functional>

#include <rex/cvar.h>
#include <rex/logging.h>
#include <rex/thread/fiber.h>
#include <rex/ui/imgui_dialog.h>
#include <rex/ui/windowed_app_context.h>

// --- Opciones de pantalla (en nativo viven en src/ui/window.cpp, que necesita ventana/SDL). ---
REXCVAR_DEFINE_INT32(window_width, 0, "UI/Window",
                     "Startup window width in logical pixels (0 = use app default)")
    .range(0, 8192)
    .lifecycle(rex::cvar::Lifecycle::kRequiresRestart);
REXCVAR_DEFINE_INT32(window_height, 0, "UI/Window",
                     "Startup window height in logical pixels (0 = use app default)")
    .range(0, 8192)
    .lifecycle(rex::cvar::Lifecycle::kRequiresRestart);
REXCVAR_DEFINE_INT32(video_mode_width, 1280, "Display", "Guest video mode width in pixels")
    .range(640, 0x0FFF)
    .lifecycle(rex::cvar::Lifecycle::kRequiresRestart);
REXCVAR_DEFINE_INT32(video_mode_height, 720, "Display", "Guest video mode height in pixels")
    .range(480, 0x0FFF)
    .lifecycle(rex::cvar::Lifecycle::kRequiresRestart);
REXCVAR_DEFINE_STRING(resolution, "", "Display",
                      "Common resolution preset for both guest video mode and startup window (for "
                      "example: 720p, 1080p, 1440p, 4k, 1280x720)")
    .lifecycle(rex::cvar::Lifecycle::kRequiresRestart);
REXCVAR_DEFINE_DOUBLE(video_mode_refresh_rate, 60.0, "Display",
                      "Guest video mode refresh rate in Hz")
    .range(24.0, 240.0)
    .lifecycle(rex::cvar::Lifecycle::kRequiresRestart);

namespace rex::ui {

// --- Diálogos ImGui (XamShowMessageBoxUI y similares). Sin ventana no se muestran. ---
ImGuiDialog::ImGuiDialog(ImGuiDrawer* imgui_drawer) : imgui_drawer_(imgui_drawer) {}
ImGuiDialog::~ImGuiDialog() {
  for (auto* fence : waiting_fences_) fence->Signal();
}
void ImGuiDialog::Then(rex::thread::Fence* fence) { waiting_fences_.push_back(fence); }
void ImGuiDialog::Close() { has_close_pending_ = true; }

// Sin hilo de interfaz: avisa y responde que no se pudo.
bool WindowedAppContext::CallInUIThreadSynchronous(std::function<void()> function) {
  (void)function;
  REXLOG_WARN("[d2] CallInUIThreadSynchronous sin interfaz: ignorado");
  return false;
}

}  // namespace rex::ui

namespace rex::thread {

// --- Fibers sin Asyncify. Cada hilo guest se "convierte" en fiber al arrancar (xthread.cpp);
// eso alcanza con un objeto que lo represente. Crear o cambiar de fiber necesita
// src/core/fiber_emscripten.cpp + -sASYNCIFY (Fase 2): si el juego lo pide, se detiene acá.
thread_local Fiber* Fiber::tls_current_ = nullptr;

Fiber* Fiber::ConvertCurrentThread() {
  if (tls_current_) return tls_current_;
  auto* f = new Fiber();
  f->is_thread_fiber_ = true;
  tls_current_ = f;
  return f;
}

Fiber* Fiber::Create(size_t stack_size, void (*entry)(void*), void* arg) {
  (void)stack_size; (void)entry; (void)arg;
  REXLOG_ERROR("[d2] GH3 pidio Fiber::Create: hace falta Asyncify (fiber_emscripten.cpp)");
  std::fflush(nullptr);
  std::abort();
}

void Fiber::SwitchTo(Fiber* target) {
  (void)target;
  REXLOG_ERROR("[d2] GH3 pidio Fiber::SwitchTo: hace falta Asyncify (fiber_emscripten.cpp)");
  std::fflush(nullptr);
  std::abort();
}

void Fiber::Destroy() {
  if (tls_current_ == this) tls_current_ = nullptr;
  delete this;
}

// Cada pthread de Emscripten recibe TLS nuevo, así que tls_current_ ya empieza en nullptr.
void ResetFiberWorkerState() {}

}  // namespace rex::thread
