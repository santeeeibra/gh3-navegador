// R5F v1: clasificación de dependencias (memoria de resolves y EDRAM). Sin SDK: lo usan el productor
// y el generador de archivos mínimos/negativos. Reglas en CONTRATO-R5F-V1.md §6.
#pragma once
#include <algorithm>
#include <bitset>
#include <cstdint>
#include <functional>
#include <map>
#include <tuple>
#include <utility>
#include <vector>
#include "r5f_format.h"

namespace r5f {

struct Range { uint64_t s, e; };  // [s, e)
inline bool Overlap(Range a, Range b) { return a.s < b.e && b.s < a.e; }
// ¿[r] queda cubierto por la unión de rs?
inline bool Covered(Range r, std::vector<Range> rs) {
  std::sort(rs.begin(), rs.end(), [](Range a, Range b) { return a.s < b.s; });
  uint64_t at = r.s;
  for (auto& x : rs) { if (x.s > at) break; if (x.e > at) at = x.e; if (at >= r.e) return true; }
  return at >= r.e;
}

// Destinos de resolve vistos ANTES de la captura (clave: extent + dest_info). Desborda a 256.
struct ResolveHistory {
  std::map<std::tuple<uint32_t, uint32_t, uint32_t>, HistEntry> m;
  bool overflow = false;
  void Note(uint32_t start, uint32_t len, uint32_t base, uint32_t info, uint32_t swap) {
    if (!len) return;
    auto k = std::make_tuple(start, len, info);
    auto it = m.find(k);
    if (it != m.end()) { it->second.last_swap = swap; it->second.count++; return; }
    if (m.size() >= kHistMax) { overflow = true; return; }
    m[k] = HistEntry{start, len, base, info, swap, swap, 1, 0};
  }
};

// Superficie 2D tiled desde el origen (píxeles): lo que escribió un COPY o lo que lee un lector.
// Un COPY "cubre" a un lector si es la MISMA superficie (base, pitch, bytes por píxel) y el lector no
// lee fuera del rectángulo escrito: entonces todos los bytes leídos salen de ese COPY, aunque el extent
// (alineado a 32 filas) sea mayor que lo escrito.
struct Surface { bool valid = false; uint32_t base = 0, pitch = 0, width = 0, height = 0, bpp = 0; };
inline bool Covers(const Surface& w, const Surface& r) {
  return w.valid && r.valid && w.base == r.base && w.pitch == r.pitch && w.bpp == r.bpp && r.width <= w.width && r.height <= w.height;
}
struct CaptureCopy { Range r; bool full, src_unknown; uint64_t seq, preimage; Surface dest; };

struct DepResult { uint32_t cls = kDepMemory; uint64_t last_seq = 0; uint32_t copies = 0; };

// hash_now(start, len): XXH3 actual de la memoria guest. Un COPY cuyo extent cambió desde el COPY
// (el backend nulo no escribe resolves) tuvo otra escritura posterior -> ambiguo.
inline DepResult Classify(Range r, const std::vector<CaptureCopy>& copies, const ResolveHistory& hist,
                          const std::function<uint64_t(const CaptureCopy&)>& hash_now, const Surface* reader = nullptr) {
  DepResult d;
  if (r.e <= r.s) return d;
  std::vector<Range> full;
  bool ambiguous = false;
  for (auto& c : copies) {
    if (!Overlap(r, c.r)) continue;
    d.copies++; d.last_seq = std::max(d.last_seq, c.seq);
    if (c.src_unknown || hash_now(c) != c.preimage) ambiguous = true;
    if (c.full) full.push_back(c.r);
    else if (reader && Covers(c.dest, *reader)) full.push_back(r);  // cubre todo lo que el lector lee
  }
  bool hist_hit = false;
  for (auto& [k, h] : hist.m) {
    Range hr{h.extent_start, uint64_t(h.extent_start) + h.extent_length};
    if (!Overlap(r, hr)) continue;
    hist_hit = true;
    Range i{std::max(r.s, hr.s), std::min(r.e, hr.e)};
    if (!Covered(i, full)) { d.cls = kDepStalePreCapture; return d; }
  }
  if (ambiguous) { d.cls = kDepAmbiguous; return d; }
  if (hist.overflow && !Covered(r, full)) { d.cls = kDepUnknownOverflow; return d; }
  d.cls = (d.copies || hist_hit) ? kDepCaptureResolve : kDepMemory;
  return d;
}
inline uint32_t WorseDep(uint32_t a, uint32_t b) {
  static const int rank[5] = {0, 1, 2, 4, 3};  // 3 (viejo) es el peor
  return rank[a] >= rank[b] ? a : b;
}

// EDRAM: 2048 tiles (80×16 muestras a 32 bpp). "Conocido" = contenido determinado por operaciones
// de la captura: solo un clear de resolve que cubre el tile COMPLETO lo inicializa. Un draw no
// inicializa (cobertura parcial/blending). Dirección periódica de 11 bits.
struct TileRect { uint32_t base, pitch, x0, x1, y0, y1; };  // en tiles; [x0,x1) × [y0,y1)
struct Edram {
  static constexpr uint32_t kTiles = 2048;
  std::bitset<kTiles> known;
  template <class F> static void Each(const TileRect& t, F f) {
    for (uint32_t y = t.y0; y < t.y1; y++)
      for (uint32_t x = t.x0; x < t.x1; x++) f((t.base + y * t.pitch + x) & (kTiles - 1));
  }
  void Mark(const TileRect& t) { Each(t, [&](uint32_t i) { known.set(i); }); }
  bool AllKnown(const TileRect& t) const { bool ok = true; Each(t, [&](uint32_t i) { ok = ok && known.test(i); }); return ok; }
};
// Rectángulo en muestras -> tiles. outer: todo tile tocado (lecturas/escrituras). inner: solo tiles
// cubiertos por completo (inicialización por clear). x_scale_log2/y_scale_log2: muestras por píxel
// (MSAA) y 64 bpp (x×2), igual que draw_util::GetResolveEdramTileSpan.
inline TileRect SamplesToTiles(uint32_t base, uint32_t pitch_tiles, uint32_t x_px, uint32_t y_px, uint32_t w_px,
                               uint32_t h_px, uint32_t x_scale_log2, uint32_t y_scale_log2, bool inner) {
  uint64_t xs = uint64_t(x_px) << x_scale_log2, xe = uint64_t(x_px + w_px) << x_scale_log2;
  uint64_t ys = uint64_t(y_px) << y_scale_log2, ye = uint64_t(y_px + h_px) << y_scale_log2;
  TileRect t{base, pitch_tiles, 0, 0, 0, 0};
  if (inner) { t.x0 = uint32_t((xs + 79) / 80); t.x1 = uint32_t(xe / 80); t.y0 = uint32_t((ys + 15) / 16); t.y1 = uint32_t(ye / 16); }
  else { t.x0 = uint32_t(xs / 80); t.x1 = uint32_t((xe + 79) / 80); t.y0 = uint32_t(ys / 16); t.y1 = uint32_t((ye + 15) / 16); }
  if (t.x1 < t.x0) t.x1 = t.x0;
  if (t.y1 < t.y0) t.y1 = t.y0;
  return t;
}

}  // namespace r5f
