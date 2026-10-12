// Manifiesto por canción, paso 2 (ver m2_manifest.h). Apagado por defecto (G1_M2=1).
// OnDraw/OnSwap corren en el hilo del CP; OnRead en el hilo que lee (solo imprime).
#include "m2_manifest.h"
#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <set>
#include <string>
#include <tuple>
#include <rex/graphics/pipeline/shader/shader.h>
#include <rex/graphics/pipeline/texture/info.h>
#include <rex/graphics/pipeline/texture/util.h>
#include <rex/graphics/register_file.h>
#include <rex/graphics/registers.h>
#include <rex/graphics/xenos.h>
#include <rex/string/buffer.h>
#include "g1_null_gpu.h"
#include "rex_wasm_seg.h"

namespace m2 {
namespace {
using namespace rex::graphics;

constexpr uint32_t kSongClock = 0x829B57B0;  // float BE, ms (RESULTADO-CANCION-HIBRIDA)

uint32_t EnvU32(const char* n, uint32_t d) { const char* e = std::getenv(n); return e && *e ? uint32_t(std::strtoul(e, nullptr, 10)) : d; }

// Mismo cálculo de tamaño que r5_frame.cpp (GuestBaseExtent): base y cadena de mips como las carga el texture cache.
void Extents(const xenos::xe_gpu_texture_fetch_t& f, uint32_t* base_bytes, uint32_t* mips_bytes) {
  uint32_t w1 = 0, h1 = 0, d1 = 0, base_page = 0, mip_page = 0, mip_max = 0;
  texture_util::GetSubresourcesFromFetchConstant(f, &w1, &h1, &d1, &base_page, &mip_page, nullptr, &mip_max);
  const auto layout = texture_util::GetGuestTextureLayout(f.dimension, f.pitch, w1 + 1, h1 + 1, d1 + 1, f.tiled,
                                                          GetBaseFormat(f.format), f.packed_mips, true, mip_max);
  *base_bytes = base_page ? layout.base.level_data_extent_bytes : 0;
  *mips_bytes = (mip_page && mip_max) ? layout.mips_total_extent_bytes : 0;
}

using TexKey = std::tuple<uint32_t, uint32_t, uint32_t, uint32_t, uint32_t, uint32_t, uint32_t, uint32_t>;
struct State {
  uint32_t win = 60, swaps = 0, draws = 0, unanalyzed = 0, bad_fetch = 0;
  std::map<std::pair<uint64_t, uint64_t>, uint32_t> pairs;  // ventana
  std::set<uint32_t> tex_win;                                // ventana
  std::map<TexKey, uint32_t> tex_ids;                        // global
  std::set<std::pair<uint32_t, uint64_t>> shaders;           // global (tipo, hash)
} s;

uint32_t TexId(const xenos::xe_gpu_texture_fetch_t& f) {
  TextureInfo ti;
  if (f.type != xenos::FetchConstantType::kTexture || !TextureInfo::Prepare(f, &ti)) { s.bad_fetch++; return 0; }
  const TexKey k{ti.memory.base_address, ti.memory.mip_address, uint32_t(ti.format), ti.width, ti.height,
                 ti.depth | (uint32_t(ti.dimension) << 16), ti.pitch | (uint32_t(ti.is_tiled) << 31),
                 ti.mip_max_level | (uint32_t(ti.has_packed_mips) << 8) | (uint32_t(ti.endianness) << 12)};
  auto it = s.tex_ids.find(k);
  if (it != s.tex_ids.end()) return it->second;
  const uint32_t id = uint32_t(s.tex_ids.size()) + 1;
  s.tex_ids.emplace(k, id);
  uint32_t bb = 0, mb = 0;
  Extents(f, &bb, &mb);
  std::fprintf(stderr, "[m2-tex] id=%u base=%08X mip=%08X fmt=%u dim=%u w=%u h=%u d=%u pitch=%u tiled=%u mips=%u..%u packed=%u endian=%u bytes=%u mipbytes=%u swap=%u\n",
               id, ti.memory.base_address, ti.memory.mip_address, uint32_t(ti.format), uint32_t(ti.dimension), ti.width + 1,
               ti.height + 1, ti.depth + 1, ti.pitch, uint32_t(ti.is_tiled), ti.mip_min_level, ti.mip_max_level,
               uint32_t(ti.has_packed_mips), uint32_t(ti.endianness), std::max(bb, ti.memory.base_size), mb, s.swaps);
  return id;
}

float SongClock() {
  const uint8_t* p = rexwasm::Host(kSongClock);
  uint32_t v = (uint32_t(p[0]) << 24) | (uint32_t(p[1]) << 16) | (uint32_t(p[2]) << 8) | p[3];
  float f; std::memcpy(&f, &v, 4); return f;
}
}  // namespace

bool Enabled() {
  static const bool on = [] { const char* e = std::getenv("G1_M2"); const bool v = e && std::strcmp(e, "1") == 0;
    if (v) { s.win = std::max(1u, EnvU32("G1_M2_WIN", 60)); std::fprintf(stderr, "[m2] on win=%u\n", s.win); } return v; }();
  return on;
}

void OnDraw(const RegisterFile& regs, Shader* vs, Shader* ps) {
  s.draws++;
  s.pairs[{vs ? vs->ucode_data_hash() : 0, ps ? ps->ucode_data_hash() : 0}]++;
  for (Shader* sh : {vs, ps}) {
    if (!sh) continue;
    if (!sh->is_ucode_analyzed()) { rex::string::StringBuffer sb; sh->AnalyzeUcode(sb); }
    if (!sh->is_ucode_analyzed()) { s.unanalyzed++; continue; }
    if (s.shaders.insert({sh->type() == xenos::ShaderType::kPixel ? 1u : 0u, sh->ucode_data_hash()}).second) {
      const char* stage = sh->type() == xenos::ShaderType::kPixel ? "frag" : "vert";
      std::fprintf(stderr, "[m2-shader] %s %016llX textures=%zu swap=%u\n", stage,
                   (unsigned long long)sh->ucode_data_hash(), sh->texture_bindings().size(), s.swaps);
      // Copia del ucode con el mismo contenido que Shader::DumpUcode del nativo (ucode_data() tal cual, en hex).
      std::string hex; hex.reserve(sh->ucode_data().size() * 8);
      for (uint32_t w : sh->ucode_data()) { char b[9]; std::snprintf(b, sizeof b, "%08X", w); hex += b; }
      std::fprintf(stderr, "[m2-ucode] %s %016llX dwords=%zu hex=%s\n", stage, (unsigned long long)sh->ucode_data_hash(),
                   sh->ucode_data().size(), hex.c_str());
    }
    for (auto& b : sh->texture_bindings()) {
      if (b.fetch_constant >= 32) { s.bad_fetch++; continue; }
      if (const uint32_t id = TexId(regs.GetTextureFetch(b.fetch_constant))) s.tex_win.insert(id);
    }
  }
}

void OnSwap() {
  if (++s.swaps % s.win) return;
  std::string line;
  char buf[64];
  for (auto& [k, n] : s.pairs) { std::snprintf(buf, sizeof buf, "%016llX/%016llX:%u;", (unsigned long long)k.first, (unsigned long long)k.second, n); line += buf; }
  std::string tex;
  for (uint32_t id : s.tex_win) { std::snprintf(buf, sizeof buf, "%u,", id); tex += buf; }
  std::fprintf(stderr, "[m2-win] swap=%u ms=%llu clock=%.1f draws=%u unanalyzed=%u badfetch=%u texTotal=%zu pairs=%s tex=%s\n", s.swaps,
               (unsigned long long)(std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - g1::counters.start).count()),
               SongClock(), s.draws, s.unanalyzed, s.bad_fetch, s.tex_ids.size(), line.c_str(), tex.c_str());
  s.pairs.clear(); s.tex_win.clear(); s.draws = 0;
}

void OnRead(const std::string& path, uint64_t offset, uint32_t requested, uint32_t got, uint32_t status) {
  std::fprintf(stderr, "[m2-read] path=%s off=%llu req=%u got=%u st=%08X\n", path.c_str(), (unsigned long long)offset, requested, got, status);
}
}  // namespace m2
