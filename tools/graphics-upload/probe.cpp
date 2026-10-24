#include <emscripten.h>
#include <emscripten/threading.h>
#include <pthread.h>
#include <atomic>
#include <cstdint>
#include <cstring>

// One in-flight slot: producer owns pixels until GPU completion. Only producer blocks.
struct Slot {
  std::atomic<int32_t> ready{0}, fence{0}, status{0}, done{0};
  std::atomic<int32_t> timeout{0}, completed{0}, waits{0}, producer_worker{0};
  int32_t width = 0, height = 0, pitch = 0, unused = 0;
};
static_assert(sizeof(std::atomic<int32_t>) == 4);
static_assert(sizeof(Slot) == 48);
static Slot slot;
static uint8_t pixels[16384];
static int probe_mode = 0;

void* produce(void*) {
  slot.producer_worker.store(!emscripten_is_main_browser_thread());
  const int widths[] = {7, 13, 31, 33, 9, 65};
  const int heights[] = {5, 3, 7, 2, 17, 4};
  for (int seq = 1; seq <= 6; ++seq) {
    slot.width = widths[seq - 1]; slot.height = heights[seq - 1];
    slot.pitch = ((slot.width * 4 + 15) / 16) * 16 + 16;
    std::memset(pixels, 0xCD, sizeof(pixels));
    for (int y = 0; y < slot.height; ++y) {
      for (int x = 0; x < slot.width; ++x) {
        auto* p = pixels + y * slot.pitch + x * 4;
        p[0] = (x * 17 + seq * 29) & 255;
        p[1] = (y * 31 + seq * 7) & 255;
        p[2] = (x ^ y ^ (seq * 13)) & 255;
        p[3] = 255;
      }
    }
    // Actual mutation of the submitted bytes, not a fabricated test result.
    if (probe_mode == 1 && seq == 3) pixels[0] ^= 0xFF;
    slot.status.store(0);
    slot.ready.store(seq, std::memory_order_release);
    const double deadline = emscripten_get_now() + 3000;
    while (slot.fence.load(std::memory_order_acquire) < seq) {
      const int prior = slot.fence.load();
      if (prior >= seq) break;
      const double remaining = deadline - emscripten_get_now();
      if (remaining <= 0) {slot.timeout.store(seq); slot.done.store(1); return nullptr;}
      slot.waits.fetch_add(1);
      emscripten_futex_wait(&slot.fence, prior, remaining);
    }
    if (slot.status.load() != 1) break;
    slot.completed.store(seq);
  }
  slot.done.store(1, std::memory_order_release);
  return nullptr;
}

extern "C" EMSCRIPTEN_KEEPALIVE int start_producer() {
  pthread_t producer;
  const int error = pthread_create(&producer, nullptr, produce, nullptr);
  if (!error) pthread_detach(producer);
  return error;
}
extern "C" EMSCRIPTEN_KEEPALIVE void publish_probe(const char* json) {
  MAIN_THREAD_EM_ASM({Module['onProbeResult'](UTF8ToString($0));}, json);
}

extern "C" EMSCRIPTEN_KEEPALIVE void publish_texture(const char* json) {
  MAIN_THREAD_EM_ASM({if (Module['onTextureResult']) Module['onTextureResult'](UTF8ToString($0));}, json);
}

EM_JS(void, run_gpu, (int slot_ptr, int pixel_ptr, int mode), {
  (async () => {
    const base = slot_ptr >>> 2;
    const result = {mode: ['normal','corrupt-upload','drop-fence'][mode],
      gpuWorker: typeof document === 'undefined', cases: [], errors: [], ok: false};
    let device, started = false, last = 0;
    const pause = () => new Promise(resolve => setTimeout(resolve, 1));
    try {
      if (!navigator.gpu) throw Error('WebGPU unavailable');
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw Error('No GPU adapter');
      device = await adapter.requestDevice();
      const {uploadRgba8} = await import('/texture-upload.js');
      result.invalidDescriptors = [];
      for (const descriptor of [
        {width: 0, height: 1, data: new Uint8Array(4)},
        {width: 2, height: 1, bytesPerRow: 4, data: new Uint8Array(8)},
        {width: 2, height: 2, data: new Uint8Array(15)},
        {width: device.limits.maxTextureDimension2D + 1, height: 1, data: new Uint8Array(4)}
      ]) {
        try {const unexpected = await uploadRgba8(device, descriptor); unexpected.destroy(); result.invalidDescriptors.push(false);}
        catch (error) {result.invalidDescriptors.push(error instanceof RangeError);}
      }
      // Real upload with its completion promise withheld verifies loader timeout cleanup.
      const timeoutDevice = {limits: device.limits,
        pushErrorScope: kind => device.pushErrorScope(kind), popErrorScope: () => device.popErrorScope(),
        createTexture: desc => device.createTexture(desc), queue: {
          writeTexture: (...args) => device.queue.writeTexture(...args),
          onSubmittedWorkDone: () => new Promise(() => {})}};
      result.uploadTimeoutDetected = false;
      try {const unexpected = await uploadRgba8(timeoutDevice,
        {width: 1, height: 1, data: new Uint8Array([255,0,0,255]), timeoutMs: 20}); unexpected.destroy();}
      catch (error) {result.uploadTimeoutDetected = error.message === 'GPU texture upload timed out';}
      result.adapter = {vendor: adapter.info?.vendor, architecture: adapter.info?.architecture,
        isFallbackAdapter: adapter.info?.isFallbackAdapter ?? null};
      device.addEventListener('uncapturederror', e => result.errors.push(e.error.message));
      const error = _start_producer();
      if (error) throw Error('pthread_create: ' + error);
      started = true;
      const deadline = performance.now() + 15000;
      while (!Atomics.load(HEAP32, base + 3)) {
        if (performance.now() > deadline) throw Error('GPU owner watchdog');
        const seq = Atomics.load(HEAP32, base);
        if (!seq || seq === last) {await pause(); continue;}
        last = seq;
        const width = HEAP32[base + 8], height = HEAP32[base + 9], pitch = HEAP32[base + 10];
        const readPitch = Math.ceil(width * 4 / 256) * 256;
        const startedAt = performance.now();
        let texture, readback;
        device.pushErrorScope('validation');
        try {
          texture = await uploadRgba8(device, {width, height, bytesPerRow: pitch,
            data: HEAPU8.subarray(pixel_ptr, pixel_ptr + pitch * height)});
          readback = device.createBuffer({size: readPitch * height,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ});
          const encoder = device.createCommandEncoder();
          encoder.copyTextureToBuffer({texture}, {buffer: readback, bytesPerRow: readPitch}, [width, height]);
          device.queue.submit([encoder.finish()]);
          await device.queue.onSubmittedWorkDone();
          await readback.mapAsync(GPUMapMode.READ);
          const bytes = new Uint8Array(readback.getMappedRange());
          let mismatches = 0;
          for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const golden = [(x * 17 + seq * 29) & 255, (y * 31 + seq * 7) & 255,
              (x ^ y ^ (seq * 13)) & 255, 255];
            for (let c = 0; c < 4; c++) if (bytes[y * readPitch + x * 4 + c] !== golden[c]) mismatches++;
          }
          const rgba = [];
          for (let y = 0; y < height; y++) rgba.push(...bytes.subarray(y * readPitch, y * readPitch + width * 4));
          readback.unmap();
          const validation = await device.popErrorScope();
          if (validation) throw Error(validation.message);
          result.cases.push({seq, width, height, uploadPitch: pitch, readPitch, mismatches,
            bytesChecked: width * height * 4, completionMs: performance.now() - startedAt});
          const imagePtr = stringToNewUTF8(JSON.stringify({seq, width, height, mismatches, rgba}));
          _publish_texture(imagePtr); _free(imagePtr);
          Atomics.store(HEAP32, base + 2, mismatches ? -1 : 1);
          // Work completes, but the producer is intentionally denied its third fence.
          if (!(mode === 2 && seq === 3)) {
            Atomics.store(HEAP32, base + 1, seq);
            Atomics.notify(HEAP32, base + 1, 1);
          }
        } finally {readback?.destroy(); texture?.destroy();}
      }
      result.producerWorker = !!Atomics.load(HEAP32, base + 7);
      result.producerDone = !!Atomics.load(HEAP32, base + 3);
      result.completed = Atomics.load(HEAP32, base + 5);
      result.blockingWaits = Atomics.load(HEAP32, base + 6);
      result.timeoutSequence = Atomics.load(HEAP32, base + 4);
      result.lastFence = Atomics.load(HEAP32, base + 1);
      result.ok = result.gpuWorker && result.producerWorker && result.completed === 6 &&
        result.cases.length === 6 && result.cases.every(c => !c.mismatches) &&
        !result.timeoutSequence && !result.errors.length && result.invalidDescriptors.every(Boolean) && result.uploadTimeoutDetected;
    } catch (error) {
      result.errors.push(String(error));
      if (started) {
        Atomics.store(HEAP32, base + 2, -3);
        Atomics.store(HEAP32, base + 1, Atomics.load(HEAP32, base));
        Atomics.notify(HEAP32, base + 1, 1);
        const until = performance.now() + 3500;
        while (!Atomics.load(HEAP32, base + 3) && performance.now() < until) await pause();
      }
    } finally {device?.destroy();}
    const ptr = stringToNewUTF8(JSON.stringify(result)); _publish_probe(ptr); _free(ptr);
  })().catch(error => console.error(error));
});

int main(int argc, char** argv) {
  if (argc > 1 && !std::strcmp(argv[1], "corrupt-upload")) probe_mode = 1;
  if (argc > 1 && !std::strcmp(argv[1], "drop-fence")) probe_mode = 2;
  run_gpu(reinterpret_cast<intptr_t>(&slot), reinterpret_cast<intptr_t>(pixels), probe_mode);
  emscripten_exit_with_live_runtime();
  return 0;
}



