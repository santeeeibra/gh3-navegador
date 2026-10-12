// R5F v1: archivos mínimos SINTÉTICOS (sin datos del juego) para que el lector de Codex y el
// verificador de Claude se prueben sin arrancar GH3, + pruebas de la clasificación de dependencias.
// Usa el MISMO escritor (r5f_format.h) y la MISMA clasificación (r5f_deps.h) que el productor.
// Compilar: em++ -std=c++20 -O1 -sNODERAWFS=1 -sALLOW_MEMORY_GROWTH=1 -I<xxHash> r5f_fixture.cpp -o r5f-fixture.js
// Uso: node r5f-fixture.js <carpeta de salida>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#define XXH_INLINE_ALL
#include <xxhash.h>
#include "r5f_deps.h"
#include "r5f_format.h"

using namespace r5f;
namespace {
struct Out { std::vector<uint8_t> bytes; XXH3_state_t* st; };
bool Sink(const uint8_t* p, uint32_t n, void* u) { auto* o = static_cast<Out*>(u); o->bytes.insert(o->bytes.end(), p, p + n); return true; }
void Hash(const void* p, size_t n, void* u) { XXH3_64bits_update(static_cast<Out*>(u)->st, p, n); }
uint64_t H(const void* p, size_t n) { return XXH3_64bits(p, n); }
// Hash de microcódigo como lo pide el contrato: sobre los bytes BE del guest (el payload va en palabras host LE).
uint64_t HBe(const uint32_t* w, size_t dwords) {
  std::vector<uint32_t> be(w, w + dwords);
  for (auto& x : be) x = __builtin_bswap32(x);
  return XXH3_64bits(be.data(), dwords * 4);
}
template <class T> Writer::Part P(const T& v) { return {&v, sizeof v}; }

void Save(const std::string& path, const std::vector<uint8_t>& b) {
  FILE* f = std::fopen(path.c_str(), "wb");
  if (!f) { std::printf("no se pudo escribir %s\n", path.c_str()); return; }
  std::fwrite(b.data(), 1, b.size(), f); std::fclose(f);
  std::printf("%s %zu B\n", path.c_str(), b.size());
}

// Archivo de 2 cuadros sintéticos:
//  cuadro 0: COPY solo clear (inicializa EDRAM) + draw que muestrea una textura en memoria (dep 0)
//            + COPY que copia color a 0x00100000 (superficie 64×32 completa).
//  cuadro 1: draw que muestrea la textura escrita por ese COPY (dep 1, el replay ejecuta el COPY).
// variant: 0 válido; 1 DRAW con blob inexistente; 2 REG_DELTA fuera del banco; 3 SHADER repetido; 4 salto de event_seq.
std::vector<uint8_t> BuildValid(uint32_t max_bytes, bool* truncated, int variant = 0) {
  Out o; o.st = XXH3_createState(); XXH3_64bits_reset(o.st);
  Writer w; w.Start(max_bytes, Sink, Hash, &o, 1u << 20);
  FileHeader fh{}; fh.magic = kMagic; fh.version = kVersion; fh.header_bytes = 64; fh.host = 1; fh.trigger_kind = 2;
  fh.trigger_value = 10; fh.frames_requested = 2; fh.regs_count = kRegsCount; fh.max_bytes = max_bytes; fh.start_swap = 10; fh.start_time_us = 1000000;
  w.PutFileHeader(fh);
  std::vector<uint32_t> regs(kRegsCount, 0);
  regs[0x2000] = 0x1234;  // valor arbitrario sintético
  FrameBeginBody fb{0, 10, 1000000, 1, 1, 0, 0};
  HistEntry he{0x00200000, 0x2000, 0x00200000, 0x0, 3, 9, 7, 0};  // resolve previo a la captura en otro rango
  Writer::Part fbp[] = {P(fb), {regs.data(), regs.size() * 4}, P(he)};
  w.Record(kFrameBegin, 0, fbp, 3);
  // Shaders sintéticos (no son microcódigo real).
  uint32_t vs_code[4] = {0xC0000000, 1, 2, 3}, ps_code[4] = {0xC1000000, 4, 5, 6};
  uint64_t vs_h = HBe(vs_code, 4), ps_h = HBe(ps_code, 4);
  ShaderBody vs{0, 4, vs_h, 1, 0, 1, 0}; uint32_t vb[2] = {95, 4};
  ShaderBody ps{1, 4, ps_h, 1, 1, 0, 1}; uint32_t tb[2] = {0, 1};
  Writer::Part vsp[] = {P(vs), {vb, 8}, {vs_code, 16}}; w.Record(kShader, 0, vsp, 3);
  Writer::Part psp[] = {P(ps), {tb, 8}, {ps_code, 16}}; w.Record(kShader, 0, psp, 3);
  if (variant == 3) w.Record(kShader, 0, psp, 3);
  // Blobs: 3 vértices × 16 B y textura 4×4 RGBA (64 B), bytes inventados.
  uint8_t vtx[48], tex[64];
  for (int i = 0; i < 48; i++) vtx[i] = uint8_t(i);
  for (int i = 0; i < 64; i++) tex[i] = uint8_t(0xA0 + i);
  BlobBody b1{1, kVertex, 0x00010000, 48, H(vtx, 48), 0, 0}; Writer::Part b1p[] = {P(b1), {vtx, 48}}; w.Record(kBlob, 0, b1p, 2);
  BlobBody b2{2, kTexBase, 0x00020000, 64, H(tex, 64), 0, 0}; Writer::Part b2p[] = {P(b2), {tex, 64}}; w.Record(kBlob, 0, b2p, 2);
  // Evento 1: COPY solo clear (color y profundidad, superficie 64×32 completa): inicializa la EDRAM.
  CopyBody cl{}; cl.copy_index = 0; cl.status = 0; cl.flags = kCFClearColor | kCFClearDepth; cl.rect_blob = kNone;
  Writer::Part clp[] = {P(cl)}; w.Record(kCopy, 1, clp, 1);
  // Evento 2: DRAW (con delta de registros antes) sobre EDRAM ya limpiada.
  uint32_t d1[4] = {0x2100, 0x55, variant == 2 ? 0x6000u : 0x2101u, 0x66};
  RegDeltaBody rd{2, 0}; Writer::Part rdp[] = {P(rd), {d1, 16}}; w.Record(kRegDelta, 2, rdp, 2);
  DrawBody dr{}; dr.draw_index = 0; dr.status = kIssued; dr.prim = 4; dr.index_count = 3; dr.index_source = 0; dr.n_vf = 1; dr.n_tf = 1;
  dr.vs_hash = vs_h; dr.ps_hash = ps_h; dr.edram_targets = 1; dr.edram_prior = 0; dr.replay_flags = 0;
  VFetchEntry vf{95, 0x00010000 | 3, 12u << 2, 1, 0, 0};  // tipo 3, 12 dwords, endian 0
  TFetchEntry tf{}; tf.fetch_slot = 0; tf.raw[0] = 2; tf.format = 6; tf.dimension = 1; tf.width = 3; tf.height = 3; tf.depth = 0;
  tf.pitch = 1; tf.base_phys = 0x00020000; tf.base_bytes = 64; tf.base_blob = variant == 1 ? 99 : 2; tf.dep_class = kDepMemory;
  Writer::Part drp[] = {P(dr), P(vf), P(tf)}; w.Record(kDraw, 2, drp, 3);
  // Evento 3: COPY del color a 0x00100000 (superficie completa, origen conocido).
  CopyBody cp{}; cp.copy_index = 1; cp.status = 0; cp.copy_dest_base = 0x00100000; cp.copy_dest_extent_start = 0x00100000;
  cp.copy_dest_extent_length = 64 * 32 * 4; cp.flags = kCFCopies | kCFFullOverwrite;
  cp.rect_blob = kNone; cp.dest_hash_at_copy = 0x1111;
  Writer::Part cpp_[] = {P(cp)}; w.Record(kCopy, 3, cpp_, 1);
  // El búfer mostrado es la salida del COPY anterior (dep 1).
  SwapBody sw{11, 0x00100000, 64, 32, 1016000, kDepCaptureResolve, 0}; Writer::Part swp[] = {P(sw)}; w.Record(kSwap, variant == 4 ? 5 : 4, swp, 1);
  FrameEndBody fe{}; fe.frame_no = 0; fe.draws = 1; fe.draws_issued = 1; fe.copies = 2; fe.blobs_new = 2;
  fe.replayable_exact = 1; fe.g1_draws_delta = 3; fe.g1_copies_delta = 2; fe.events = 4;
  Writer::Part fep[] = {P(fe)}; w.Record(kFrameEnd, 0, fep, 1);
  // Cuadro 1.
  FrameBeginBody fb1{1, 11, 1016000, 0, 0, 0, 0}; Writer::Part fb1p[] = {P(fb1)}; w.Record(kFrameBegin, 0, fb1p, 1);
  std::vector<uint8_t> stale(64 * 32 * 4, 0);  // bytes en memoria guest (viejos: el backend nulo no escribe)
  BlobBody b3{3, kTexBase, 0x00100000, uint32_t(stale.size()), H(stale.data(), stale.size()), 0, 0};
  Writer::Part b3p[] = {P(b3), {stale.data(), stale.size()}}; w.Record(kBlob, 0, b3p, 2);
  DrawBody dr2 = dr; dr2.draw_index = 1; dr2.edram_prior = 0; dr2.replay_flags = 0;
  TFetchEntry tf2 = tf; tf2.width = 63; tf2.height = 31; tf2.pitch = 2; tf2.base_phys = 0x00100000; tf2.base_bytes = uint32_t(stale.size());
  tf2.base_blob = 3; tf2.dep_class = tf2.dep_base = kDepCaptureResolve; tf2.dep_last_copy_seq = 3; tf2.dep_copies = 1;
  Writer::Part dr2p[] = {P(dr2), P(vf), P(tf2)}; w.Record(kDraw, 5, dr2p, 3);
  SwapBody sw2{12, 0x00100000, 64, 32, 1032000, kDepCaptureResolve, 0}; Writer::Part sw2p[] = {P(sw2)}; w.Record(kSwap, 6, sw2p, 1);
  FrameEndBody fe1{}; fe1.frame_no = 1; fe1.draws = 1; fe1.draws_issued = 1; fe1.blobs_new = 1; fe1.tex_capture_resolve = 1;
  fe1.replayable_exact = 1; fe1.g1_draws_delta = 1; fe1.events = 2;
  Writer::Part fe1p[] = {P(fe1)}; w.Record(kFrameEnd, 0, fe1p, 1);
  w.Finish(w.status() == kComplete ? 2 : 0, XXH3_64bits_digest(o.st));
  if (truncated) *truncated = w.status() == kTruncated;
  XXH3_freeState(o.st);
  return o.bytes;
}

// ---- pruebas de dependencias (lógica real del productor) ----
struct T { const char* name; bool ok; std::string got; };
std::vector<T> DepTests() {
  std::vector<T> t;
  auto same = [](const CaptureCopy& c) { return c.preimage; };
  auto changed = [](const CaptureCopy& c) { return c.preimage ^ 1; };
  auto cls = [](DepResult d) { return std::to_string(d.cls); };
  ResolveHistory none;
  ResolveHistory h1; h1.Note(0x1000, 0x1000, 0x1000, 7, 5);  // [0x1000,0x2000) antes de la captura
  // 1. Sin resolves: memoria válida.
  { auto d = Classify({0x5000, 0x5100}, {}, none, same); t.push_back({"sin_resolves=0", d.cls == kDepMemory, cls(d)}); }
  // 2. Solapamiento PARCIAL con resolve previo a la captura: viejo.
  { auto d = Classify({0x1F00, 0x2100}, {}, h1, same); t.push_back({"hist_parcial=3", d.cls == kDepStalePreCapture, cls(d)}); }
  // 3. Mips: la base no toca, el rango de mips sí -> el peor es 3.
  { auto b = Classify({0x8000, 0x9000}, {}, h1, same), m = Classify({0x1800, 0x1900}, {}, h1, same);
    uint32_t w = WorseDep(b.cls, m.cls); t.push_back({"mips_hist=3", b.cls == 0 && m.cls == 3 && w == 3, std::to_string(w)}); }
  // 4. Desborde del historial sin solapamiento visible: desconocido.
  { ResolveHistory ov; ov.overflow = true; auto d = Classify({0x5000, 0x5100}, {}, ov, same);
    t.push_back({"overflow=4", d.cls == kDepUnknownOverflow, cls(d)}); }
  // 5. COPY parcial dentro de la captura, sin historial: replay del COPY + memoria válida = 1.
  { std::vector<CaptureCopy> c{{{0x5000, 0x5080}, false, false, 9, 42}};
    auto d = Classify({0x5000, 0x5100}, c, none, same); t.push_back({"copy_parcial_sin_hist=1", d.cls == 1 && d.last_seq == 9 && d.copies == 1, cls(d)}); }
  // 6. Escritura posterior al COPY (hash cambió): ambiguo.
  { std::vector<CaptureCopy> c{{{0x5000, 0x5100}, true, false, 9, 42}};
    auto d = Classify({0x5000, 0x5100}, c, none, changed); t.push_back({"escrito_despues=2", d.cls == kDepAmbiguous, cls(d)}); }
  // 7. COPY con origen EDRAM desconocido: ambiguo.
  { std::vector<CaptureCopy> c{{{0x5000, 0x5100}, true, true, 9, 42}};
    auto d = Classify({0x5000, 0x5100}, c, none, same); t.push_back({"origen_desconocido=2", d.cls == kDepAmbiguous, cls(d)}); }
  // 8. Resolve previo CUBIERTO por COPY completo de la captura: 1.
  { std::vector<CaptureCopy> c{{{0x1000, 0x2000}, true, false, 3, 42}};
    auto d = Classify({0x1000, 0x2000}, c, h1, same); t.push_back({"hist_cubierto_full=1", d.cls == kDepCaptureResolve, cls(d)}); }
  // 9. Resolve previo cubierto solo por COPY parcial (no full): viejo.
  { std::vector<CaptureCopy> c{{{0x1000, 0x2000}, false, false, 3, 42}};
    auto d = Classify({0x1000, 0x2000}, c, h1, same); t.push_back({"hist_cubierto_parcial=3", d.cls == kDepStalePreCapture, cls(d)}); }
  // 10a. Resolve 1280×720 en extent alineado a 736 filas, con resolve previo en el mismo destino:
  //      el COPY no es "full" por extent, pero cubre la MISMA superficie que lee el lector -> 1.
  { ResolveHistory h; h.Note(0xC7D0000, 3768320, 0xC7D0000, 0, 5);
    Surface w{true, 0xC7D0000, 1280, 1280, 720, 4}, rd{true, 0xC7D0000, 1280, 1280, 720, 4};
    std::vector<CaptureCopy> c{{{0xC7D0000, 0xC7D0000 + 3768320ull}, false, false, 7, 42, w}};
    auto d = Classify({0xC7D0000, 0xC7D0000 + 1280ull * 720 * 4}, c, h, same, &rd);
    t.push_back({"superficie_cubre_720p=1", d.cls == kDepCaptureResolve, cls(d)}); }
  // 10b. Mismo caso, lector con otro pitch: no cubre -> viejo.
  { ResolveHistory h; h.Note(0xC7D0000, 3768320, 0xC7D0000, 0, 5);
    Surface w{true, 0xC7D0000, 1280, 1280, 720, 4}, rd{true, 0xC7D0000, 1024, 1024, 720, 4};
    std::vector<CaptureCopy> c{{{0xC7D0000, 0xC7D0000 + 3768320ull}, false, false, 7, 42, w}};
    auto d = Classify({0xC7D0000, 0xC7D0000 + 1024ull * 720 * 4}, c, h, same, &rd);
    t.push_back({"superficie_otro_pitch=3", d.cls == kDepStalePreCapture, cls(d)}); }
  // 10c. Lector más alto que lo escrito: no cubre -> viejo.
  { ResolveHistory h; h.Note(0xC7D0000, 3768320, 0xC7D0000, 0, 5);
    Surface w{true, 0xC7D0000, 1280, 1280, 360, 4}, rd{true, 0xC7D0000, 1280, 1280, 720, 4};
    std::vector<CaptureCopy> c{{{0xC7D0000, 0xC7D0000 + 3768320ull}, false, false, 7, 42, w}};
    auto d = Classify({0xC7D0000, 0xC7D0000 + 1280ull * 720 * 4}, c, h, same, &rd);
    t.push_back({"superficie_mas_alta=3", d.cls == kDepStalePreCapture, cls(d)}); }
  // 10. EDRAM: clear parcial (no cubre tiles completos) no inicializa.
  { Edram e; e.Mark(SamplesToTiles(0, 16, 0, 0, 40, 16, 0, 0, true));  // 40 px de ancho < 80 muestras
    bool k = e.AllKnown(SamplesToTiles(0, 16, 0, 0, 40, 16, 0, 0, false));
    t.push_back({"clear_parcial_no_inicializa", !k, k ? "conocido" : "desconocido"}); }
  // 11. EDRAM: clear completo 1280×720 1x 32bpp inicializa; un draw dentro queda conocido.
  { Edram e; e.Mark(SamplesToTiles(0, 16, 0, 0, 1280, 720, 0, 0, true));
    bool k = e.AllKnown(SamplesToTiles(0, 16, 100, 100, 200, 50, 0, 0, false));
    t.push_back({"clear_completo_inicializa", k, k ? "conocido" : "desconocido"}); }
  // 12. EDRAM: 64 bpp ocupa el doble de tiles por fila; un clear 32bpp del mismo ancho no lo cubre.
  { Edram e; e.Mark(SamplesToTiles(0, 16, 0, 0, 1280, 720, 0, 0, true));
    bool k = e.AllKnown(SamplesToTiles(0, 32, 0, 0, 1280, 720, 1, 0, false));
    t.push_back({"64bpp_no_cubierto_por_32bpp", !k, k ? "conocido" : "desconocido"}); }
  // 13. EDRAM: periodicidad de 11 bits (base 2040 + 16 tiles da la vuelta).
  { Edram e; e.Mark({2040, 16, 0, 16, 0, 1}); bool k = e.known.test(7) && e.known.test(2047) && !e.known.test(8);
    t.push_back({"edram_vuelta_2048", k, k ? "ok" : "mal"}); }
  return t;
}
}  // namespace

int main(int argc, char** argv) {
  std::string dir = argc > 1 ? argv[1] : ".";
  bool tr = false;
  auto valid = BuildValid(kDefaultMaxBytes, &tr);
  Save(dir + "/r5f-min-valido.r5f", valid);
  auto trunc = BuildValid(20000, &tr);  // presupuesto chico: se corta en los blobs/regs
  Save(dir + "/r5f-min-truncado.r5f", trunc);
  // Corruptos derivados del válido.
  { auto b = valid; b[200] ^= 0xFF; Save(dir + "/r5f-min-hash-malo.r5f", b); }
  { auto b = valid; b.resize(b.size() - kFooterBytes); Save(dir + "/r5f-min-sin-footer.r5f", b); }
  { auto b = valid; for (int i = 0; i < 16; i++) b.push_back(0); Save(dir + "/r5f-min-bytes-sobrantes.r5f", b); }
  // Corruptos con hash y FOOTER correctos: el defecto es semántico.
  Save(dir + "/r5f-min-blob-ausente.r5f", BuildValid(kDefaultMaxBytes, nullptr, 1));
  Save(dir + "/r5f-min-delta-fuera.r5f", BuildValid(kDefaultMaxBytes, nullptr, 2));
  Save(dir + "/r5f-min-shader-repetido.r5f", BuildValid(kDefaultMaxBytes, nullptr, 3));
  Save(dir + "/r5f-min-salto-seq.r5f", BuildValid(kDefaultMaxBytes, nullptr, 4));
  int fails = 0;
  std::string js = "{\"truncatedBuilt\":" + std::string(tr ? "true" : "false") + ",\"tests\":[";
  auto tests = DepTests();
  for (size_t i = 0; i < tests.size(); i++) {
    if (!tests[i].ok) fails++;
    js += std::string(i ? "," : "") + "{\"name\":\"" + tests[i].name + "\",\"ok\":" + (tests[i].ok ? "true" : "false") + ",\"got\":\"" + tests[i].got + "\"}";
    std::printf("%s %s (%s)\n", tests[i].ok ? "OK " : "MAL", tests[i].name, tests[i].got.c_str());
  }
  js += "],\"fails\":" + std::to_string(fails) + "}\n";
  FILE* f = std::fopen((dir + "/deps-check.json").c_str(), "wb"); if (f) { std::fputs(js.c_str(), f); std::fclose(f); }
  std::printf("pruebas de dependencias: %zu, fallas %d\n", tests.size(), fails);
  return fails ? 1 : 0;
}
