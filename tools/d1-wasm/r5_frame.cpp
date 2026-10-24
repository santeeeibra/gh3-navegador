// R5F: captura diagnóstica de cuadros completos (ver r5_frame.h y CONTRATO-R5F-V1.md).
// Escritor/layout: r5f_format.h. Dependencias: r5f_deps.h (misma lógica que los archivos mínimos).
#include "r5_frame.h"
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <set>
#include <string>
#include <tuple>
#include <vector>
#define XXH_INLINE_ALL
#include <xxhash.h>
#include <rex/cvar.h>
#include <rex/graphics/pipeline/shader/shader.h>
#include <rex/graphics/pipeline/texture/info.h>
#include <rex/graphics/pipeline/texture/util.h>
#include <rex/graphics/register_file.h>
#include <rex/graphics/registers.h>
#include <rex/graphics/util/draw.h>
#include <rex/graphics/xenos.h>
#include <rex/string/buffer.h>
#include "g1_null_gpu.h"
#include "r5f_deps.h"
#include "r5f_format.h"
#include "r5_dirty.h"
#include "rex_wasm_seg.h"
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

// Shader::AnalyzeUcode (translator.cpp) consulta esta cvar; el resto de graphics/flags.cpp no entra en el build.
REXCVAR_DEFINE_STRING(dump_shaders, "", "GPU", "Path to dump shaders to");

namespace r5frame {
namespace {
using namespace rex::graphics;
using namespace r5f;

// Rango de la base que carga el texture cache del SDK (TextureKey::GetGuestLayout ->
// GetGuestTextureLayout(...).base.level_data_extent_bytes). En texturas tiled el extent de
// direcciones supera los bloques visibles de TextureInfo::memory.base_size (R5F tanda 1 se
// quedaba corta en tiled chicas). 0 = sin base. *page_out = página de la base del fetch.
uint32_t GuestBaseExtent(const xenos::xe_gpu_texture_fetch_t& f, uint32_t* page_out,
                         uint32_t* mip_page_out = nullptr, uint32_t* mips_bytes_out = nullptr) {
  uint32_t w1 = 0, h1 = 0, d1 = 0, base_page = 0, mip_page = 0, mip_max = 0;
  texture_util::GetSubresourcesFromFetchConstant(f, &w1, &h1, &d1, &base_page, &mip_page, nullptr, &mip_max);
  *page_out = base_page;
  if (mip_page_out) *mip_page_out = mip_page;
  if (mips_bytes_out) *mips_bytes_out = 0;
  if (!base_page) return 0;
  const auto layout = texture_util::GetGuestTextureLayout(f.dimension, f.pitch, w1 + 1, h1 + 1, d1 + 1, f.tiled,
                                                          GetBaseFormat(f.format), f.packed_mips, true, mip_max);
  // Mips: mismo rango que carga el texture cache (mip_page << 12, mips_total_extent_bytes). TextureInfo
  // da mip_size 0 cuando toda la cadena cae en la cola empaquetada (p. ej. 32x32: mip 1 ya mide 16).
  if (mips_bytes_out && mip_page && mip_max) *mips_bytes_out = layout.mips_total_extent_bytes;
  return layout.base.level_data_extent_bytes;
}
namespace du = rex::graphics::draw_util;

#ifdef __EMSCRIPTEN__
// Sumidero. Node: archivo directo (fs.writeSync copia). Web: el hilo del CP acumula copias y al cerrar
// las transfiere al worker principal (callHandler 'r5frame') -> página -> descarga.
EM_JS(int, r5f_js_open, (const char* name_c, const char* dir_c), {
  try {
    const name = UTF8ToString(name_c), dir = UTF8ToString(dir_c);
    const node = typeof process === 'object' && process.versions && process.versions.node;
    if (node) {
      const fs = require('fs'), path = require('path');
      const p = path.resolve(dir || '.', name);
      globalThis.__r5f = { node: true, fd: fs.openSync(p, 'w'), path: p, bytes: 0 };
    } else {
      globalThis.__r5f = { node: false, chunks: [], bytes: 0, name };
    }
    return node ? 1 : 2;
  } catch (e) { err('[r5frame] no se pudo abrir el sumidero: ' + e); return 0; }
});
EM_JS(int, r5f_js_write, (uint32_t ptr, uint32_t len), {
  try {
    const s = globalThis.__r5f; ptr >>>= 0; len >>>= 0;
    const view = new Uint8Array(wasmMemory.buffer, ptr, len);
    if (s.node) { let o = 0; while (o < len) o += require('fs').writeSync(s.fd, view, o, len - o); }
    else s.chunks.push(view.slice().buffer);
    s.bytes += len;
    return 1;
  } catch (e) { err('[r5frame] sumidero falló: ' + e); return 0; }
});
// R5L (vivo): cada cuadro es un mini-archivo R5F completo SIN blobs; se entrega en el hilo del CP a
// globalThis.__r5liveConsumer(bytes, info, api). api.readPhysical(phys, bytes) lee la memoria fisica del
// guest directo del heap (vista viva, el consumidor copia). Nunca bloquea al CP: errores se cuentan.
EM_JS(int, r5l_js_deliver, (uint32_t ptr, uint32_t len, uint32_t seq, uint32_t swap, uint32_t phys_base, const char* consumer_c), {
  const g = globalThis;
  if (!g.__r5l) {
    const base = phys_base >>> 0;
    g.__r5l = { delivered: 0, dropped: 0, errors: 0, physBase: base };
    g.__r5liveApi = {
      readPhysical(phys, bytes) {
        phys = (phys >>> 0) & 0x1FFFFFFF; bytes = bytes >>> 0;
        if (phys + bytes > 0x20000000) throw new RangeError('r5live: rango fisico fuera de 512 MiB');
        return HEAPU8.subarray(base + phys, base + phys + bytes);
      },
      physBase: base,
    };
    const consumer = consumer_c ? UTF8ToString(consumer_c) : '';
    if (consumer) {
      try {
        if (typeof importScripts === 'function') importScripts(consumer);
        else if (typeof require === 'function') require(require('path').resolve(consumer));
        err('[r5live] consumidor cargado: ' + consumer + ' -> ' + typeof g.__r5liveConsumer);
      } catch (e) { err('[r5live] no se pudo cargar el consumidor ' + consumer + ': ' + e); }
    }
  }
  const st = g.__r5l, c = g.__r5liveConsumer;
  if (typeof c !== 'function') { st.dropped++; return 0; }
  try {
    const bytes = HEAPU8.slice(ptr >>> 0, (ptr >>> 0) + (len >>> 0));
    const r = c(bytes, { seq: seq >>> 0, swap: swap >>> 0 }, g.__r5liveApi);
    if (r && typeof r.catch === 'function') r.catch(e => { st.errors++; if (st.errors <= 5) err('[r5live] consumidor (async): ' + (e && e.stack || e)); });
    st.delivered++;
    return 1;
  } catch (e) { st.errors++; if (st.errors <= 5) err('[r5live] consumidor: ' + (e && e.stack || e)); return 0; }
});
// B6 (Claude 2026-10-13): ?r5livemin=<ms> en la URL del worker = intervalo mínimo entre cuadros vivos (celular: no armar
// imágenes que el dibujo no llega a mostrar). 0/ausente = cada swap, como antes.
EM_JS(int, r5l_js_host, (), { return (typeof process === 'object' && process.versions && process.versions.node) ? 1 : 2; });
EM_JS(int, r5f_js_close, (int ok), {
  try {
    const s = globalThis.__r5f; if (!s) return 0;
    globalThis.__r5f = null;
    if (s.node) { require('fs').closeSync(s.fd); err('[r5frame] archivo ' + s.path + ' ' + s.bytes + ' B'); return 1; }
    const chunks = ok ? s.chunks : [];
    self.postMessage({ cmd: 'callHandler', handler: 'r5frame', args: [chunks, s.name, ok ? 1 : 0, s.bytes] }, chunks);
    return 1;
  } catch (e) { err('[r5frame] cierre del sumidero falló: ' + e); return 0; }
});
#endif

bool PhysOk(uint32_t phys, uint32_t len) { return uint64_t(phys & 0x1FFFFFFFu) + len <= 0x20000000ull; }
uint64_t HashPhys(uint32_t phys, uint32_t len) { return len ? XXH3_64bits(rexwasm::HostPhysical(phys), len) : 0; }
uint64_t NowUs() { return uint64_t(std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now() - g1::counters.start).count()); }

struct Cfg { bool on = false, live = false, lite = false; int regscan = 0;  // regscan: 0 bloques marcados, 1 doble chequeo, 2 todo (viejo)
             uint32_t kind = 0, value = 0, frames = 2, max = kDefaultMaxBytes; std::string out, consumer; uint64_t min_us = 0; };
Cfg cfg;
// R5LITE (?r5lite=1, solo R5L): hash muestreado del destino de un COPY (256 B cada 4 KiB) en vez del hash completo.
// Solo sirve para notar si la CPU reescribió ese destino (clase "ambigua" de dep_base); ~16 veces menos bytes.
uint64_t HashCopyDest(uint32_t phys, uint32_t len) {
  if (!cfg.lite || len <= 8192) return HashPhys(phys, len);
  const uint8_t* p = rexwasm::HostPhysical(phys);
  uint64_t h = len;
  for (uint32_t off = 0; off < len; off += 4096) h = XXH3_64bits_withSeed(p + off, std::min<uint32_t>(256, len - off), h);
  return h;
}

struct Frame {  // contadores del cuadro abierto (FRAME_END)
  FrameEndBody e{};
  uint32_t copy_fail = 0, g1_draws0 = 0, g1_copies0 = 0, fb_dep = kDepUnknownOverflow;
  uint64_t bytes0 = 0;
};

struct State {
  bool capturing = false, done = false, packet_event = false;
  ResolveHistory hist;             // antes de la captura
  Writer w;
  XXH3_state_t* xs = nullptr;
  uint64_t seq = 0;                // último event_seq emitido
  uint32_t draw_index = 0, copy_index = 0, frame_no = 0, start_swap = 0, frame_events = 0;
  std::vector<uint32_t> prev_regs;
  std::set<std::pair<uint32_t, uint64_t>> shaders;
  std::map<std::tuple<uint32_t, uint32_t, uint64_t>, uint32_t> blob_ids;  // (phys, bytes, hash) -> id
  std::vector<uint8_t> blob_src_changed{0};                               // por id
  uint32_t next_blob = 1;
  std::vector<CaptureCopy> copies;
  std::map<size_t, std::pair<uint64_t, uint64_t>> copy_hash_memo;  // copia -> (seq consultado, hash)
  Edram edram;
  Frame f;
  std::vector<uint8_t> tmp;
  uint64_t capture_us = 0, t_begin = 0;
  uint32_t sink_kind = 0;
  std::string name;
  // Diagnóstico: draws/copias por swap de los últimos 120 swaps antes de la captura (patrón de cuadros).
  uint32_t prof_draws[120] = {}, prof_copies[120] = {}, prof_n = 0, prof_d0 = 0, prof_c0 = 0;
  // R5L
  std::vector<uint8_t> live_buf;
  uint32_t live_seq = 0, live_ok = 0, live_fail = 0, live_bytes_max = 0, live_phys_base = 0;
  uint64_t live_bytes_sum = 0, live_us = 0, deliver_us = 0, dep_base_n[5] = {}, live_last_start = 0, live_skipped = 0, live_not_ready = 0;
  uint64_t chk_events = 0, chk_diff = 0, chk_blocks = 0;  // Paso 1: doble chequeo (eventos, eventos distintos, bloques revisados)
} s;

bool Sink(const uint8_t* p, uint32_t n, void*) {
  if (cfg.live) { s.live_buf.insert(s.live_buf.end(), p, p + n); return true; }
#ifdef __EMSCRIPTEN__
  return r5f_js_write(uint32_t(uintptr_t(p)), n) == 1;
#else
  (void)p; (void)n; return false;
#endif
}
void HashUpd(const void* p, size_t n, void*) { XXH3_64bits_update(s.xs, p, n); }
template <class T> Writer::Part P(const T& v) { return {&v, sizeof v}; }

void Finish(const char* why) {
  if (!s.capturing) return;
  const uint64_t digest = XXH3_64bits_digest(s.xs);
  const bool ok = s.w.Finish(s.frame_no, digest);
  int closed = 0;
  if (cfg.live) {
    s.capturing = false;
    XXH3_freeState(s.xs); s.xs = nullptr;
    const uint32_t n = uint32_t(s.live_buf.size());
    const bool good = ok && s.w.status() == kComplete;
    int r = 0;
#ifdef __EMSCRIPTEN__
    if (good)
    {
      const uint64_t t0 = NowUs();
      r = r5l_js_deliver(uint32_t(uintptr_t(s.live_buf.data())), n, s.live_seq, s.start_swap, s.live_phys_base,
                         cfg.consumer.empty() ? nullptr : cfg.consumer.c_str());
      s.deliver_us += NowUs() - t0;
    }
#endif
    s.live_seq++; (r == 1 ? s.live_ok : s.live_fail)++;
    s.live_bytes_sum += n; s.live_bytes_max = std::max(s.live_bytes_max, n);
    if (s.live_seq <= 3 || s.live_seq % 600 == 0 || !good)
      std::fprintf(stderr, "[r5live] {\"seq\":%u,\"why\":\"%s\",\"status\":%u,\"bytes\":%u,\"ok\":%u,\"fail\":%u,\"bytesMax\":%u,\"bytesAvg\":%llu,\"msTotal\":%.1f,\"msConsumer\":%.1f,\"lite\":%d,\"notReady\":%llu,\"depBase\":[%llu,%llu,%llu,%llu,%llu]}\n",
                   s.live_seq, why, s.w.status(), n, s.live_ok, s.live_fail, s.live_bytes_max,
                   (unsigned long long)(s.live_bytes_sum / s.live_seq), (s.live_us + s.capture_us) / 1000.0, s.deliver_us / 1000.0, int(cfg.lite),
                   (unsigned long long)s.live_not_ready,
                   (unsigned long long)s.dep_base_n[0], (unsigned long long)s.dep_base_n[1], (unsigned long long)s.dep_base_n[2],
                   (unsigned long long)s.dep_base_n[3], (unsigned long long)s.dep_base_n[4]);
    if (s.live_seq <= 3 || s.live_seq % 600 == 0)
      std::fprintf(stderr, "[r5dirty] {\"seq\":%u,\"regscan\":%d,\"bloques\":%llu,\"eventos\":%llu,\"diferencias\":%llu}\n", s.live_seq, cfg.regscan,
                   (unsigned long long)s.chk_blocks, (unsigned long long)s.chk_events, (unsigned long long)s.chk_diff);
    s.live_buf.clear();
    return;
  }
#ifdef __EMSCRIPTEN__
  closed = r5f_js_close(ok && s.w.status() == kComplete ? 1 : 0);
#endif
  s.capturing = false; s.done = true;
  std::fprintf(stderr, "[r5frame] FIN {\"why\":\"%s\",\"status\":%u,\"reason\":%u,\"frames\":%u,\"records\":%u,\"bytes\":%llu,\"blobs\":%u,\"captureMs\":%.1f,\"wallMs\":%.1f,\"sinkClosed\":%d,\"name\":\"%s\"}\n",
               why, s.w.status(), s.w.reason(), s.frame_no, s.w.records(), (unsigned long long)s.w.total(), s.next_blob - 1,
               s.capture_us / 1000.0, (NowUs() - s.t_begin) / 1000.0, closed, s.name.c_str());
  XXH3_freeState(s.xs); s.xs = nullptr;
}
bool Live() { if (s.capturing && !s.w.ok()) Finish("limite o sumidero"); return s.capturing; }

void EmitShader(Shader* sh) {
  if (!sh || !Live()) return;
  const uint32_t type = sh->type() == xenos::ShaderType::kPixel ? 1 : 0;
  if (!s.shaders.insert({type, sh->ucode_data_hash()}).second) return;
  if (!sh->is_ucode_analyzed()) { rex::string::StringBuffer sb; sh->AnalyzeUcode(sb); }
  std::vector<uint32_t> vb, tb;
  for (auto& b : sh->vertex_bindings()) { vb.push_back(b.fetch_constant); vb.push_back(b.stride_words); }
  for (auto& b : sh->texture_bindings()) { tb.push_back(b.fetch_constant); tb.push_back(uint32_t(b.fetch_instr.dimension)); }
  ShaderBody b{type, uint32_t(sh->ucode_data().size()), sh->ucode_data_hash(),
               (sh->is_ucode_analyzed() ? 1u : 0u) | (sh->kills_pixels() ? 2u : 0u) | (sh->writes_depth() ? 4u : 0u) | (sh->memexport_eM_written() ? 8u : 0u),
               sh->writes_color_targets(), uint32_t(vb.size() / 2), uint32_t(tb.size() / 2)};
  Writer::Part parts[] = {P(b), {vb.data(), vb.size() * 4}, {tb.data(), tb.size() * 4}, {sh->ucode_data().data(), sh->ucode_data().size() * 4}};
  s.w.Record(kShader, 0, parts, 4);
}

// Bloque crudo del guest; dedupe por (phys, bytes, hash). Devuelve id (0 si no se pudo).
uint32_t Blob(uint32_t kind, uint32_t phys, uint32_t bytes) {
  if (!bytes || !Live()) return kNone;
  if (cfg.live) return kNone;  // R5L: el consumidor lee phys/bytes de la memoria compartida
  const uint8_t* src = rexwasm::HostPhysical(phys);
  const uint64_t h0 = XXH3_64bits(src, bytes);
  auto it = s.blob_ids.find({phys, bytes, h0});
  if (it != s.blob_ids.end()) return it->second;
  s.tmp.assign(src, src + bytes);
  const uint64_t h = XXH3_64bits(s.tmp.data(), bytes);
  const bool changed = h != h0 || XXH3_64bits(src, bytes) != h;
  const uint32_t id = s.next_blob;
  BlobBody b{id, kind, phys, bytes, h, changed ? 1u : 0u, 0};
  Writer::Part parts[] = {P(b), {s.tmp.data(), bytes}};
  if (!s.w.Record(kBlob, 0, parts, 2)) return kNone;
  s.next_blob++;
  s.blob_src_changed.push_back(changed);
  s.blob_ids[{phys, bytes, h}] = id;
  s.f.e.blobs_new++;
  return id;
}

// REG_DELTA (si cambió algo) + verificación de límites, antes de cada evento. false = captura cerrada.
bool BeginEvent(const RegisterFile& regs) {
  if (!Live()) return false;
  if (s.frame_events >= kMaxEventsPerFrame) { s.w.Truncate(kRTooManyEvents); Finish("eventos"); return false; }
  // R5OPT: mismo REG_DELTA (índices ascendentes de los registros distintos), pero se descartan de a bloques de
  // 16 registros con OR de XOR (vectorizable) y solo se recorren los bloques que cambiaron (14 → ~3,7 ms/cuadro).
  // Paso 1 fluidez (2026-10-14): sólo se revisan los bloques escritos desde el evento anterior (r5_dirty.h); un bloque
  // no escrito es igual a prev_regs, así que el resultado es el mismo. ?r5optcheck=1 compara con el recorrido completo.
  // Bloques escritos por otro hilo (g_fixed) se revisan siempre, leídos en el mismo momento que antes.
  static std::vector<uint32_t> d, full, blocks;
  d.clear(); blocks.clear();
  if (cfg.regscan != 2)
    for (uint32_t w = 0; w < r5dirty::kWords; w++) {
      uint32_t bits = r5dirty::g_fixed[w].load(std::memory_order_acquire);
      if (r5dirty::g_bits[w].load(std::memory_order_relaxed)) bits |= r5dirty::g_bits[w].exchange(0, std::memory_order_acq_rel);
      for (; bits; bits &= bits - 1) blocks.push_back(((w << 5) + uint32_t(__builtin_ctz(bits))) << 4);
    }
  const uint32_t* a = regs.values;
  static std::vector<uint32_t> snap;  // doble chequeo: una sola foto DESPUÉS del canje (otro hilo puede escribir entre los dos recorridos)
  if (cfg.regscan == 1) { snap.assign(regs.values, regs.values + kRegsCount); a = snap.data(); }
  const uint32_t* p = s.prev_regs.data();
  auto scan = [&](uint32_t blk, std::vector<uint32_t>& out) {
    const uint32_t end = std::min(blk + 16, kRegsCount);
    uint32_t acc = 0;
    for (uint32_t i = blk; i < end; i++) acc |= a[i] ^ p[i];
    if (!acc) return;
    for (uint32_t i = blk; i < end; i++) if (a[i] != p[i]) { out.push_back(i); out.push_back(a[i]); }
  };
  if (cfg.regscan == 2) {
    for (uint32_t blk = 0; blk < kRegsCount; blk += 16) scan(blk, d);
  } else {
    for (uint32_t blk : blocks) scan(blk, d);
    s.chk_blocks += blocks.size();
    if (cfg.regscan == 1) {
      full.clear();
      for (uint32_t blk = 0; blk < kRegsCount; blk += 16) scan(blk, full);
      s.chk_events++;
      if (full != d) {
        s.chk_diff++;
        if (s.chk_diff <= 10) {
          std::string miss;
          for (size_t k = 0; k < full.size() && miss.size() < 200; k += 2)
            if (std::find(d.begin(), d.end(), full[k]) == d.end()) miss += (miss.empty() ? "" : ",") + std::to_string(full[k]);
          size_t k = 0;
          while (k < full.size() && k < d.size() && full[k] == d[k]) k++;
          const uint32_t ri = uint32_t(k < full.size() ? full[k & ~size_t(1)] : k < d.size() ? d[k & ~size_t(1)] : 0), rb = ri >> 4;
          const bool late = (r5dirty::g_bits[rb >> 5].load() >> (rb & 31)) & 1;  // marcado DESPUÉS del canje: carrera con otro hilo
          std::fprintf(stderr, "[r5dirty] DIFERENCIA {\"evento\":%llu,\"completo\":%zu,\"marcado\":%zu,\"faltan\":[%s],\"reg\":%u,\"previo\":%u,\"foto\":%u,\"ahora\":%u,\"marcaTarde\":%d}\n",
                       (unsigned long long)s.chk_events, full.size() / 2, d.size() / 2, miss.c_str(), ri, p[ri], a[ri], regs.values[ri], int(late));
        }
      }
    }
  }
  if (!d.empty()) {
    RegDeltaBody b{uint32_t(d.size() / 2), 0};
    Writer::Part parts[] = {P(b), {d.data(), d.size() * 4}};
    if (!s.w.Record(kRegDelta, s.seq + 1, parts, 2)) { Finish("limite"); return false; }
    for (size_t k = 0; k < d.size(); k += 2) s.prev_regs[d[k]] = d[k + 1];
  }
  return true;
}
bool EmitEvent(uint32_t type, const Writer::Part* parts, size_t n) {
  if (!s.w.Record(type, s.seq + 1, parts, n)) { Finish("limite"); return false; }
  s.seq++; s.frame_events++; s.f.e.events++;
  return true;
}

void BeginFrame(const RegisterFile& regs, uint32_t open_swap) {
  s.f = Frame{};
  s.f.e.frame_no = s.frame_no;
  s.f.g1_draws0 = g1::counters.draws.load(); s.f.g1_copies0 = g1::counters.copies.load();
  s.f.bytes0 = s.w.total();
  s.frame_events = 0;
  FrameBeginBody b{s.frame_no, open_swap, NowUs(), s.frame_no == 0, 0, 0, 0};
  std::vector<HistEntry> h;
  if (s.frame_no == 0) {
    for (auto& [k, e] : s.hist.m) h.push_back(e);
    b.hist_count = uint32_t(h.size()); b.hist_overflow = s.hist.overflow;
  }
  Writer::Part parts[] = {P(b), {regs.values, b.regs_present ? size_t(kRegsCount) * 4 : 0}, {h.data(), h.size() * sizeof(HistEntry)}};
  if (!s.w.Record(kFrameBegin, 0, parts, 3)) Finish("limite");
}
void EndFrame() {
  auto& e = s.f.e;
  e.bytes_frame = uint32_t(s.w.total() - s.f.bytes0);
  e.g1_draws_delta = g1::counters.draws.load() - s.f.g1_draws0;
  e.g1_copies_delta = g1::counters.copies.load() - s.f.g1_copies0;
  e.replayable_exact = e.unsupported_draws == 0 && e.draws_edram_unknown == 0 && e.copies_src_unknown == 0 && s.f.copy_fail == 0 &&
                       e.tex_ambiguous == 0 && e.tex_stale == 0 && e.tex_overflow == 0 && e.src_changed == 0 && s.f.fb_dep <= kDepCaptureResolve;
  Writer::Part parts[] = {P(e)};
  if (!s.w.Record(kFrameEnd, 0, parts, 1)) { Finish("limite"); return; }
  if (!cfg.live || s.live_seq < 3) std::fprintf(stderr, "[r5frame] cuadro {\"frame\":%u,\"draws\":%u,\"issued\":%u,\"notIssued\":%u,\"copies\":%u,\"blobsNew\":%u,\"bytes\":%u,\"edramUnknown\":%u,\"copiesSrcUnknown\":%u,\"tex_resolve_amb_stale_ovf\":[%u,%u,%u,%u],\"srcChanged\":%u,\"unsupported\":%u,\"exact\":%u,\"g1Draws\":%u,\"g1Copies\":%u,\"frontbufferDep\":%u}\n",
               e.frame_no, e.draws, e.draws_issued, e.not_issued, e.copies, e.blobs_new, e.bytes_frame, e.draws_edram_unknown, e.copies_src_unknown,
               e.tex_capture_resolve, e.tex_ambiguous, e.tex_stale, e.tex_overflow, e.src_changed, e.unsupported_draws, e.replayable_exact, e.g1_draws_delta, e.g1_copies_delta, s.f.fb_dep);
  s.frame_no++;
}

// B6: ¿ya pasó el intervalo mínimo desde el último cuadro vivo? (cada cuadro vivo es un archivo independiente: saltear es seguro)
bool LiveDue() {
  if (!cfg.live) return true;
  if (cfg.min_us && NowUs() - s.live_last_start < cfg.min_us) { s.live_skipped++; return false; }
#if defined(__EMSCRIPTEN__) && !defined(R5L_SIN_B6B7)
  // B7 (Claude 2026-10-13): señal «listo» del consumidor (Codex, tools/r5-live-ready/README.md). 0 = el dibujo está ocupado y
  // descartaría este cuadro → no se arma. Sin la función (consumidor viejo o todavía sin importar) = como antes.
  if (!EM_ASM_INT({ const f = globalThis.__r5liveReady; return typeof f === 'function' ? (f() ? 1 : 0) : 1; })) { s.live_not_ready++; return false; }
#endif
  return true;
}

void StartCapture(const RegisterFile& regs, uint32_t swap_n) {
  s.name = "r5frame-s" + std::to_string(swap_n) + ".r5f";
  if (cfg.live) {
    s.live_last_start = NowUs();
    // Cada cuadro es un archivo independiente: se reinicia lo que el contrato define por archivo.
#ifdef __EMSCRIPTEN__
    s.sink_kind = uint32_t(r5l_js_host());  // 1 Node, 2 web (enum del contrato)
#else
    s.sink_kind = 1;
#endif
    s.live_buf.clear();
    s.seq = 0; s.draw_index = 0; s.copy_index = 0; s.frame_no = 0; s.frame_events = 0;
    s.shaders.clear(); s.blob_ids.clear(); s.blob_src_changed.assign(1, 0); s.next_blob = 1;
    s.copies.clear(); s.copy_hash_memo.clear(); s.live_us += s.capture_us; s.capture_us = 0;
    if (!s.live_phys_base) {
      const uint8_t* b0 = rexwasm::HostPhysical(0);
      if (rexwasm::HostPhysical(0x1FFFFFFFu) != b0 + 0x1FFFFFFFu) { s.done = true; std::fprintf(stderr, "[r5live] memoria fisica no contigua: APAGADO\n"); return; }
      s.live_phys_base = uint32_t(uintptr_t(b0));
    }
  } else {
#ifdef __EMSCRIPTEN__
  s.sink_kind = uint32_t(r5f_js_open(s.name.c_str(), cfg.out.c_str()));
#endif
  }
  if (!s.sink_kind) { s.done = true; std::fprintf(stderr, "[r5frame] sin sumidero: captura cancelada\n"); return; }
  s.xs = XXH3_createState(); XXH3_64bits_reset(s.xs);
  s.w.Start(cfg.max, Sink, HashUpd, nullptr);
  s.capturing = true; s.start_swap = swap_n; s.t_begin = NowUs();
  r5dirty::ClearAll();  // antes de copiar: una escritura posterior queda marcada para el primer evento
  s.prev_regs.assign(regs.values, regs.values + kRegsCount);
  FileHeader h{};
  h.magic = kMagic; h.version = kVersion; h.header_bytes = 64; h.host = s.sink_kind; h.trigger_kind = cfg.kind; h.trigger_value = cfg.value;
  h.frames_requested = cfg.frames; h.regs_count = kRegsCount; h.max_bytes = cfg.max; h.start_swap = swap_n; h.start_time_us = NowUs();
  s.w.PutFileHeader(h);
  std::string pd, pc;
  for (uint32_t i = s.prof_n > 120 ? s.prof_n - 120 : 0; i < s.prof_n; i++) {
    pd += (pd.empty() ? "" : ",") + std::to_string(s.prof_draws[i % 120]);
    pc += (pc.empty() ? "" : ",") + std::to_string(s.prof_copies[i % 120]);
  }
  if (!cfg.live) std::fprintf(stderr, "[r5frame] perfil {\"drawsPorSwap\":[%s],\"copiesPorSwap\":[%s]}\n", pd.c_str(), pc.c_str());
  if (!cfg.live || s.live_seq < 3) std::fprintf(stderr, "[r5frame] INICIO {\"swap\":%u,\"tMs\":%.1f,\"frames\":%u,\"hist\":%zu,\"histOverflow\":%d,\"sink\":%u}\n",
               swap_n, NowUs() / 1000.0, cfg.frames, s.hist.m.size(), int(s.hist.overflow), s.sink_kind);
  BeginFrame(regs, swap_n);
}

uint64_t CopyHashNow(const CaptureCopy& c) {
  const size_t i = size_t(&c - s.copies.data());
  auto& m = s.copy_hash_memo[i];
  if (m.first != s.seq + 1) m = {s.seq + 1, HashCopyDest(uint32_t(c.r.s), uint32_t(c.r.e - c.r.s))};
  return m.second;
}
DepResult Dep(uint32_t phys, uint32_t bytes, const Surface* reader = nullptr) {
  if (!bytes) return {};
  return Classify({phys, uint64_t(phys) + bytes}, s.copies, s.hist, CopyHashNow, reader);
}
uint32_t BytesPerPixel(uint32_t gpu_format) {
  const FormatInfo* fi = FormatInfo::Get(gpu_format);
  return fi && fi->block_width == 1 && fi->block_height == 1 ? fi->bits_per_pixel / 8 : 0;
}

// EDRAM tocada por un draw emitido (§6.3). Devuelve (targets, prior).
std::pair<uint32_t, uint32_t> DrawEdram(const RegisterFile& regs, Shader* ps) {
  uint32_t targets = 0, prior = 0;
  const auto mode = regs.Get<reg::RB_MODECONTROL>().edram_mode;
  if (mode != xenos::EdramMode::kColorDepth && mode != xenos::EdramMode::kDepthOnly) return {0, 0};
  if (!du::IsRasterizationPotentiallyDone(regs, du::IsPrimitivePolygonal(regs))) return {0, 0};
  du::Scissor sc; du::GetScissor(regs, sc, true);
  if (!sc.extent[0] || !sc.extent[1]) return {0, 0};
  const auto surf = regs.Get<reg::RB_SURFACE_INFO>();
  const uint32_t ys = surf.msaa_samples >= xenos::MsaaSamples::k2X ? 1 : 0, x4 = surf.msaa_samples >= xenos::MsaaSamples::k4X ? 1 : 0;
  auto check = [&](uint32_t bit, uint32_t base, bool is64) {
    const uint32_t pitch = xenos::GetSurfacePitchTiles(surf.surface_pitch, surf.msaa_samples, is64);
    const TileRect t = SamplesToTiles(base, pitch, sc.offset[0], sc.offset[1], sc.extent[0], sc.extent[1], x4 + (is64 ? 1 : 0), ys, false);
    targets |= 1u << bit;
    if (!s.edram.AllKnown(t)) prior |= 1u << bit;
  };
  if (mode == xenos::EdramMode::kColorDepth) {
    const uint32_t mask = du::GetNormalizedColorMask(regs, ps ? ps->writes_color_targets() : 0);
    for (uint32_t i = 0; i < 4; i++) {
      if (!((mask >> (4 * i)) & 0xF)) continue;
      const auto ci = regs.Get<reg::RB_COLOR_INFO>(reg::RB_COLOR_INFO::rt_register_indices[i]);
      check(i, ci.color_base, xenos::IsColorRenderTargetFormat64bpp(ci.color_format));
    }
  }
  const auto dc = du::GetNormalizedDepthControl(regs);
  if (dc.z_enable || dc.stencil_enable) check(4, regs.Get<reg::RB_DEPTH_INFO>().depth_base, false);
  return {targets, prior};
}

void RecordDraw(const Ctx& c, uint32_t status, uint32_t initiator, uint32_t prim, uint32_t count, const IndexDesc& ib, bool major_explicit) {
  const RegisterFile& regs = *c.regs;
  EmitShader(c.vs); EmitShader(c.ps);
  if (!Live()) return;
  DrawBody d{};
  d.draw_index = s.draw_index; d.status = status; d.prim = prim; d.index_count = count; d.vgt_draw_initiator = initiator;
  d.major_explicit = major_explicit; d.vs_hash = c.vs ? c.vs->ucode_data_hash() : 0; d.ps_hash = c.ps ? c.ps->ucode_data_hash() : 0;
  reg::VGT_DRAW_INITIATOR vdi; vdi.value = initiator;
  d.index_source = vdi.source_select == xenos::SourceSelect::kAutoIndex ? 0 : vdi.source_select == xenos::SourceSelect::kDMA ? 1 : 2;
  std::vector<VFetchEntry> vfe; std::vector<TFetchEntry> tfe;
  bool src_changed = false, tex_not_exact = false;
  const bool issued = status == kIssued;
  if (issued) {
    uint32_t u = 0;
    if (!c.vs) u |= kUNoShader;
    for (Shader* sh : {c.vs, c.ps}) if (sh && sh->is_ucode_analyzed() && sh->memexport_eM_written()) u |= kUMemexport;
    for (Shader* sh : {c.vs, c.ps}) if (sh && !sh->is_ucode_analyzed()) u |= kUNotAnalyzed;
    if (regs.Get<reg::VGT_OUTPUT_PATH_CNTL>().path_select != xenos::VGTOutputPath::kVertexReuse) u |= kUPathTess;
    const auto mode = regs.Get<reg::RB_MODECONTROL>().edram_mode;
    if (mode != xenos::EdramMode::kColorDepth && mode != xenos::EdramMode::kDepthOnly) u |= kUEdramMode;
    if (ib.dma) {
      d.index_format = ib.format; d.index_endian = ib.endian; d.index_phys = ib.phys; d.index_bytes = ib.bytes;
      if (!PhysOk(ib.phys, ib.bytes)) u |= kURange;
      else { d.index_blob = Blob(kIndex, ib.phys, ib.bytes); src_changed |= s.blob_src_changed[d.index_blob] != 0; }
    }
    std::set<uint32_t> vslots, tslots;
    if (c.vs) for (auto& b : c.vs->vertex_bindings()) vslots.insert(b.fetch_constant);
    for (Shader* sh : {c.vs, c.ps}) if (sh) for (auto& b : sh->texture_bindings()) tslots.insert(b.fetch_constant);
    for (uint32_t slot : vslots) {
      VFetchEntry e{}; e.fetch_slot = slot;
      if (slot >= 96) { e.status = 2; u |= kURange; vfe.push_back(e); continue; }
      const auto f = regs.GetVertexFetch(slot);
      e.raw0 = f.dword_0; e.raw1 = f.dword_1;
      const uint32_t phys = f.address << 2, bytes = f.size * 4;
      if (f.type != xenos::FetchConstantType::kVertex) { e.status = 1; u |= kUFetchType; }
      else if (!bytes) e.status = 3;
      else if (!PhysOk(phys, bytes)) { e.status = 2; u |= kURange; }
      else { e.blob_id = Blob(kVertex, phys, bytes); src_changed |= s.blob_src_changed[e.blob_id] != 0; }
      vfe.push_back(e);
    }
    for (uint32_t slot : tslots) {
      TFetchEntry e{}; e.fetch_slot = slot;
      if (slot >= 32) { e.status = 3; u |= kURange; tfe.push_back(e); continue; }
      const auto f = regs.GetTextureFetch(slot);
      std::memcpy(e.raw, &f, sizeof e.raw);
      TextureInfo ti;
      if (f.type != xenos::FetchConstantType::kTexture) { e.status = 1; u |= kUFetchType; tfe.push_back(e); continue; }
      if (!TextureInfo::Prepare(f, &ti)) { e.status = 2; u |= kUPrepare; tfe.push_back(e); continue; }
      e.format = uint32_t(ti.format); e.endian = uint32_t(ti.endianness); e.dimension = uint32_t(ti.dimension);
      e.width = ti.width; e.height = ti.height; e.depth = ti.depth; e.pitch = ti.pitch; e.tiled = ti.is_tiled;
      e.mip_min = ti.mip_min_level; e.mip_max = ti.mip_max_level; e.packed_mips = ti.has_packed_mips;
      e.base_phys = ti.memory.base_address; e.base_bytes = 0;
      uint32_t mip_page = 0, mips_extent = 0;
      if (e.base_phys) {
        // Nunca menos que antes: en lineales más angostas que el pitch el extent puede ser menor.
        uint32_t page = 0; e.base_bytes = std::max(GuestBaseExtent(f, &page, &mip_page, &mips_extent), ti.memory.base_size);
        // Fetch y TextureInfo deben apuntar a la misma base; si no, no se captura a ciegas.
        if ((page << 12) != e.base_phys) { e.status = 3; u |= kURange; tfe.push_back(e); continue; }
      }
      if (ti.memory.mip_address && ti.memory.mip_size) { e.mip_phys = ti.memory.mip_address; e.mip_bytes = ti.memory.mip_size; }
      // Nunca menos que antes; solo si fetch y TextureInfo coinciden en la dirección de los mips.
      if (mips_extent && ti.memory.mip_address == (mip_page << 12) && mips_extent > e.mip_bytes) {
        e.mip_phys = ti.memory.mip_address; e.mip_bytes = mips_extent;
      }
      if (!PhysOk(e.base_phys, e.base_bytes) || !PhysOk(e.mip_phys, e.mip_bytes)) { e.status = 3; u |= kURange; tfe.push_back(e); continue; }
      e.base_blob = Blob(kTexBase, e.base_phys, e.base_bytes);
      e.mip_blob = Blob(kTexMips, e.mip_phys, e.mip_bytes);
      src_changed |= s.blob_src_changed[e.base_blob] != 0 || s.blob_src_changed[e.mip_blob] != 0;
      // Superficie que lee la base (cobertura por COPY de la misma superficie). Los mips nunca se cubren así.
      Surface rd;
      if (ti.is_tiled && ti.dimension == xenos::DataDimension::k2DOrStacked && ti.depth == 0)
        rd = {true, e.base_phys, ti.pitch, ti.width + 1, ti.height + 1, BytesPerPixel(uint32_t(ti.format))};
      if (!rd.bpp) rd.valid = false;
      // R5LITE: el consumidor vivo no lee dep_mip (sube solo el nivel base); no se clasifican los mips.
      const DepResult db = Dep(e.base_phys, e.base_bytes, &rd), dm = cfg.lite ? DepResult{} : Dep(e.mip_phys, e.mip_bytes);
      s.dep_base_n[std::min<uint32_t>(db.cls, 4)]++;
      e.dep_base = db.cls; e.dep_mip = dm.cls; e.dep_class = WorseDep(db.cls, dm.cls);
      e.dep_last_copy_seq = std::max(db.last_seq, dm.last_seq); e.dep_copies = std::max(db.copies, dm.copies);
      if (e.dep_class > kDepCaptureResolve) tex_not_exact = true;
      switch (e.dep_class) { case 1: s.f.e.tex_capture_resolve++; break; case 2: s.f.e.tex_ambiguous++; break; case 3: s.f.e.tex_stale++; break; case 4: s.f.e.tex_overflow++; break; }
      tfe.push_back(e);
    }
    if (!Live()) return;
    // R5LITE: edram_targets/edram_prior no los lee el consumidor vivo (DrawEdram solo consulta, no marca).
    auto [targets, prior] = cfg.lite ? std::pair<uint32_t, uint32_t>{0, 0} : DrawEdram(regs, c.ps);
    d.edram_targets = targets; d.edram_prior = prior;
    d.unsupported_mask = u;
    if (u) { d.status = kIssuedUnsupported; s.f.e.unsupported_draws++; }
    if (prior) s.f.e.draws_edram_unknown++;
    if (src_changed) s.f.e.src_changed++;
    d.replay_flags = (tex_not_exact ? 1 : 0) | (src_changed ? 2 : 0) | (u ? 4 : 0) | (prior ? 8 : 0);
    s.f.e.draws_issued++;
  } else {
    s.f.e.not_issued++;
  }
  d.n_vf = uint32_t(vfe.size()); d.n_tf = uint32_t(tfe.size());
  if (!BeginEvent(regs)) return;
  Writer::Part parts[] = {P(d), {vfe.data(), vfe.size() * sizeof(VFetchEntry)}, {tfe.data(), tfe.size() * sizeof(TFetchEntry)}};
  if (EmitEvent(kDraw, parts, 3)) { s.draw_index++; s.f.e.draws++; }
}

struct Timer { uint64_t t0 = NowUs(); ~Timer() { s.capture_us += NowUs() - t0; } };
}  // namespace

bool Enabled() {
  static bool v = [] {
    if (const char* l = std::getenv("G1_R5LIVE"); l && !std::strcmp(l, "1")) {
      const char* snap = std::getenv("G1_R5SNAP");
      if (snap && !std::strcmp(snap, "1")) { std::fprintf(stderr, "[r5live] AVISO: incompatible con G1_R5SNAP=1; APAGADO\n"); return false; }
      cfg.live = true; cfg.kind = 2; cfg.value = 1; cfg.frames = 1; cfg.max = 32u << 20;
      if (const char* m = std::getenv("G1_R5LIVE_MAX")) { uint32_t x = uint32_t(std::strtoul(m, nullptr, 10)); if (x >= 64 + kFooterBytes) cfg.max = x; }
      if (const char* cn = std::getenv("G1_R5LIVE_CONSUMER")) cfg.consumer = cn;
      if (const char* lt = std::getenv("G1_R5LITE"); lt && !std::strcmp(lt, "1")) cfg.lite = true;
      if (const char* rc = std::getenv("G1_R5OPT_CHECK")) cfg.regscan = !std::strcmp(rc, "1") ? 1 : !std::strcmp(rc, "full") ? 2 : 0;
#if defined(__EMSCRIPTEN__) && !defined(R5L_SIN_B6B7)  // -DR5L_SIN_B6B7: sin EM_ASM -> mismo gh3-web.js que B4
      cfg.min_us = uint64_t(EM_ASM_INT({ try { const n = Number(new URLSearchParams(self.location.search).get('r5livemin')); return n > 0 && n < 1000 ? n | 0 : 0; } catch (e) { return 0; } })) * 1000;  // EM_ASM: va en ASM_CONSTS
      if (cfg.min_us) std::fprintf(stderr, "[r5live] {\"minMs\":%llu}\n", (unsigned long long)(cfg.min_us / 1000));
#endif
      std::fprintf(stderr, "[r5live] {\"on\":true,\"maxBytes\":%u,\"consumer\":\"%s\",\"lite\":%d}\n", cfg.max, cfg.consumer.c_str(), int(cfg.lite));
      std::fprintf(stderr, "[r5dirty] {\"regscan\":%d}\n", cfg.regscan);
      cfg.on = true;
      return true;
    }
    const char* e = std::getenv("G1_R5FRAME");
    if (!e || !*e) return false;
    const char* snap = std::getenv("G1_R5SNAP");
    if (snap && !std::strcmp(snap, "1")) { std::fprintf(stderr, "[r5frame] AVISO: incompatible con G1_R5SNAP=1; captura APAGADA\n"); return false; }
    unsigned val = 0, fr = 2;
    if (std::sscanf(e, "at:%u", &val) == 1) cfg.kind = 1;
    else if (std::sscanf(e, "swap:%u", &val) == 1) cfg.kind = 2;
    if (const char* f = std::strstr(e, "frames:")) fr = unsigned(std::strtoul(f + 7, nullptr, 10));
    if (!cfg.kind || fr < 1 || fr > kMaxFrames) { std::fprintf(stderr, "[r5frame] AVISO: G1_R5FRAME inválido '%s' (at:<ms>|swap:<N>[,frames:1..4]); APAGADA\n", e); return false; }
    cfg.value = val; cfg.frames = fr;
    if (const char* m = std::getenv("G1_R5FRAME_MAX")) { uint32_t x = uint32_t(std::strtoul(m, nullptr, 10)); if (x >= 64 + kFooterBytes) cfg.max = x; }
    if (const char* o = std::getenv("G1_R5FRAME_OUT")) cfg.out = o;
    std::fprintf(stderr, "[r5frame] {\"on\":true,\"trigger\":\"%s\",\"value\":%u,\"frames\":%u,\"maxBytes\":%u,\"out\":\"%s\"}\n",
                 cfg.kind == 1 ? "at_ms" : "swap", cfg.value, cfg.frames, cfg.max, cfg.out.c_str());
    cfg.on = true;
    return true;
  }();
  return v;
}

void OnDraw(const Ctx& c, uint32_t initiator, uint32_t prim, uint32_t count, const IndexDesc& ib, bool major_explicit) {
  s.packet_event = true;
  if (!s.capturing) return;
  Timer t;
  RecordDraw(c, kIssued, initiator, prim, count, ib, major_explicit);
}

void OnCopy(const Ctx& c) {
  s.packet_event = true;
  if (s.done) return;
  du::ResolveInfo ri{};
  const bool ok = du::GetResolveInfo(*c.regs, *c.memory, *c.trace_writer, 1, 1, false, false, ri);
  if (!s.capturing) {
    if (ok && ri.copy_dest_extent_length)
      s.hist.Note(ri.copy_dest_extent_start, ri.copy_dest_extent_length, ri.copy_dest_base, ri.copy_dest_info.value, g1::counters.swaps.load());
    return;
  }
  Timer t;
  if (!Live()) return;
  CopyBody b{};
  b.copy_index = s.copy_index;
  b.status = !ok ? 1 : (!ri.coordinate_info.width_div_8 || !ri.height_div_8) ? 2 : 0;
  if (ok) {
    b.rb_copy_control = ri.rb_copy_control.value; b.depth_edram_info = ri.depth_edram_info.packed; b.color_edram_info = ri.color_edram_info.packed;
    b.depth_original_base = ri.depth_original_base; b.color_original_base = ri.color_original_base; b.coordinate_info = ri.coordinate_info.packed;
    b.height_div_8 = ri.height_div_8; b.copy_dest_info = ri.copy_dest_info.value; b.copy_dest_coordinate_info = ri.copy_dest_coordinate_info.packed;
    b.copy_dest_base = ri.copy_dest_base; b.copy_dest_extent_start = ri.copy_dest_extent_start; b.copy_dest_extent_length = ri.copy_dest_extent_length;
    b.rb_depth_clear = ri.rb_depth_clear; b.rb_color_clear = ri.rb_color_clear; b.rb_color_clear_lo = ri.rb_color_clear_lo;
  }
  const auto f0 = c.regs->GetVertexFetch(0);
  if (f0.type == xenos::FetchConstantType::kVertex && f0.size && PhysOk(f0.address << 2, std::min<uint32_t>(f0.size * 4, 256)))
    b.rect_blob = Blob(kResolveRect, f0.address << 2, std::min<uint32_t>(f0.size * 4, 256));
  if (b.status == 1) s.f.copy_fail++;
  if (b.status == 0) {
    const uint32_t xs = (ri.copy_dest_extent_length && PhysOk(ri.copy_dest_extent_start, ri.copy_dest_extent_length)) ? 1 : 0;
    if (ri.copy_dest_extent_length) {
      b.flags |= kCFCopies;
      uint32_t base, row, rows, pitch;
      ri.GetCopyEdramTileSpan(base, row, rows, pitch);
      if (!s.edram.AllKnown({base, pitch, 0, row, 0, rows})) b.flags |= kCFSrcUnknown;
      const auto& dc = ri.copy_dest_coordinate_info;
      if (dc.offset_x_div_8 == 0 && dc.offset_y_div_8 == 0 && ri.coordinate_info.width_div_8 * 8u >= dc.pitch_aligned_div_32 * 32u &&
          ri.height_div_8 * 8u >= dc.height_aligned_div_32 * 32u)
        b.flags |= kCFFullOverwrite;
      b.dest_hash_at_copy = xs ? HashCopyDest(ri.copy_dest_extent_start, ri.copy_dest_extent_length) : 0;
      if (b.flags & kCFSrcUnknown) s.f.e.copies_src_unknown++;
    }
    // Primero se lee (arriba), después el clear: solo tiles cubiertos por completo quedan determinados.
    auto clear = [&](du::ResolveEdramInfo ei) {
      const uint32_t xsl = (ei.msaa_samples >= xenos::MsaaSamples::k4X ? 1 : 0) + ei.format_is_64bpp, ysl = ei.msaa_samples >= xenos::MsaaSamples::k2X ? 1 : 0;
      s.edram.Mark(SamplesToTiles(ei.base_tiles, ei.pitch_tiles, ri.coordinate_info.edram_offset_x_div_8 * 8, ri.coordinate_info.edram_offset_y_div_8 * 8,
                                  ri.coordinate_info.width_div_8 * 8, ri.height_div_8 * 8, xsl, ysl, true));
    };
    if (ri.IsClearingDepth()) { b.flags |= kCFClearDepth; clear(ri.depth_edram_info); }
    if (ri.IsClearingColor()) { b.flags |= kCFClearColor; clear(ri.color_edram_info); }
  }
  if (!BeginEvent(*c.regs)) return;
  Writer::Part parts[] = {P(b)};
  if (!EmitEvent(kCopy, parts, 1)) return;
  if (b.flags & kCFCopies) {
    // Superficie escrita desde el origen (solo con offset de destino 0).
    const auto& dc = ri.copy_dest_coordinate_info;
    Surface w;
    if (dc.offset_x_div_8 == 0 && dc.offset_y_div_8 == 0)
      w = {true, ri.copy_dest_base, dc.pitch_aligned_div_32 * 32u, ri.coordinate_info.width_div_8 * 8u, ri.height_div_8 * 8u,
           BytesPerPixel(uint32_t(ri.copy_dest_info.copy_dest_format))};
    if (!w.bpp) w.valid = false;
    s.copies.push_back({{ri.copy_dest_extent_start, uint64_t(ri.copy_dest_extent_start) + ri.copy_dest_extent_length},
                        (b.flags & kCFFullOverwrite) != 0, (b.flags & kCFSrcUnknown) != 0, s.seq, b.dest_hash_at_copy, w});
  }
  s.copy_index++; s.f.e.copies++;
}

void OnDrawEnd(const Ctx& c, int end) {
  const bool had = s.packet_event;
  s.packet_event = false;
  if (!s.capturing || had || end == 0) return;
  Timer t;
  // 1 kBadPacket -> 3, 2 kNotIssued -> 1, 3 kVizKilled -> 2. No modifica el framebuffer.
  const uint32_t status = end == 1 ? kBadPacket : end == 2 ? kNotIssued : kVizKilled;
  reg::VGT_DRAW_INITIATOR vdi; vdi.value = c.regs->values[XE_GPU_REG_VGT_DRAW_INITIATOR];
  RecordDraw(c, status, vdi.value, uint32_t(vdi.prim_type), vdi.num_indices, IndexDesc{}, false);
}

void OnSwap(const Ctx& c, uint32_t frontbuffer, uint32_t width, uint32_t height) {
  const uint32_t n = g1::counters.swaps.load();
  if (s.done) return;
  if (!s.capturing) {
    const uint32_t d = g1::counters.draws.load(), cp = g1::counters.copies.load();
    s.prof_draws[s.prof_n % 120] = d - s.prof_d0; s.prof_copies[s.prof_n % 120] = cp - s.prof_c0; s.prof_n++;
    s.prof_d0 = d; s.prof_c0 = cp;
    if ((cfg.kind == 1 && NowUs() / 1000 >= cfg.value) || (cfg.kind == 2 && n >= cfg.value && LiveDue())) { Timer t; StartCapture(*c.regs, n); }
    return;
  }
  Timer t;
  if (!BeginEvent(*c.regs)) return;
  // Búfer mostrado: superficie 32 bpp tiled con pitch = ancho alineado a 32 (supuesto del contrato §6.1).
  const uint32_t fb_pitch = (width + 31) & ~31u;
  const Surface fb{true, frontbuffer & 0x1FFFFFFFu, fb_pitch, width, height, 4};
  const uint32_t fb_dep = (width && height) ? Dep(frontbuffer & 0x1FFFFFFFu, fb_pitch * ((height + 31) & ~31u) * 4, &fb).cls : uint32_t(kDepUnknownOverflow);
  s.f.fb_dep = fb_dep;
  SwapBody b{n, frontbuffer, width, height, NowUs(), fb_dep, 0};
  Writer::Part parts[] = {P(b)};
  if (!EmitEvent(kSwap, parts, 1)) return;
  EndFrame();
  if (!Live()) return;
  if (s.frame_no >= cfg.frames) {
    Finish("completa");
    if (cfg.live && !s.done && LiveDue()) StartCapture(*c.regs, n);  // R5L: el cuadro siguiente arranca en este mismo SWAP
    return;
  }
  BeginFrame(*c.regs, n);
}

void Report() {
  if (!cfg.on) return;
  std::fprintf(stderr, "[r5frame] {\"capturing\":%s,\"done\":%s,\"frames\":%u,\"bytes\":%llu,\"hist\":%zu,\"histOverflow\":%d}\n",
               s.capturing ? "true" : "false", s.done ? "true" : "false", s.frame_no, (unsigned long long)s.w.total(), s.hist.m.size(), int(s.hist.overflow));
}
}  // namespace r5frame
