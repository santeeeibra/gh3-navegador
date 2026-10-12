// R5snap: productor diagnóstico de snapshots (ver r5_snapshot.h y CONTRATO-SNAPSHOT-V1.md).
// Un productor (IssueDraw) y un consumidor (JS del mismo hilo). Dos slots propios de hasta 4 MiB.
// Gate reserva un slot ANTES de consumir el paquete; IssueDraw lo llena; cualquier salida del
// paquete sin llenar lo cancela (OnDrawEnd). Error = terminal, visible en el siguiente Gate.
#include "r5_snapshot.h"
#include <algorithm>
#include <atomic>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#define XXH_INLINE_ALL
#include <xxhash.h>
#include <rex/graphics/pipeline/shader/shader.h>
#include <rex/graphics/pipeline/texture/info.h>
#include <rex/graphics/register_file.h>
#include <rex/graphics/xenos.h>
#include "g1_null_gpu.h"
#include "rex_wasm_seg.h"
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

namespace r5snap {
namespace {
using Status = CommandProcessor::BackendStatus;
namespace xenos = rex::graphics::xenos;

constexpr uint32_t kMagic = 0x31533552u, kSlots = 2, kSlotMax = 4u << 20, kAlign = 256;
constexpr uint32_t kRegsDwords = uint32_t(RegisterFile::kRegisterCount);
enum SlotState : int { kFree = 0, kReserved = 1, kFull = 2 };
enum Reason : uint32_t { kTooLarge = 1, kRange = 2, kPrepare = 3, kFetchType = 4, kSlotRange = 5 };
enum FailCode : uint32_t { kBadRelease = 6, kJsReject = 7, kJsThrow = 8, kNoReserve = 9, kCheck = 10 };

// state es atómico solo para que Report() (otro hilo) lo lea; lo escribe únicamente el hilo del CP.
struct Slot { uint8_t* p = nullptr; std::atomic<int> state{kFree}; uint64_t seq = 0; };

struct Stats {
  std::atomic<uint64_t> selected{0}, filled_ok{0}, filled_unsupported{0}, released{0}, auto_released{0},
      delivered{0}, gate_pending{0}, inv_checks{0}, inv_fail{0}, src_changed{0}, bad_release{0}, bytes{0}, max_used{0};
  std::atomic<uint64_t> cancelled[5]{};  // bad, notissued, viz, copy, shutdown
  std::atomic<uint64_t> reasons[6]{};
  std::atomic<uint64_t> draw_packets{0}, draws_issued{0}, copies{0}, swaps{0}, event_seq{0}, skipped{0};
  std::atomic<uint32_t> error{0}, error_count{0};
};
Stats st;
CommandProcessor* g_cp = nullptr;
const RegisterFile* g_regs = nullptr;
Slot g_slots[kSlots];
std::atomic<int> g_reserved{-1};
bool g_filled_packet = false, g_waiting = false, g_init = false;
uint32_t g_max = kSlotMax, g_skipped_pending = 0;
bool g_any = false;
uint64_t g_sel_vs = 0x57F6448DAC5BEB74ull, g_sel_ps = 0xAB008EF1D1A8CB6Dull;
std::vector<uint32_t> g_vf = {95}, g_tf = {0, 2, 1, 3};
uint32_t g_logged = 0;

bool EnvIs(const char* n, const char* v) { const char* e = std::getenv(n); return e && std::strcmp(e, v) == 0; }
uint32_t AlignUp(uint32_t v) { return (v + kAlign - 1) & ~(kAlign - 1); }
bool PhysOk(uint32_t phys, uint32_t len) { return uint64_t(phys & 0x1FFFFFFFu) + len <= 0x20000000ull; }

void Wake() {
  if (g_waiting && g_cp) { g_waiting = false; g_cp->CpAsyncBackendReady(); }
}
void Fail(uint32_t code, const char* why) {
  st.error_count++;
  uint32_t z = 0;
  if (st.error.compare_exchange_strong(z, code))
    std::fprintf(stderr, "[r5snap] ERROR TERMINAL code=%u (%s); el CP lo ve en el siguiente Gate\n", code, why);
  if (g_cp) { g_waiting = false; g_cp->CpAsyncBackendReady(); }
}
void Cancel(int kind) {
  g_slots[g_reserved.load()].state = kFree;
  g_reserved = -1;
  st.cancelled[kind]++;
  Wake();
}
bool ParseList(const char* s, std::vector<uint32_t>* out) {
  out->clear();
  while (*s) { char* e; out->push_back(uint32_t(std::strtoul(s, &e, 10))); if (e == s) return false; s = *e == ',' ? e + 1 : e; }
  return true;
}
void ParseSelect() {
  const char* e = std::getenv("G1_R5SNAP_SELECT");
  if (!e || !*e || std::strcmp(e, "first") == 0) return;
  if (std::strcmp(e, "any") == 0) { g_any = true; g_vf.clear(); g_tf.clear(); return; }
  // "vs:ps:v95:t0,2,1,3" (hash hex, listas decimales)
  char vs[32] = {}, ps[32] = {}, vf[64] = {}, tf[64] = {};
  if (std::sscanf(e, "%31[^:]:%31[^:]:v%63[^:]:t%63s", vs, ps, vf, tf) == 4) {
    g_sel_vs = std::strtoull(vs, nullptr, 16); g_sel_ps = std::strtoull(ps, nullptr, 16);
    ParseList(vf, &g_vf); ParseList(tf, &g_tf);
  } else {
    std::fprintf(stderr, "[r5snap] G1_R5SNAP_SELECT inválido '%s'; se usa first\n", e);
  }
}
bool Selected(Shader* vs, Shader* ps) {
  if (g_any) return true;
  return vs && ps && vs->ucode_data_hash() == g_sel_vs && ps->ucode_data_hash() == g_sel_ps;
}
uint64_t CopyRes(uint8_t* base, uint32_t off, uint32_t phys, uint32_t len) {
  if (!len) return 0;
  const uint8_t* src = rexwasm::HostPhysical(phys);
  std::memcpy(base + off, src, len);
  uint64_t h = XXH3_64bits(base + off, len);
  if (XXH3_64bits(src, len) != h) st.src_changed++;  // la fuente cambió durante/tras la copia
  return h;
}
}  // namespace

#ifdef __EMSCRIPTEN__
EM_JS_DEPS(r5snap_deps, "$UTF8ToString");
// Llama al consumidor registrado. 0 = ausente, 1 = entregado, -1 = excepción síncrona.
// Un rechazo de Promise llega después por _r5snap_fail(7).
EM_JS(int, r5snap_js_deliver, (uint32_t ptr, uint32_t used, uint32_t slot, uint32_t lo, uint32_t hi), {
  const c = globalThis.__r5snapConsumer;
  if (typeof c !== 'function') return 0;
  // EM_JS entrega uint32_t como entero con signo: los slots están arriba de 2 GiB -> normalizar.
  ptr >>>= 0; used >>>= 0; slot >>>= 0; lo >>>= 0; hi >>>= 0;
  try {
    const r = c(ptr, used, slot, lo, hi);
    if (r && typeof r.then === 'function')
      r.then(undefined, (e) => { err('[r5snap] consumidor rechazó: ' + e); _r5snap_fail(7); });
    return 1;
  } catch (e) {
    err('[r5snap] consumidor lanzó: ' + e);
    return -1;
  }
});
// API para consumidores y consumidores de PRUEBA (G1_R5SNAP_TEST). mode: 0 ninguno, 1 check,
// 2 hold:<ms>, 3 throw, 4 reject, 5 holdbad:<ms> (control negativo).
EM_JS(void, r5snap_js_init, (int mode, int ms, const char* consumer_c), {
  const api = {
    memory: () => new Uint8Array(wasmMemory.buffer),
    release: (slot, lo, hi) => _r5snap_release(slot, lo, hi),
    fail: (code) => _r5snap_fail(code),
  };
  globalThis.__r5snapApi = api;
  // G1_R5SNAP_CONSUMER / ?r5consumer=: script externo que define globalThis.__r5snapConsumer en ESTE
  // hilo (el del CP). Edge: importScripts (relativo a d4/). Node: require (ruta absoluta o relativa al cwd).
  const consumer = consumer_c ? UTF8ToString(consumer_c) : '';
  if (consumer && mode === 0) {
    try {
      if (typeof importScripts === 'function') importScripts(consumer);
      else require(require('path').resolve(consumer));
      err('[r5snap] consumidor cargado: ' + consumer + ' -> ' + typeof globalThis.__r5snapConsumer);
    } catch (e) { err('[r5snap] no se pudo cargar el consumidor ' + consumer + ': ' + e); api.fail(12); }
  }
  if (mode === 0) return;
  const checkHeader = (ptr, used, slot, lo, hi) => {
    if (ptr < 0 || ptr + used > wasmMemory.buffer.byteLength) { err('[r5snap] check: puntero fuera de rango'); api.fail(10); return false; }
    const dv = new DataView(wasmMemory.buffer, ptr, 192);
    const ok = dv.getUint32(0, true) === 0x31533552 && dv.getUint16(4, true) === 1 &&
      dv.getUint16(6, true) === 192 && dv.getUint32(8, true) === used && dv.getUint32(20, true) === slot &&
      dv.getUint32(24, true) === (lo >>> 0) && dv.getUint32(28, true) === (hi >>> 0);
    if (!ok) { err('[r5snap] check: cabecera inválida'); api.fail(10); }
    return ok;
  };
  if (mode === 1) globalThis.__r5snapConsumer = (p, u, s, lo, hi) => { if (checkHeader(p, u, s, lo, hi)) api.release(s, lo, hi); };
  // hold: copia el slot al recibirlo y, justo antes de liberar (más tarde), comprueba que los bytes
  // del slot sigan idénticos: el productor no debe tocar un slot lleno hasta su release.
  // holdbad (mode 5): control negativo, cambia 1 byte del slot tras copiarlo; debe terminar en fail(11).
  if (mode === 2 || mode === 5) globalThis.__r5snapConsumer = (p, u, s, lo, hi) => {
    if (!checkHeader(p, u, s, lo, hi)) return;
    const copy = new Uint8Array(wasmMemory.buffer, p, u).slice();
    if (mode === 5) new Uint8Array(wasmMemory.buffer, p, u)[u - 1] ^= 0xFF;
    setTimeout(() => {
      const now = new Uint8Array(wasmMemory.buffer, p, u);
      let same = now.length === copy.length;
      for (let i = 0; same && i < copy.length; i++) if (now[i] !== copy[i]) same = false;
      globalThis.__r5snapHoldChecked = (globalThis.__r5snapHoldChecked | 0) + 1;
      if (!same) { err('[r5snap] hold: el slot cambió antes del release'); api.fail(11); return; }
      api.release(s, lo, hi);
    }, ms);
  };
  if (mode === 3) globalThis.__r5snapConsumer = () => { throw new Error('prueba throw'); };
  if (mode === 4) globalThis.__r5snapConsumer = () => Promise.reject(new Error('prueba reject'));
});
#endif

extern "C" EMSCRIPTEN_KEEPALIVE void r5snap_fail(uint32_t code) { Fail(code, "consumidor JS"); }
extern "C" EMSCRIPTEN_KEEPALIVE int r5snap_release(uint32_t slot, uint32_t lo, uint32_t hi) {
  const uint64_t seq = (uint64_t(hi) << 32) | lo;
  if (slot >= kSlots || g_slots[slot].state != kFull || g_slots[slot].seq != seq) {
    st.bad_release++;
    Fail(kBadRelease, "release con slot/secuencia que no corresponde");
    return 0;
  }
  g_slots[slot].state = kFree;
  st.released++;
  Wake();
  return 1;
}

bool Requested() { static bool v = EnvIs("G1_R5SNAP", "1"); return v; }
bool Enabled() {
  static bool v = [] {
    if (!Requested()) return false;
    if (!g1::CpAsync()) {
      std::fprintf(stderr, "[r5snap] AVISO: G1_R5SNAP=1 exige G1_CP_ASYNC=1 (?cpasync=1); snapshot APAGADO\n");
      return false;
    }
    return true;
  }();
  return v;
}

uint64_t HashUcode(int type, const uint32_t* guest_be, uint32_t dwords) {
  const uint64_t h = XXH3_64bits(guest_be, size_t(dwords) * 4);
  std::fprintf(stderr, "[r5snap] shader {\"type\":\"%s\",\"hash\":\"%016llX\",\"dwords\":%u,\"draws\":%llu}\n", type == 0 ? "vs" : "ps",
               (unsigned long long)h, dwords, (unsigned long long)st.draw_packets.load());
  return h;
}

void Init(CommandProcessor* cp, const RegisterFile* regs) {
  if (!Enabled() || g_init) return;
  g_cp = cp; g_regs = regs;
  ParseSelect();
  if (const char* e = std::getenv("G1_R5SNAP_MAX")) {
    uint32_t m = uint32_t(std::strtoul(e, nullptr, 10));
    if (m) g_max = std::max<uint32_t>(sizeof(HeaderV1), std::min(m, kSlotMax));
  }
  for (auto& s : g_slots) {
    s.p = static_cast<uint8_t*>(std::aligned_alloc(kAlign, kSlotMax));
    if (!s.p) { Fail(kNoReserve, "sin memoria para slots"); return; }
    std::memset(s.p, 0, kSlotMax);
  }
  int mode = 0, ms = 0;
  if (const char* t = std::getenv("G1_R5SNAP_TEST")) {
    if (!std::strcmp(t, "check")) mode = 1;
    else if (std::sscanf(t, "hold:%d", &ms) == 1) mode = 2;
    else if (std::sscanf(t, "holdbad:%d", &ms) == 1) mode = 5;
    else if (!std::strcmp(t, "throw")) mode = 3;
    else if (!std::strcmp(t, "reject")) mode = 4;
  }
#ifdef __EMSCRIPTEN__
  const char* consumer = std::getenv("G1_R5SNAP_CONSUMER");
  r5snap_js_init(mode, ms, consumer && *consumer ? consumer : nullptr);
#endif
  g_init = true;
  std::string vf, tf;
  for (auto v : g_vf) vf += (vf.empty() ? "" : ",") + std::to_string(v);
  for (auto v : g_tf) tf += (tf.empty() ? "" : ",") + std::to_string(v);
  std::fprintf(stderr, "[r5snap] {\"on\":true,\"select\":\"%s\",\"vs\":\"%016llX\",\"ps\":\"%016llX\",\"vfetch\":[%s],\"tfetch\":[%s],\"maxBytes\":%u,\"test\":\"%s\",\"slots\":[%u,%u]}\n",
               g_any ? "any" : "hash", (unsigned long long)g_sel_vs, (unsigned long long)g_sel_ps, vf.c_str(), tf.c_str(), g_max,
               std::getenv("G1_R5SNAP_TEST") ? std::getenv("G1_R5SNAP_TEST") : "", uint32_t(uintptr_t(g_slots[0].p)), uint32_t(uintptr_t(g_slots[1].p)));
}

Status Gate(uint32_t opcode, Shader* vs, Shader* ps) {
  const bool draw = opcode == 0x22 || opcode == 0x36;  // PM4_DRAW_INDX, PM4_DRAW_INDX_2
  if (st.error.load() && (draw || opcode == 0x64)) return Status::kError;
  if (!g_init) return Status::kDone;
  if (!draw || g_reserved >= 0 || !Selected(vs, ps)) return Status::kDone;
  for (uint32_t i = 0; i < kSlots; ++i) {
    if (g_slots[i].state == kFree) {
      g_slots[i].state = kReserved;
      g_reserved = int(i);
      st.selected++;
      return Status::kDone;
    }
  }
  g_waiting = true;
  st.gate_pending++;
  return Status::kPending;
}

void OnDraw(uint32_t initiator, uint32_t prim_type, uint32_t index_count, const IndexDesc& ib,
            bool major_mode_explicit, Shader* vs, Shader* ps) {
  if (!g_init) return;
  const uint64_t seq = st.event_seq++;
  st.draws_issued++;
  if (g_reserved < 0) return;
  const uint32_t si = uint32_t(g_reserved);
  Slot& slot = g_slots[si];
  uint8_t* base = slot.p;
  g_reserved = -1;
  g_filled_packet = true;
  slot.state = kFull;
  slot.seq = seq;

  HeaderV1 h{};
  h.magic = kMagic; h.version = 1; h.header_bytes = sizeof(HeaderV1);
  h.slot_index = si; h.event_seq = seq; h.draw_index = uint32_t(st.draw_packets.load());
  h.swap_index = uint32_t(st.swaps.load()); h.skipped_since_prev = g_skipped_pending;
  g_skipped_pending = 0;
  h.vgt_draw_initiator = initiator; h.prim_type = prim_type; h.index_count = index_count;
  h.major_mode_explicit = major_mode_explicit; h.index_source = ib.dma; h.index_format = ib.format;
  h.index_endian = ib.endian; h.index_phys = ib.phys;
  h.vs_hash = vs ? vs->ucode_data_hash() : 0; h.ps_hash = ps ? ps->ucode_data_hash() : 0;

  // 1) Validar y medir (sin copiar).
  uint32_t reason = 0;
  std::vector<VFetchV1> vfe(g_vf.size());
  std::vector<TFetchV1> tfe(g_tf.size());
  std::vector<rex::graphics::TextureInfo> tinfo(g_tf.size());
  for (size_t i = 0; i < g_vf.size() && !reason; ++i) {
    if (g_vf[i] >= 96) { reason = kSlotRange; break; }
    auto f = g_regs->GetVertexFetch(g_vf[i]);
    VFetchV1& e = vfe[i];
    e.fetch_slot = g_vf[i]; e.raw0 = f.dword_0; e.raw1 = f.dword_1; e.endian = uint32_t(f.endian);
    e.phys = f.address << 2; e.bytes = f.size * 4;
    if (f.type != xenos::FetchConstantType::kVertex) reason = kFetchType;
    else if (!PhysOk(e.phys, e.bytes)) reason = kRange;
  }
  for (size_t i = 0; i < g_tf.size() && !reason; ++i) {
    if (g_tf[i] >= 32) { reason = kSlotRange; break; }
    auto f = g_regs->GetTextureFetch(g_tf[i]);
    TFetchV1& e = tfe[i];
    e.fetch_slot = g_tf[i];
    std::memcpy(e.raw, &f, sizeof(e.raw));
    if (f.type != xenos::FetchConstantType::kTexture) { reason = kFetchType; break; }
    auto& ti = tinfo[i];
    if (!rex::graphics::TextureInfo::Prepare(f, &ti)) { reason = kPrepare; break; }
    e.format = uint32_t(ti.format); e.endian = uint32_t(ti.endianness); e.dimension = uint32_t(ti.dimension);
    e.width = ti.width; e.height = ti.height; e.depth = ti.depth; e.pitch = ti.pitch; e.tiled = ti.is_tiled;
    e.mip_min = ti.mip_min_level; e.mip_max = ti.mip_max_level; e.packed_mips = ti.has_packed_mips;
    e.base_phys = ti.memory.base_address; e.base_bytes = ti.memory.base_size;
    if (ti.memory.mip_address && ti.memory.mip_size) { e.mip_phys = ti.memory.mip_address; e.mip_bytes = ti.memory.mip_size; }
    if (!PhysOk(e.base_phys, e.base_bytes) || !PhysOk(e.mip_phys, e.mip_bytes)) reason = kRange;
  }
  if (!reason && ib.dma && !PhysOk(ib.phys, ib.bytes)) reason = kRange;
  const uint32_t vsd = vs ? uint32_t(vs->ucode_data().size()) : 0, psd = ps ? uint32_t(ps->ucode_data().size()) : 0;
  uint32_t off = AlignUp(sizeof(HeaderV1));
  const uint32_t vf_off = off; off = AlignUp(off + uint32_t(vfe.size() * sizeof(VFetchV1)));
  const uint32_t tf_off = off; off = AlignUp(off + uint32_t(tfe.size() * sizeof(TFetchV1)));
  const uint32_t regs_off = off; off = AlignUp(off + kRegsDwords * 4);
  const uint32_t vs_off = off; off = AlignUp(off + vsd * 4);
  const uint32_t ps_off = off; off = AlignUp(off + psd * 4);
  const uint32_t ib_off = ib.dma ? off : 0; if (ib.dma) off = AlignUp(off + ib.bytes);
  uint64_t total = off;
  for (auto& e : vfe) { e.data_offset = uint32_t(total); total = AlignUp(uint32_t(std::min<uint64_t>(total + e.bytes, 0xFFFFFF00ull))); }
  for (auto& e : tfe) {
    e.base_offset = uint32_t(total); total = AlignUp(uint32_t(std::min<uint64_t>(total + e.base_bytes, 0xFFFFFF00ull)));
    if (e.mip_bytes) { e.mip_offset = uint32_t(total); total = AlignUp(uint32_t(std::min<uint64_t>(total + e.mip_bytes, 0xFFFFFF00ull))); }
  }
  if (!reason && total > g_max) reason = kTooLarge;

  if (reason) {
    // Solo cabecera: offsets/conteos/bytes de índice en 0 (aclaración Codex 2).
    h.status = 1; h.reason = reason; h.used_bytes = sizeof(HeaderV1);
    std::memcpy(base, &h, sizeof h);
    st.filled_unsupported++; st.reasons[reason]++;
    if (g_logged < 16) { g_logged++; std::fprintf(stderr, "[r5snap] unsupported seq=%llu reason=%u total=%llu max=%u\n", (unsigned long long)seq, reason, (unsigned long long)total, g_max); }
  } else {
    // 2) Copiar (bytes crudos BE) y completar la cabecera.
    h.vfetch_count = uint32_t(vfe.size()); h.vfetch_table_offset = vfe.empty() ? 0 : vf_off;
    h.tfetch_count = uint32_t(tfe.size()); h.tfetch_table_offset = tfe.empty() ? 0 : tf_off;
    h.regs_offset = regs_off; h.regs_dwords = kRegsDwords;
    std::memcpy(base + regs_off, g_regs->values, size_t(kRegsDwords) * 4);
    if (vsd) { h.vs_ucode_offset = vs_off; h.vs_ucode_dwords = vsd; std::memcpy(base + vs_off, vs->ucode_data().data(), vsd * 4); }
    if (psd) { h.ps_ucode_offset = ps_off; h.ps_ucode_dwords = psd; std::memcpy(base + ps_off, ps->ucode_data().data(), psd * 4); }
    if (ib.dma) { h.index_bytes = ib.bytes; h.index_offset = ib.bytes ? ib_off : 0; h.index_hash = CopyRes(base, ib_off, ib.phys, ib.bytes); }
    for (auto& e : vfe) e.data_hash = CopyRes(base, e.data_offset, e.phys, e.bytes);
    for (auto& e : tfe) { e.base_hash = CopyRes(base, e.base_offset, e.base_phys, e.base_bytes); e.mip_hash = CopyRes(base, e.mip_offset, e.mip_phys, e.mip_bytes); }
    if (!vfe.empty()) std::memcpy(base + vf_off, vfe.data(), vfe.size() * sizeof(VFetchV1));
    if (!tfe.empty()) std::memcpy(base + tf_off, tfe.data(), tfe.size() * sizeof(TFetchV1));
    h.used_bytes = uint32_t(total);
    std::memcpy(base, &h, sizeof h);
    st.filled_ok++; st.bytes += total;
    uint64_t m = st.max_used.load(); if (total > m) st.max_used = total;
    if (g_logged < 8) {
      g_logged++;
      std::string t;
      for (auto& e : tfe) {
        char b[256];
        std::snprintf(b, sizeof b, "%s{\"slot\":%u,\"fmt\":%u,\"endian\":%u,\"w\":%u,\"h\":%u,\"pitch\":%u,\"tiled\":%u,\"mips\":[%u,%u],\"base\":\"%08X\",\"baseBytes\":%u,\"mipBytes\":%u,\"hash\":\"%016llX\"}",
                      t.empty() ? "" : ",", e.fetch_slot, e.format, e.endian, e.width, e.height, e.pitch, e.tiled, e.mip_min, e.mip_max, e.base_phys, e.base_bytes, e.mip_bytes, (unsigned long long)e.base_hash);
        t += b;
      }
      std::string v;
      for (auto& e : vfe) { char b[160]; std::snprintf(b, sizeof b, "%s{\"slot\":%u,\"endian\":%u,\"phys\":\"%08X\",\"bytes\":%u,\"hash\":\"%016llX\"}", v.empty() ? "" : ",", e.fetch_slot, e.endian, e.phys, e.bytes, (unsigned long long)e.data_hash); v += b; }
      std::fprintf(stderr, "[r5snap] snap {\"seq\":%llu,\"slot\":%u,\"draw\":%u,\"swap\":%u,\"skipped\":%u,\"prim\":%u,\"count\":%u,\"idx\":[%u,%u],\"used\":%u,\"vs\":\"%016llX\",\"ps\":\"%016llX\",\"vsDw\":%u,\"psDw\":%u,\"vf\":[%s],\"tf\":[%s]}\n",
                   (unsigned long long)seq, si, h.draw_index, h.swap_index, h.skipped_since_prev, prim_type, index_count, h.index_source, h.index_bytes, h.used_bytes,
                   (unsigned long long)h.vs_hash, (unsigned long long)h.ps_hash, vsd, psd, v.c_str(), t.c_str());
    }
  }
  // 3) Entregar. Ausente -> liberación diagnóstica; excepción -> error terminal (sin liberar).
  int rc = 0;
#ifdef __EMSCRIPTEN__
  rc = r5snap_js_deliver(uint32_t(uintptr_t(base)), h.used_bytes, si, uint32_t(seq), uint32_t(seq >> 32));
#endif
  if (rc == 0) { slot.state = kFree; st.auto_released++; st.released++; }
  else if (rc > 0) st.delivered++;
  else Fail(kJsThrow, "el consumidor lanzó una excepción");
}

void OnCopy() {
  if (!g_init) return;
  st.event_seq++; st.copies++;
  if (g_reserved >= 0) Cancel(3);
}
void OnSwap() {
  if (!g_init) return;
  st.event_seq++; st.swaps++;
}
void OnDrawEnd(int end) {
  if (!g_init) return;
  if (g_reserved >= 0) {
    // 0 kIssued (no debería quedar reserva), 1 kBadPacket, 2 kNotIssued, 3 kVizKilled
    if (end == 0) Fail(kNoReserve, "reserva sin usar después de IssueDraw");
    Cancel(end == 1 ? 0 : end == 2 ? 1 : 2);
  }
  if (!g_filled_packet) { g_skipped_pending++; st.skipped++; }
  g_filled_packet = false;
  st.draw_packets++;
  // Cierre de cuentas en el hilo del CP, en un punto estable (fin de paquete, sin reserva viva).
  uint64_t full = 0;
  for (auto& sl : g_slots) full += sl.state.load() == kFull;
  const uint64_t canc = st.cancelled[0] + st.cancelled[1] + st.cancelled[2] + st.cancelled[3];
  const uint64_t filled = st.filled_ok.load() + st.filled_unsupported.load();
  st.inv_checks++;
  if (g_reserved.load() >= 0 || st.selected.load() != filled + canc || filled != st.released.load() + full) {
    if (st.inv_fail++ < 4) std::fprintf(stderr, "[r5snap] INVARIANTE ROTO en draw %llu\n", (unsigned long long)st.draw_packets.load());
  }
}

void Report() {
  if (!Requested()) return;
  // Solo lectura (Report corre en otro hilo, cada segundo): una reserva viva se informa, no se cancela.
  const uint64_t reserved_now = g_init && g_reserved.load() >= 0 ? 1 : 0;
  uint64_t in_queue = 0;
  for (auto& s : g_slots) in_queue += s.state == kFull;
  auto u = [](const std::atomic<uint64_t>& x) { return (unsigned long long)x.load(); };
  const uint64_t canc = st.cancelled[0] + st.cancelled[1] + st.cancelled[2] + st.cancelled[3] + st.cancelled[4];
  const bool inv1 = st.selected.load() == st.filled_ok.load() + st.filled_unsupported.load() + canc + reserved_now;
  const bool inv2 = st.filled_ok.load() + st.filled_unsupported.load() == st.released.load() + in_queue;
  std::fprintf(stderr, "[r5snap] {\"on\":%s,\"selected\":%llu,\"filledOk\":%llu,\"filledUnsupported\":%llu,\"reasons\":[%llu,%llu,%llu,%llu,%llu],\"cancelled_bad_notissued_viz_copy_shutdown\":[%llu,%llu,%llu,%llu,%llu],\"released\":%llu,\"autoReleased\":%llu,\"delivered\":%llu,\"inQueue\":%llu,\"reservedNow\":%llu,\"gatePending\":%llu,\"srcChanged\":%llu,\"badRelease\":%llu,\"error\":%u,\"errorCount\":%u,\"drawPackets\":%llu,\"drawsIssued\":%llu,\"copies\":%llu,\"swaps\":%llu,\"eventSeq\":%llu,\"skipped\":%llu,\"bytes\":%llu,\"maxUsed\":%llu,\"invChecksCp\":%llu,\"invFailCp\":%llu,\"invSelected\":%s,\"invReleased\":%s}\n",
               g_init ? "true" : "false", u(st.selected), u(st.filled_ok), u(st.filled_unsupported), u(st.reasons[1]), u(st.reasons[2]), u(st.reasons[3]), u(st.reasons[4]), u(st.reasons[5]),
               u(st.cancelled[0]), u(st.cancelled[1]), u(st.cancelled[2]), u(st.cancelled[3]), u(st.cancelled[4]), u(st.released), u(st.auto_released), u(st.delivered),
               (unsigned long long)in_queue, (unsigned long long)reserved_now, u(st.gate_pending), u(st.src_changed), u(st.bad_release), st.error.load(), st.error_count.load(),
               u(st.draw_packets), u(st.draws_issued), u(st.copies), u(st.swaps), u(st.event_seq), u(st.skipped), u(st.bytes), u(st.max_used), u(st.inv_checks), u(st.inv_fail),
               inv1 ? "true" : "false", inv2 ? "true" : "false");
}

}  // namespace r5snap
