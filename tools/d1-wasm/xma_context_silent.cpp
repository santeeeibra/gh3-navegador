// Paso D2: XmaContext sin FFmpeg (reemplaza src/audio/xma_context.cpp). No decodifica: cuando el
// juego activa un contexto, se marcan sus buffers de entrada como consumidos y no se escribe
// salida (silencio). Alcanza para que el runtime arranque sin audio; el decodificador real
// (FFmpeg compilado a wasm) va en el paso de audio.
#include <rex/audio/xma/context.h>
#include <rex/logging.h>
#include <rex/system/xmemory.h>

#include <cstring>

namespace rex::audio {

XmaContext::XmaContext()
    : work_completion_event_(rex::thread::Event::CreateAutoResetEvent(false)) {}

XmaContext::~XmaContext() = default;

int XmaContext::Setup(uint32_t id, memory::Memory* memory, uint32_t guest_ptr) {
  id_ = id;
  memory_ = memory;
  guest_ptr_ = guest_ptr;
  return 0;
}

bool XmaContext::Work() {
  if (!is_allocated() || !is_enabled()) {
    return false;
  }
  std::lock_guard<std::mutex> lock(lock_);
  set_is_enabled(false);
  auto context_ptr = memory()->TranslateVirtual(guest_ptr());
  XMA_CONTEXT_DATA data(context_ptr);
  data.input_buffer_0_valid = 0;
  data.input_buffer_1_valid = 0;
  data.Store(context_ptr);
  return true;
}

void XmaContext::Enable() {
  std::lock_guard<std::mutex> lock(lock_);
  set_is_enabled(true);
}

bool XmaContext::Block(bool poll) {
  if (!lock_.try_lock()) {
    if (poll) {
      return false;
    }
    lock_.lock();
  }
  lock_.unlock();
  return true;
}

void XmaContext::Clear() {
  std::lock_guard<std::mutex> lock(lock_);
  auto context_ptr = memory()->TranslateVirtual(guest_ptr());
  XMA_CONTEXT_DATA data(context_ptr);
  ClearLocked(&data);
  data.Store(context_ptr);
}

void XmaContext::ClearLocked(XMA_CONTEXT_DATA* data) {
  data->input_buffer_0_valid = 0;
  data->input_buffer_1_valid = 0;
  data->output_buffer_valid = 0;
  data->input_buffer_read_offset = kBitsPerPacketHeader;
  data->output_buffer_read_offset = 0;
  data->output_buffer_write_offset = 0;
}

void XmaContext::Disable() {
  std::lock_guard<std::mutex> lock(lock_);
  set_is_enabled(false);
}

void XmaContext::Release() {
  std::lock_guard<std::mutex> lock(lock_);
  set_is_allocated(false);
  auto context_ptr = memory()->TranslateVirtual(guest_ptr());
  std::memset(context_ptr, 0, sizeof(XMA_CONTEXT_DATA));
}

}  // namespace rex::audio
