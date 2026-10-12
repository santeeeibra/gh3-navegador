// G1e: control programable (ver g1e_input.h).
#include "g1e_input.h"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <mutex>
#include <string>
#include <vector>

#include <rex/input/input.h>

#include <emscripten/emscripten.h>
#include <emscripten/em_asm.h>

using namespace rex;
using namespace rex::input;

namespace {
using Clock = std::chrono::steady_clock;
const Clock::time_point g_start = Clock::now();
double Now() { return std::chrono::duration<double>(Clock::now() - g_start).count(); }

std::atomic<uint32_t> g_buttons{0};
std::atomic<double> g_until{0};
std::atomic<uint32_t> g_packet{1};
std::atomic<uint32_t> g_polls{0};
// Sin destructores globales: los hilos del juego pueden seguir consultando el mando mientras el
// programa sale (emscripten_force_exit), así que estas estructuras se crean una vez y no se liberan.
struct Planned { double t; uint32_t buttons; bool done; };
std::mutex& g_mutex = *new std::mutex;
std::deque<X_INPUT_KEYSTROKE>& g_keys = *new std::deque<X_INPUT_KEYSTROKE>;
std::vector<Planned>& g_plan = *new std::vector<Planned>;

// C1: estado en vivo que escribe la página (teclado / Gamepad API) directo en la memoria compartida,
// sin pasar por mensajes al worker. Disposición (ver gh3-input.js): enteros de 32 bits
// [0] seq (la página lo incrementa DESPUÉS de escribir el resto), [1] botones XInput mantenidos,
// [2] gatillos (izq | der << 8), [3..6] palancas lx ly rx ry, [7] origen (1 teclado, 2 mando),
// un double en [8..9] = hora de escritura (performance.timeOrigin + now, ms) y en [10] los botones
// apretados desde la última lectura (la página los suma con Atomics.or; el juego los vacía al leer), para
// que un toque más corto que una consulta del juego no se pierda.
struct LiveInput {
  std::atomic<int32_t> seq, buttons, triggers, lx, ly, rx, ry, source;
  std::atomic<double> t_write;
  std::atomic<int32_t> latch;
};
alignas(8) LiveInput g_live;
// Copia ya leída (protegida por g_mutex).
int32_t g_live_seq = 0, g_live_source = 0;
uint32_t g_live_buttons = 0, g_live_triggers = 0, g_live_tap = 0;
int16_t g_live_axes[4] = {0, 0, 0, 0};
uint32_t g_live_changes = 0;
uint8_t g_sub_type = 0x01;  // mando común (igual que el nativo); G1_PADTYPE=guitar -> 0x06
double NowEpochMs() { return EM_ASM_DOUBLE({ return performance.timeOrigin + performance.now(); }); }

uint16_t VkFor(uint32_t button) {
  switch (button) {
    case X_INPUT_GAMEPAD_A: return 0x5800;      // VK_PAD_A
    case X_INPUT_GAMEPAD_B: return 0x5801;      // VK_PAD_B
    case X_INPUT_GAMEPAD_X: return 0x5802;
    case X_INPUT_GAMEPAD_Y: return 0x5803;
    case X_INPUT_GAMEPAD_DPAD_UP: return 0x5810;
    case X_INPUT_GAMEPAD_DPAD_DOWN: return 0x5811;
    case X_INPUT_GAMEPAD_DPAD_LEFT: return 0x5812;
    case X_INPUT_GAMEPAD_DPAD_RIGHT: return 0x5813;
    case X_INPUT_GAMEPAD_START: return 0x5814;  // VK_PAD_START
    case X_INPUT_GAMEPAD_BACK: return 0x5815;
    case X_INPUT_GAMEPAD_LEFT_SHOULDER: return 0x5804;   // VK_PAD_LSHOULDER
    case X_INPUT_GAMEPAD_RIGHT_SHOULDER: return 0x5805;  // VK_PAD_RSHOULDER
    case X_INPUT_GAMEPAD_LEFT_THUMB: return 0x5816;
    case X_INPUT_GAMEPAD_RIGHT_THUMB: return 0x5817;
    default: return 0;
  }
}

uint32_t ParseButtons(const std::string& s) {
  uint32_t b = 0;
  size_t i = 0;
  while (i <= s.size()) {
    size_t j = s.find('+', i);
    std::string n = s.substr(i, j == std::string::npos ? std::string::npos : j - i);
    if (n == "start") b |= X_INPUT_GAMEPAD_START;
    else if (n == "a") b |= X_INPUT_GAMEPAD_A;
    else if (n == "b") b |= X_INPUT_GAMEPAD_B;
    else if (n == "x") b |= X_INPUT_GAMEPAD_X;
    else if (n == "y") b |= X_INPUT_GAMEPAD_Y;
    else if (n == "back") b |= X_INPUT_GAMEPAD_BACK;
    else if (n == "up") b |= X_INPUT_GAMEPAD_DPAD_UP;
    else if (n == "down") b |= X_INPUT_GAMEPAD_DPAD_DOWN;
    else if (n == "left") b |= X_INPUT_GAMEPAD_DPAD_LEFT;
    else if (n == "right") b |= X_INPUT_GAMEPAD_DPAD_RIGHT;
    else if (n == "lb") b |= X_INPUT_GAMEPAD_LEFT_SHOULDER;
    else if (n == "rb") b |= X_INPUT_GAMEPAD_RIGHT_SHOULDER;
    else std::fprintf(stderr, "[g1e] boton desconocido: %s\n", n.c_str());
    if (j == std::string::npos) break;
    i = j + 1;
  }
  return b;
}

void Press(uint32_t buttons, int ms, const char* origin) {
  {
    std::lock_guard lock(g_mutex);
    for (uint32_t bit = 1; bit <= 0x8000; bit <<= 1) {
      if (!(buttons & bit) || !VkFor(bit)) continue;
      X_INPUT_KEYSTROKE ks{};
      ks.virtual_key = VkFor(bit);
      ks.flags = X_INPUT_KEYSTROKE_KEYDOWN;
      g_keys.push_back(ks);
      ks.flags = X_INPUT_KEYSTROKE_KEYUP;
      g_keys.push_back(ks);
    }
  }
  g_buttons.store(buttons);
  g_until.store(Now() + ms / 1000.0);
  g_packet.fetch_add(1);
  std::fprintf(stderr, "[g1e] press t=%.2f buttons=%04X ms=%d origin=%s polls=%u\n", Now(), buttons, ms,
               origin, g_polls.load());
}

// C1: toma el estado en vivo si la página lo cambió. Genera teclas (abajo/arriba) en cada cambio de
// botón, como hace XInput. Llamar con g_mutex tomado.
void SyncLive() {
  int32_t seq = g_live.seq.load(std::memory_order_acquire);
  if (seq == g_live_seq) return;
  int32_t b = 0, tr = 0, src = 0, ax[4] = {0, 0, 0, 0};
  double tw = 0;
  for (int tries = 0; tries < 4; ++tries) {  // la página pudo escribir a la vez: releer si cambió seq
    b = g_live.buttons.load(std::memory_order_relaxed);
    tr = g_live.triggers.load(std::memory_order_relaxed);
    ax[0] = g_live.lx.load(std::memory_order_relaxed);
    ax[1] = g_live.ly.load(std::memory_order_relaxed);
    ax[2] = g_live.rx.load(std::memory_order_relaxed);
    ax[3] = g_live.ry.load(std::memory_order_relaxed);
    src = g_live.source.load(std::memory_order_relaxed);
    tw = g_live.t_write.load(std::memory_order_relaxed);
    int32_t again = g_live.seq.load(std::memory_order_acquire);
    if (again == seq) break;
    seq = again;
  }
  g_live_seq = seq;
  uint32_t nb = static_cast<uint32_t>(b) & 0xFFFF, changed = nb ^ g_live_buttons;
  // Toques que ya se soltaron antes de esta lectura: se informan apretados en la próxima consulta.
  uint32_t tap = static_cast<uint32_t>(g_live.latch.exchange(0, std::memory_order_acq_rel)) & 0xFFFF & ~nb & ~g_live_buttons;
  g_live_tap |= tap;
  for (uint32_t bit = 1; bit <= 0x8000; bit <<= 1) {
    if (!VkFor(bit)) continue;
    X_INPUT_KEYSTROKE ks{};
    ks.virtual_key = VkFor(bit);
    if (tap & bit) {
      ks.flags = X_INPUT_KEYSTROKE_KEYDOWN;
      g_keys.push_back(ks);
      ks.flags = X_INPUT_KEYSTROKE_KEYUP;
      g_keys.push_back(ks);
    } else if (changed & bit) {
      ks.flags = (nb & bit) ? X_INPUT_KEYSTROKE_KEYDOWN : X_INPUT_KEYSTROKE_KEYUP;
      g_keys.push_back(ks);
    }
  }
  g_live_buttons = nb;
  g_live_triggers = static_cast<uint32_t>(tr) & 0xFFFF;
  for (int i = 0; i < 4; ++i) g_live_axes[i] = static_cast<int16_t>(std::clamp(ax[i], -32768, 32767));
  g_packet.fetch_add(1);
  if (changed || tap || src != g_live_source) {
    ++g_live_changes;
    std::fprintf(stderr, "[c1] t=%.2f buttons=%04X tap=%04X lt=%u rt=%u src=%d lat_ms=%.1f n=%u polls=%u\n", Now(), nb, tap,
                 g_live_triggers & 0xFF, g_live_triggers >> 8, src, tw > 0 ? NowEpochMs() - tw : -1.0,
                 g_live_changes, g_polls.load());
  }
  g_live_source = src;
}

std::atomic<bool> g_plan_cleared{false};  // canción híbrida: la página cancela el calendario (botones rápidos)

void CheckPlan() {
  if (g_plan_cleared.load(std::memory_order_relaxed)) return;
  double now = Now();
  for (auto& p : g_plan) {
    if (!p.done && now >= p.t) {
      p.done = true;
      Press(p.buttons, 300, "schedule");
    }
  }
}

class ScriptedInputDriver final : public InputDriver {
 public:
  ScriptedInputDriver() : InputDriver(nullptr, 0) {}
  X_STATUS Setup() override { return X_STATUS_SUCCESS; }
  X_RESULT GetCapabilities(uint32_t user_index, uint32_t, X_INPUT_CAPABILITIES* out) override {
    if (user_index != 0) return X_ERROR_DEVICE_NOT_CONNECTED;
    if (out) {
      std::memset(out, 0, sizeof(*out));
      out->type = 0x01;
      out->sub_type = g_sub_type;  // mando común salvo G1_PADTYPE=guitar
      out->gamepad.buttons = 0xFFFF;
    }
    return X_ERROR_SUCCESS;
  }
  X_RESULT GetState(uint32_t user_index, X_INPUT_STATE* out) override {
    if (user_index != 0) return X_ERROR_DEVICE_NOT_CONNECTED;
    if (g_polls.fetch_add(1) == 0) std::fprintf(stderr, "[g1e] primer GetState t=%.2f\n", Now());
    CheckPlan();
    uint32_t b = Now() < g_until.load() ? g_buttons.load() : 0;
    uint32_t tr;
    int16_t ax[4];
    {
      std::lock_guard lock(g_mutex);
      SyncLive();
      b |= g_live_buttons | g_live_tap;  // calendario/pulsación corta + botones en vivo (+ toques cortos)
      g_live_tap = 0;
      tr = g_live_triggers;
      std::memcpy(ax, g_live_axes, sizeof(ax));
    }
    if (out) {
      std::memset(out, 0, sizeof(*out));
      out->packet_number = g_packet.load();
      out->gamepad.buttons = static_cast<uint16_t>(b);
      out->gamepad.left_trigger = static_cast<uint8_t>(tr & 0xFF);
      out->gamepad.right_trigger = static_cast<uint8_t>(tr >> 8);
      out->gamepad.thumb_lx = ax[0];
      out->gamepad.thumb_ly = ax[1];
      out->gamepad.thumb_rx = ax[2];
      out->gamepad.thumb_ry = ax[3];
    }
    return X_ERROR_SUCCESS;
  }
  X_RESULT SetState(uint32_t user_index, X_INPUT_VIBRATION*) override {
    return user_index == 0 ? X_ERROR_SUCCESS : X_ERROR_DEVICE_NOT_CONNECTED;
  }
  X_RESULT GetKeystroke(uint32_t user_index, uint32_t, X_INPUT_KEYSTROKE* out) override {
    if (user_index != 0) return X_ERROR_DEVICE_NOT_CONNECTED;
    CheckPlan();
    std::lock_guard lock(g_mutex);
    SyncLive();
    if (g_keys.empty()) return X_ERROR_EMPTY;
    if (out) *out = g_keys.front();
    g_keys.pop_front();
    return X_ERROR_SUCCESS;
  }
};
}  // namespace

namespace g1e {
std::unique_ptr<rex::input::InputDriver> Create(const char* schedule) {
  // Formato: "150:start,160:a+start". Vacío o "-" = sin calendario (solo pulsaciones en vivo).
  std::string s = schedule ? schedule : "";
  size_t i = 0;
  while (!s.empty() && s != "-" && i < s.size()) {
    size_t j = s.find(',', i);
    std::string item = s.substr(i, j == std::string::npos ? std::string::npos : j - i);
    size_t c = item.find(':');
    if (c != std::string::npos) {
      g_plan.push_back({std::atof(item.substr(0, c).c_str()), ParseButtons(item.substr(c + 1)), false});
      std::fprintf(stderr, "[g1e] plan t=%.1f buttons=%04X\n", g_plan.back().t, g_plan.back().buttons);
    }
    if (j == std::string::npos) break;
    i = j + 1;
  }
  const char* pad = std::getenv("G1_PADTYPE");
  if (pad && std::strcmp(pad, "guitar") == 0) g_sub_type = 0x06;  // XINPUT_DEVSUBTYPE_GUITAR (prueba)
  std::fprintf(stderr, "[c1] mando en vivo listo sub_type=%02X\n", g_sub_type);
  return std::make_unique<ScriptedInputDriver>();
}
}  // namespace g1e

extern "C" EMSCRIPTEN_KEEPALIVE void g1e_press(int buttons, int ms) {
  Press(static_cast<uint32_t>(buttons), ms > 0 ? ms : 300, "live");
}

// C1: dirección del estado en vivo (la página escribe ahí con Atomics; ver gh3-input.js).
extern "C" EMSCRIPTEN_KEEPALIVE void* g1e_live_ptr() { return &g_live; }

// Canción híbrida: tabla de segmentos guest→wasm (rex_wasm_seg.cpp), para que la página lea la
// memoria del juego (reloj de la canción) desde el SharedArrayBuffer. Solo lectura.
extern "C" uintptr_t rexwasm_seg[256];
extern "C" EMSCRIPTEN_KEEPALIVE uintptr_t g1_seg_table() { return reinterpret_cast<uintptr_t>(rexwasm_seg); }

// Canción híbrida: cancela los botones pendientes del calendario (?press=); la página pasa a apretar en vivo.
extern "C" EMSCRIPTEN_KEEPALIVE void g1e_plan_clear() {
  g_plan_cleared.store(true);
  std::fprintf(stderr, "[g1e] calendario cancelado t=%.2f\n", Now());
}
