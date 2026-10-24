// R5F v1: formato de captura de cuadros completos (contrato: artifacts/r5-runtime-claude/CONTRATO-R5F-V1.md).
// Sin dependencias del SDK: lo usan el productor (r5_frame.cpp) y el generador de archivos mínimos
// (r5f_fixture.cpp). Todo little-endian; structs sin padding (static_assert de tamaño y offsets).
#pragma once
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <vector>

namespace r5f {

constexpr uint32_t kMagic = 0x31463552u;  // "R5F1"
constexpr uint16_t kVersion = 1;
constexpr uint32_t kRegsCount = 0x5003;
constexpr uint32_t kNone = 0;              // id de blob ausente (los ids empiezan en 1)
constexpr uint32_t kFooterBytes = 48;      // reservado siempre dentro del presupuesto
constexpr uint32_t kMaxFrames = 4, kMaxEventsPerFrame = 4096, kHistMax = 256;
constexpr uint32_t kRecordMax = 16u << 20;
constexpr uint32_t kDefaultMaxBytes = 96u << 20;

enum RecordType : uint32_t {
  kFrameBegin = 1, kRegDelta = 2, kShader = 3, kBlob = 4, kDraw = 5, kCopy = 6, kSwap = 7, kFrameEnd = 8, kFooter = 9,
};
enum BlobKind : uint32_t { kVertex = 1, kIndex = 2, kTexBase = 3, kTexMips = 4, kResolveRect = 5 };
enum DrawStatus : uint32_t { kIssued = 0, kNotIssued = 1, kVizKilled = 2, kBadPacket = 3, kIssuedUnsupported = 4 };
enum Unsupported : uint32_t {  // DrawBody.unsupported_mask
  kUMemexport = 1u << 0, kUFetchType = 1u << 1, kUPrepare = 1u << 2, kURange = 1u << 3,
  kUNotAnalyzed = 1u << 4, kUNoShader = 1u << 5, kUPathTess = 1u << 6, kUEdramMode = 1u << 7,
};
enum DepClass : uint32_t {  // TFetchEntry.dep_*: solo 0 y 1 permiten replay exacto
  kDepMemory = 0,           // ningún resolve conocido toca el rango: los bytes capturados valen
  kDepCaptureResolve = 1,   // el contenido sale de copies DENTRO de la captura: el replay debe ejecutarlas
  kDepAmbiguous = 2,        // mezcla/escritura posterior/origen EDRAM desconocido: no exacto
  kDepStalePreCapture = 3,  // resolve anterior a la captura no cubierto: bytes VIEJOS
  kDepUnknownOverflow = 4,  // sin solapamiento visible pero el historial desbordó: desconocido
};
enum CopyFlags : uint32_t {
  kCFCopies = 1u << 0, kCFClearDepth = 1u << 1, kCFClearColor = 1u << 2, kCFSrcUnknown = 1u << 3,
  kCFFullOverwrite = 1u << 4,
};
enum FooterStatus : uint32_t { kComplete = 0, kTruncated = 1, kAborted = 2 };
enum FooterReason : uint32_t { kRNone = 0, kRMaxBytes = 1, kRRecordTooLarge = 2, kRTooManyEvents = 3, kRSink = 4, kRShutdown = 5 };

struct FileHeader {           // 64 B
  uint32_t magic;             // 0
  uint16_t version;           // 4
  uint16_t header_bytes;      // 6   64
  uint32_t host;              // 8   1 node, 2 web
  uint32_t trigger_kind;      // 12  1 at (ms), 2 swap
  uint32_t trigger_value;     // 16  ms desde la creación del sistema gráfico, o número de swap
  uint32_t frames_requested;  // 20
  uint32_t regs_count;        // 24  0x5003
  uint32_t max_bytes;         // 28
  uint32_t start_swap;        // 32  S: contador de swaps tras el swap que abre la captura
  uint32_t reserved0;         // 36
  uint64_t start_time_us;     // 40  µs desde la creación del sistema gráfico, en ese swap
  uint32_t reserved[4];       // 48..63
};
struct RecordHeader {         // 16 B
  uint32_t type;              // 0
  uint32_t bytes;             // 4   total con cabecera, múltiplo de 16
  uint64_t event_seq;         // 8   DRAW/COPY/SWAP: 1,2,3... ; REG_DELTA: seq del evento al que precede; resto 0
};
struct FrameBeginBody {       // 32 B; sigue [regs] y [hist]
  uint32_t frame_no;          // 0
  uint32_t open_swap;         // 4   S + frame_no
  uint64_t time_us;           // 8
  uint32_t regs_present;      // 16  1 solo en frame 0
  uint32_t hist_count;        // 20  solo en frame 0
  uint32_t hist_overflow;     // 24  1 = hubo más de 256 destinos distintos antes de la captura
  uint32_t reserved;          // 28
};
struct HistEntry {            // 32 B: destino de resolve visto ANTES de la captura
  uint32_t extent_start;      // 0
  uint32_t extent_length;     // 4
  uint32_t copy_dest_base;    // 8
  uint32_t copy_dest_info;    // 12
  uint32_t first_swap;        // 16
  uint32_t last_swap;         // 20
  uint32_t count;             // 24
  uint32_t reserved;          // 28
};
struct RegDeltaBody { uint32_t n, reserved; };  // 8 B; sigue n × {u32 index, u32 value}
struct ShaderBody {           // 32 B; siguen n_vb×{fetch_constant, stride_words}, n_tb×{fetch_constant, dimension}, ucode
  uint32_t type;              // 0   0 vértices, 1 píxeles
  uint32_t dwords;            // 4
  uint64_t hash;              // 8   XXH3 de los bytes BE del guest
  uint32_t flags;             // 16  b0 analizado, b1 kills_pixels, b2 writes_depth, b3 memexport
  uint32_t writes_color_targets;  // 20
  uint32_t n_vb;              // 24
  uint32_t n_tb;              // 28
};
struct BlobBody {             // 32 B; siguen los bytes crudos (BE guest)
  uint32_t blob_id;           // 0
  uint32_t kind;              // 4
  uint32_t phys;              // 8
  uint32_t bytes;             // 12
  uint64_t xxh3;              // 16
  uint32_t flags;             // 24  b0 src_changed
  uint32_t reserved;          // 28
};
struct DrawBody {             // 96 B; siguen n_vf × VFetchEntry y n_tf × TFetchEntry
  uint32_t draw_index;        // 0
  uint32_t status;            // 4
  uint32_t unsupported_mask;  // 8
  uint32_t prim;              // 12
  uint32_t index_count;       // 16
  uint32_t vgt_draw_initiator;// 20
  uint32_t major_explicit;    // 24
  uint32_t index_source;      // 28  0 auto, 1 dma, 2 otro (inmediato/inválido)
  uint32_t index_format;      // 32
  uint32_t index_endian;      // 36
  uint32_t index_phys;        // 40
  uint32_t index_bytes;       // 44
  uint32_t index_blob;        // 48
  uint32_t n_vf;              // 52
  uint64_t vs_hash;           // 56
  uint64_t ps_hash;           // 64
  uint32_t n_tf;              // 72
  uint32_t edram_prior;       // 76  b0..3 color RT i, b4 profundidad: tiles con contenido no determinado
  uint32_t edram_targets;     // 80  b0..3 color RT i usado, b4 profundidad usada
  uint32_t replay_flags;      // 84  b0 textura no exacta, b1 src_changed, b2 no soportado, b3 edram previo desconocido
  uint32_t reserved[2];       // 88..95
};
struct VFetchEntry {          // 24 B
  uint32_t fetch_slot;        // 0
  uint32_t raw0, raw1;        // 4, 8
  uint32_t blob_id;           // 12
  uint32_t status;            // 16  0 ok, 1 tipo != 3, 2 rango, 3 tamaño 0
  uint32_t reserved;          // 20
};
struct TFetchEntry {          // 128 B
  uint32_t fetch_slot;        // 0
  uint32_t raw[6];            // 4..27
  uint32_t status;            // 28  0 ok, 1 tipo != 2, 2 Prepare falló, 3 rango
  uint32_t format;            // 32
  uint32_t endian;            // 36
  uint32_t dimension;         // 40
  uint32_t width;             // 44  como TFetchV1 (TextureInfo)
  uint32_t height;            // 48
  uint32_t depth;             // 52
  uint32_t pitch;             // 56
  uint32_t tiled;             // 60
  uint32_t mip_min;           // 64
  uint32_t mip_max;           // 68
  uint32_t packed_mips;       // 72
  uint32_t base_phys;         // 76
  uint32_t base_bytes;        // 80
  uint32_t base_blob;         // 84
  uint32_t mip_phys;          // 88
  uint32_t mip_bytes;         // 92
  uint32_t mip_blob;          // 96
  uint32_t dep_class;         // 100 peor de base y mips
  uint32_t dep_base;          // 104
  uint32_t dep_mip;           // 108
  uint64_t dep_last_copy_seq; // 112 último COPY de la captura que solapa (0 = ninguno)
  uint32_t dep_copies;        // 120 COPY de la captura que solapan
  uint32_t reserved;          // 124
};
struct CopyBody {             // 96 B
  uint32_t copy_index;        // 0
  uint32_t status;            // 4   0 ok, 1 GetResolveInfo falló (no se aplica nada), 2 vacío (ancho/alto 0)
  uint32_t rb_copy_control;   // 8   ResolveInfo, valores empaquetados
  uint32_t depth_edram_info;  // 12
  uint32_t color_edram_info;  // 16
  uint32_t depth_original_base;  // 20
  uint32_t color_original_base;  // 24
  uint32_t coordinate_info;   // 28
  uint32_t height_div_8;      // 32
  uint32_t copy_dest_info;    // 36
  uint32_t copy_dest_coordinate_info;  // 40
  uint32_t copy_dest_base;    // 44
  uint32_t copy_dest_extent_start;   // 48
  uint32_t copy_dest_extent_length;  // 52
  uint32_t rb_depth_clear;    // 56
  uint32_t rb_color_clear;    // 60
  uint32_t rb_color_clear_lo; // 64
  uint32_t rect_blob;         // 68  primeros ≤256 B del vfetch 0 (rectángulo), diagnóstico
  uint32_t flags;             // 72  CopyFlags
  uint32_t reserved0;         // 76
  uint64_t dest_hash_at_copy; // 80  XXH3 del extent en memoria guest al momento del COPY (0 si no copia)
  uint64_t reserved1;         // 88
};
struct SwapBody {             // 32 B
  uint32_t swap_index;        // 0   valor del contador de swaps después de este swap
  uint32_t frontbuffer_phys;  // 4
  uint32_t width;             // 8
  uint32_t height;            // 12
  uint64_t time_us;           // 16
  uint32_t frontbuffer_dep;   // 24  DepClass del búfer mostrado (superficie 32 bpp tiled, pitch = ancho alineado a 32)
  uint32_t reserved;          // 28
};
struct FrameEndBody {         // 80 B
  uint32_t frame_no;          // 0
  uint32_t draws;             // 4   registros DRAW del cuadro
  uint32_t draws_issued;      // 8   status 0 o 4
  uint32_t not_issued;        // 12  status 1..3
  uint32_t copies;            // 16
  uint32_t blobs_new;         // 20
  uint32_t bytes_frame;       // 24
  uint32_t draws_edram_unknown;  // 28
  uint32_t copies_src_unknown;   // 32
  uint32_t tex_ambiguous;     // 36  entradas tfetch de draws emitidos con dep 2
  uint32_t tex_stale;         // 40  dep 3
  uint32_t tex_overflow;      // 44  dep 4
  uint32_t tex_capture_resolve;  // 48 dep 1
  uint32_t src_changed;       // 52  blobs del cuadro con src_changed
  uint32_t unsupported_draws; // 56
  uint32_t replayable_exact;  // 60  1 solo si todo lo anterior que impide exactitud es 0
  uint32_t g1_draws_delta;    // 64  contador [g1] draws en el cuadro (incluye draws en modo copy)
  uint32_t g1_copies_delta;   // 68
  uint32_t events;            // 72  DRAW+COPY+SWAP del cuadro
  uint32_t reserved;          // 76
};
struct FooterBody {           // 32 B
  uint32_t status;            // 0
  uint32_t reason;            // 4
  uint32_t frames;            // 8   cuadros cerrados con FRAME_END
  uint32_t records;           // 12  registros anteriores al FOOTER
  uint64_t total_bytes;       // 16  archivo entero, FOOTER incluido
  uint64_t xxh3;              // 24  XXH3-64 de todos los bytes anteriores al FOOTER (cabecera incluida)
};

#define R5F_OFF(T, f, o) static_assert(offsetof(T, f) == o, #T "." #f)
static_assert(sizeof(FileHeader) == 64 && sizeof(RecordHeader) == 16 && sizeof(FrameBeginBody) == 32 &&
              sizeof(HistEntry) == 32 && sizeof(RegDeltaBody) == 8 && sizeof(ShaderBody) == 32 &&
              sizeof(BlobBody) == 32 && sizeof(DrawBody) == 96 && sizeof(VFetchEntry) == 24 &&
              sizeof(TFetchEntry) == 128 && sizeof(CopyBody) == 96 && sizeof(SwapBody) == 32 &&
              sizeof(FrameEndBody) == 80 && sizeof(FooterBody) == 32, "tamaños R5F v1");
R5F_OFF(FileHeader, start_time_us, 40); R5F_OFF(RecordHeader, event_seq, 8);
R5F_OFF(FrameBeginBody, regs_present, 16); R5F_OFF(BlobBody, xxh3, 16);
R5F_OFF(DrawBody, vs_hash, 56); R5F_OFF(DrawBody, n_tf, 72); R5F_OFF(DrawBody, replay_flags, 84);
R5F_OFF(TFetchEntry, status, 28); R5F_OFF(TFetchEntry, base_phys, 76); R5F_OFF(TFetchEntry, mip_blob, 96);
R5F_OFF(TFetchEntry, dep_last_copy_seq, 112); R5F_OFF(CopyBody, rect_blob, 68);
R5F_OFF(CopyBody, dest_hash_at_copy, 80); R5F_OFF(SwapBody, time_us, 16); R5F_OFF(SwapBody, frontbuffer_dep, 24); R5F_OFF(FrameEndBody, g1_draws_delta, 64);
R5F_OFF(FooterBody, total_bytes, 16); R5F_OFF(FooterBody, xxh3, 24);
#undef R5F_OFF

// Escritor con presupuesto. Arma cada registro en un búfer propio; lo emite al sumidero por tandas
// (chunk ≤ flush_at). Si un registro no entra en el presupuesto (reservando el FOOTER), no se emite:
// la captura queda truncada y Finish() escribe FOOTER status=1. Hash XXH3 por streaming (callback).
class Writer {
 public:
  // sink(ptr, len) debe COPIAR los bytes antes de volver; devuelve false si falló.
  using Sink = bool (*)(const uint8_t* p, uint32_t len, void* user);
  using HashUpdate = void (*)(const void* p, size_t len, void* user);
  void Start(uint32_t max_bytes, Sink sink, HashUpdate hu, void* user, uint32_t flush_at = 4u << 20) {
    max_ = max_bytes; sink_ = sink; hu_ = hu; user_ = user; flush_at_ = flush_at;
    buf_.clear(); buf_.reserve(flush_at + kRecordMax); total_ = 0; records_ = 0; status_ = kComplete; reason_ = kRNone; open_ = true;
  }
  bool ok() const { return open_ && status_ == kComplete; }
  uint64_t total() const { return total_; }
  uint32_t records() const { return records_; }
  // Cabecera de archivo (no es un registro).
  bool PutFileHeader(const FileHeader& h) { return Append(&h, sizeof h, false); }
  // Registro = cabecera + partes; pad a 16 con ceros.
  struct Part { const void* p; size_t n; };
  bool Record(uint32_t type, uint64_t seq, const Part* parts, size_t nparts) {
    if (!ok()) return false;
    size_t body = 0; for (size_t i = 0; i < nparts; i++) body += parts[i].n;
    size_t bytes = (sizeof(RecordHeader) + body + 15) & ~size_t(15);
    if (bytes > kRecordMax) { Truncate(kRRecordTooLarge); return false; }
    if (total_ + bytes + kFooterBytes > max_) { Truncate(kRMaxBytes); return false; }
    RecordHeader rh{type, uint32_t(bytes), seq};
    size_t at = buf_.size();
    buf_.resize(at + bytes, 0);
    std::memcpy(buf_.data() + at, &rh, sizeof rh);
    size_t o = at + sizeof rh;
    for (size_t i = 0; i < nparts; i++) { if (parts[i].n) std::memcpy(buf_.data() + o, parts[i].p, parts[i].n); o += parts[i].n; }
    hu_(buf_.data() + at, bytes, user_);
    total_ += bytes; records_++;
    if (buf_.size() >= flush_at_) return Flush();
    return true;
  }
  void Truncate(uint32_t reason) { if (status_ == kComplete) { status_ = kTruncated; reason_ = reason; } }
  void Abort(uint32_t reason) { status_ = kAborted; reason_ = reason; }
  // Cierra: FOOTER (siempre entra por la reserva) + vaciado. digest = XXH3 de todo lo anterior.
  bool Finish(uint32_t frames, uint64_t digest) {
    if (!open_) return false;
    FooterBody f{status_, reason_, frames, records_, total_ + kFooterBytes, digest};
    RecordHeader rh{kFooter, kFooterBytes, 0};
    size_t at = buf_.size(); buf_.resize(at + kFooterBytes, 0);
    std::memcpy(buf_.data() + at, &rh, sizeof rh); std::memcpy(buf_.data() + at + sizeof rh, &f, sizeof f);
    total_ += kFooterBytes;
    bool r = Flush();
    open_ = false;
    return r;
  }
  uint32_t status() const { return status_; }
  uint32_t reason() const { return reason_; }

 private:
  bool Append(const void* p, size_t n, bool) {
    size_t at = buf_.size(); buf_.resize(at + n); std::memcpy(buf_.data() + at, p, n);
    hu_(buf_.data() + at, n, user_); total_ += n; return true;
  }
  bool Flush() {
    if (buf_.empty()) return true;
    bool r = sink_(buf_.data(), uint32_t(buf_.size()), user_);
    buf_.clear();
    if (!r) Abort(kRSink);
    return r;
  }
  std::vector<uint8_t> buf_;
  uint64_t total_ = 0; uint32_t records_ = 0, max_ = 0, flush_at_ = 0, status_ = kComplete, reason_ = kRNone;
  bool open_ = false;
  Sink sink_ = nullptr; HashUpdate hu_ = nullptr; void* user_ = nullptr;
};

}  // namespace r5f
