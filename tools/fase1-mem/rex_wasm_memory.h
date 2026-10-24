// Memoria del guest Xbox 360 para WebAssembly con traducción explícita de direcciones.
//
// En nativo, rexglue (src/system/xmemory.cpp) mapea UN archivo de memoria compartida en varias
// vistas fijas (map_info). Así 0xA0000000, 0xC0000000, 0xE0000000(+0x1000) y 0x7F000000 son
// alias de la memoria física, y 0x90000000 es alias de 0x80000000. WebAssembly no puede crear
// alias de páginas ni capturar SIGSEGV, así que acá cada acceso pasa por una tabla de páginas:
//   página guest (4 KB) -> página del "archivo" (misma fórmula que map_info) -> página del arena.
// Dos direcciones que en nativo comparten página del archivo comparten página del arena.
// Las guardas (mprotect) y el MMIO (fallo de página + decodificación de la instrucción) se
// reemplazan por bits en la entrada de la tabla que desvían el acceso a la ruta lenta.
//
// Las macros REX_LOAD_* / REX_STORE_* / REX_MM_* tienen el mismo nombre y forma que las del
// código generado por rexglue (resources/templates/codegen/pch_h.inja), para poder sustituirlas.
#pragma once
#include <cstdint>
#include <cstdlib>
#include <cstring>

namespace rexwasm {

constexpr uint32_t kPageShift = 12;
constexpr uint32_t kPageSize = 1u << kPageShift;
constexpr uint32_t kPageOffsetMask = kPageSize - 1;
constexpr uint32_t kGuestPages = 1u << (32 - kPageShift);
constexpr uint32_t kFilePages = uint32_t(0x120000000ull >> kPageShift);
constexpr uint32_t kNoPage = 0xFFFFFFFFu;

// Entrada de la tabla: bits 0-1 tipo, bit 2 lectura, bit 3 escritura, bits 12-31 página del arena
// (RAM) o índice de rango MMIO.
enum : uint32_t { kKindNone = 0, kKindRam = 1, kKindMmio = 2, kKindMask = 3 };
enum : uint32_t { kProtRead = 4, kProtWrite = 8, kProtRW = kProtRead | kProtWrite };

// Copia de map_info de rexglue-sdk c94f5eb, src/system/xmemory.cpp.
struct View { uint64_t start, end, target; };
inline constexpr View kViews[] = {
    {0x00000000, 0x3FFFFFFF, 0x0000000000000000ull},  // virtual 4k
    {0x40000000, 0x7EFFFFFF, 0x0000000040000000ull},  // virtual 64k
    {0x7F000000, 0x7FFFFFFF, 0x0000000100000000ull},  // GPU writeback (física)
    {0x80000000, 0x8FFFFFFF, 0x0000000080000000ull},  // xex 64k
    {0x90000000, 0x9FFFFFFF, 0x0000000080000000ull},  // xex 4k (alias de 0x80000000)
    {0xA0000000, 0xBFFFFFFF, 0x0000000100000000ull},  // física 64k
    {0xC0000000, 0xDFFFFFFF, 0x0000000100000000ull},  // física 16mb
    {0xE0000000, 0xFFFFFFFF, 0x0000000100001000ull},  // física 4k (+0x1000)
};

typedef uint32_t (*MMIOReadCallback)(void* ppc_context, void* callback_context, uint32_t addr);
typedef void (*MMIOWriteCallback)(void* ppc_context, void* callback_context, uint32_t addr,
                                  uint32_t value);
typedef void (*WatchCallback)(void* context, uint32_t physical_address);

struct MmioRange {
  uint32_t address, mask, size;
  void* context;
  MMIOReadCallback read;
  MMIOWriteCallback write;
};

enum class FaultReason : uint8_t { kUnmapped = 1, kProtection = 2 };
struct Fault { uint32_t address; bool is_write; FaultReason reason; };

// Solo para el control negativo de las pruebas: rompe la semántica a propósito.
enum class Sabotage : int { kNone = 0, kIndependentCopies = 1, kNoE0Offset = 2 };

inline uint32_t bswap(uint8_t v) { return v; }
inline uint16_t bswap(uint16_t v) { return __builtin_bswap16(v); }
inline uint32_t bswap(uint32_t v) { return __builtin_bswap32(v); }
inline uint64_t bswap(uint64_t v) { return __builtin_bswap64(v); }

class GuestMemory {
 public:
  explicit GuestMemory(uint32_t arena_bytes, Sabotage sabotage = Sabotage::kNone)
      : sabotage_(sabotage) {
    table_ = static_cast<uint32_t*>(std::calloc(kGuestPages, sizeof(uint32_t)));
    file_to_arena_ = static_cast<uint32_t*>(std::calloc(kFilePages, sizeof(uint32_t)));
    file_watch_ = static_cast<uint8_t*>(std::calloc(kFilePages, 1));
    arena_pages_ = arena_bytes >> kPageShift;
    arena_ = static_cast<uint8_t*>(std::aligned_alloc(kPageSize, size_t(arena_pages_) << kPageShift));
    ok_ = table_ && file_to_arena_ && file_watch_ && arena_;
  }
  ~GuestMemory() { std::free(table_); std::free(file_to_arena_); std::free(file_watch_); std::free(arena_); }
  GuestMemory(const GuestMemory&) = delete;
  GuestMemory& operator=(const GuestMemory&) = delete;

  bool ok() const { return ok_; }

  // Dirección guest -> página del archivo de respaldo, con la misma regla que map_info.
  uint32_t FilePageOf(uint32_t va) const {
    if (sabotage_ == Sabotage::kIndependentCopies) return va >> kPageShift;  // como mmap en Emscripten
    for (const View& v : kViews) {
      if (va >= v.start && va <= v.end) {
        uint64_t target = v.target;
        if (sabotage_ == Sabotage::kNoE0Offset && v.start == 0xE0000000) target = 0x100000000ull;
        uint64_t f = (target + (va - v.start)) >> kPageShift;
        return f < kFilePages ? uint32_t(f) : kNoPage;
      }
    }
    return kNoPage;
  }
  uint32_t FilePageOfPhysical(uint32_t pa) const {
    return uint32_t((0x100000000ull + (pa & 0x1FFFFFFF)) >> kPageShift);
  }

  // Equivalente a confirmar páginas en un heap: después son accesibles por todas sus vistas.
  bool Commit(uint32_t va, uint32_t size, uint32_t prot = kProtRW) {
    for (uint64_t a = va & ~kPageOffsetMask; a < uint64_t(va) + size; a += kPageSize) {
      uint32_t fp = FilePageOf(uint32_t(a));
      if (fp == kNoPage) return false;
      uint32_t ap = ArenaPageFor(fp, true);
      if (ap == kNoPage) return false;
      table_[a >> kPageShift] = (ap << kPageShift) | prot | kKindRam;
    }
    return true;
  }

  // Rango reservado cuyas páginas se confirman al primer acceso (como un heap grande reservado,
  // sin gastar el arena en páginas que nunca se tocan).
  void AutoCommit(uint32_t va, uint32_t size) {
    auto_lo_ = va;
    auto_hi_ = va + size;
  }

  // REX_RAW_ADDR: puntero al host para accesos que no cruzan página (lvx/stvx alineados a 16).
  // Si la dirección falla devuelve un bloque descartable, como el acceso que el nativo no completa.
  uint8_t* RawAddr(uint32_t va, bool is_write = false) {
#ifdef REXWASM_SABOTAGE_RAW  // solo control negativo: apunta al bloque de 16 bytes vecino
    va ^= 0x10;
#endif
    uint32_t e = table_[va >> kPageShift];
    if ((e & kKindMask) == kKindRam && (e & (is_write ? kProtWrite : kProtRead)))
      return arena_ + (e & ~kPageOffsetMask) + (va & kPageOffsetMask);
    uint8_t* p = HostByte(va, is_write);
    if (p) return p;
    std::memset(scratch_, 0, sizeof(scratch_));
    return scratch_ + (va & 15);
  }

  // Equivalente a mprotect sobre UNA vista (las otras vistas conservan su protección).
  void Protect(uint32_t va, uint32_t size, uint32_t prot) {
    for (uint64_t a = va & ~kPageOffsetMask; a < uint64_t(va) + size; a += kPageSize) {
      uint32_t& e = table_[a >> kPageShift];
      if ((e & kKindMask) == kKindNone) Resolve(uint32_t(a));
      if ((e & kKindMask) == kKindRam) e = (e & ~kProtRW) | prot;
    }
  }

  // Misma firma que Memory::AddVirtualMappedRange.
  bool AddVirtualMappedRange(uint32_t address, uint32_t mask, uint32_t size, void* context,
                             MMIOReadCallback read, MMIOWriteCallback write) {
    if (mmio_count_ == kMaxMmio) return false;
    uint32_t index = mmio_count_++;
    mmio_[index] = {address, mask, size, context, read, write};
    for (uint64_t a = address; a <= uint64_t(address) + size; a += kPageSize)
      table_[a >> kPageShift] = (index << kPageShift) | kKindMmio;
    return true;
  }

  // Reemplaza las guardas de escritura físicas (mprotect + SIGSEGV) de la caché de texturas.
  // La vigilancia es de la página FÍSICA, así que salta por cualquier alias.
  void WatchPhysicalWrite(uint32_t pa, WatchCallback cb, void* context) {
    uint32_t fp = FilePageOfPhysical(pa);
    file_watch_[fp] = 1;
    watch_cb_ = cb;
    watch_ctx_ = context;
    InvalidateAliases(fp);  // las entradas cacheadas pasan por la ruta lenta
  }

  template <typename T>
  T Load(uint32_t va) {
    uint32_t e = table_[va >> kPageShift];
    if ((e & (kKindMask | kProtRead)) == (kKindRam | kProtRead) &&
        (va & kPageOffsetMask) <= kPageSize - sizeof(T)) {
      T v;
      std::memcpy(&v, arena_ + (e & ~kPageOffsetMask) + (va & kPageOffsetMask), sizeof(T));
#ifdef REXWASM_SABOTAGE_ENDIAN  // solo control negativo: carga sin convertir de big-endian
      return v;
#endif
      return T(bswap(v));
    }
    return LoadSlow<T>(va);
  }

  template <typename T>
  void Store(uint32_t va, T value) {
    uint32_t e = table_[va >> kPageShift];
    if ((e & (kKindMask | kProtWrite)) == (kKindRam | kProtWrite) &&
        (va & kPageOffsetMask) <= kPageSize - sizeof(T)) {
      T v = T(bswap(value));
      std::memcpy(arena_ + (e & ~kPageOffsetMask) + (va & kPageOffsetMask), &v, sizeof(T));
      return;
    }
    StoreSlow<T>(va, value);
  }

  // Memory::TranslatePhysical: devuelve el byte de la página física (sin pasar por vistas).
  uint8_t PeekPhysical(uint32_t pa) const {
    uint32_t ap = file_to_arena_[FilePageOfPhysical(pa)];
    return ap ? arena_[(size_t(ap - 1) << kPageShift) + (pa & kPageOffsetMask)] : 0;
  }

  uint32_t fault_count() const { return fault_count_; }
  Fault last_fault() const { return last_fault_; }
  uint32_t arena_pages_used() const { return arena_used_; }

 private:
  static constexpr uint32_t kMaxMmio = 8;

  uint32_t ArenaPageFor(uint32_t fp, bool allocate) {
    if (file_to_arena_[fp]) return file_to_arena_[fp] - 1;
    if (!allocate || arena_used_ == arena_pages_) return kNoPage;
    uint32_t ap = arena_used_++;
    std::memset(arena_ + (size_t(ap) << kPageShift), 0, kPageSize);
    file_to_arena_[fp] = ap + 1;
    return ap;
  }

  void InvalidateAliases(uint32_t fp) {
    uint64_t file_addr = uint64_t(fp) << kPageShift;
    for (const View& v : kViews) {
      uint64_t span = v.end - v.start;
      if (file_addr >= v.target && file_addr - v.target <= span) {
        uint32_t& e = table_[(v.start + (file_addr - v.target)) >> kPageShift];
        if ((e & kKindMask) == kKindRam) e = kKindNone;
      }
    }
  }

  // Ruta lenta: completa alias que todavía no tienen entrada.
  uint32_t Resolve(uint32_t va) {
    uint32_t& e = table_[va >> kPageShift];
    if ((e & kKindMask) != kKindNone) return e;
    uint32_t fp = FilePageOf(va);
    if (fp == kNoPage || file_watch_[fp]) return e;
    uint32_t ap = ArenaPageFor(fp, va >= auto_lo_ && va < auto_hi_);
    if (ap != kNoPage) e = (ap << kPageShift) | kProtRW | kKindRam;
    return e;
  }

  void RecordFault(uint32_t va, bool is_write, FaultReason reason) {
    ++fault_count_;
    last_fault_ = {va, is_write, reason};
  }

  // nullptr si el acceso falla (y queda registrado). Atiende vigilancias de escritura.
  uint8_t* HostByte(uint32_t va, bool is_write) {
    uint32_t e = Resolve(va);
    if ((e & kKindMask) == kKindNone) {
      uint32_t fp = FilePageOf(va);
      if (fp != kNoPage && file_watch_[fp] && file_to_arena_[fp]) {
        if (is_write) {
          file_watch_[fp] = 0;
          if (watch_cb_) watch_cb_(watch_ctx_, uint32_t((uint64_t(fp) << kPageShift) - 0x100000000ull));
        }
        uint8_t* p = arena_ + (size_t(file_to_arena_[fp] - 1) << kPageShift) + (va & kPageOffsetMask);
        if (is_write) Resolve(va);
        return p;
      }
      RecordFault(va, is_write, FaultReason::kUnmapped);
      return nullptr;
    }
    if ((e & kKindMask) != kKindRam) return nullptr;
    if (!(e & (is_write ? kProtWrite : kProtRead))) {
      RecordFault(va, is_write, FaultReason::kProtection);
      return nullptr;
    }
    return arena_ + (e & ~kPageOffsetMask) + (va & kPageOffsetMask);
  }

  MmioRange* MmioFor(uint32_t va) {
    uint32_t e = table_[va >> kPageShift];
    if ((e & kKindMask) != kKindMmio) return nullptr;
    MmioRange& r = mmio_[e >> kPageShift];
    return (va & r.mask) == r.address ? &r : nullptr;
  }

  template <typename T>
  T LoadSlow(uint32_t va) {
    if (MmioRange* r = MmioFor(va)) {  // misma regla que REX_MM_LOAD_*
      if constexpr (sizeof(T) == 8) {
        uint64_t hi = r->read(nullptr, r->context, va), lo = r->read(nullptr, r->context, va + 4);
        return T((hi << 32) | lo);
      } else {
        return T(r->read(nullptr, r->context, va));
      }
    }
    // Big-endian byte a byte: sirve para accesos que cruzan páginas con traducciones distintas.
    uint64_t v = 0;
    for (uint32_t i = 0; i < sizeof(T); ++i) {
      uint8_t* p = HostByte(va + i, false);
      if (!p) return T(0);
      v = (v << 8) | *p;
    }
    return T(v);
  }

  template <typename T>
  void StoreSlow(uint32_t va, T value) {
    if (MmioRange* r = MmioFor(va)) {  // misma regla que REX_MM_STORE_*
      if constexpr (sizeof(T) == 8) {
        r->write(nullptr, r->context, va, uint32_t(uint64_t(value) >> 32));
        r->write(nullptr, r->context, va + 4, uint32_t(value));
      } else {
        r->write(nullptr, r->context, va, uint32_t(value));
      }
      return;
    }
    uint8_t* bytes[sizeof(T)];
    for (uint32_t i = 0; i < sizeof(T); ++i)  // validar todo antes de escribir: sin escrituras parciales
      if (!(bytes[i] = HostByte(va + i, true))) return;
    for (uint32_t i = 0; i < sizeof(T); ++i)
      *bytes[i] = uint8_t(uint64_t(value) >> (8 * (sizeof(T) - 1 - i)));
  }

  Sabotage sabotage_;
  bool ok_ = false;
  uint32_t* table_ = nullptr;
  uint32_t* file_to_arena_ = nullptr;
  uint8_t* file_watch_ = nullptr;
  uint8_t* arena_ = nullptr;
  uint32_t arena_pages_ = 0, arena_used_ = 0;
  MmioRange mmio_[kMaxMmio] = {};
  uint32_t mmio_count_ = 0;
  WatchCallback watch_cb_ = nullptr;
  void* watch_ctx_ = nullptr;
  uint32_t fault_count_ = 0;
  Fault last_fault_ = {};
  uint32_t auto_lo_ = 0, auto_hi_ = 0;
  alignas(16) uint8_t scratch_[32] = {};
};

inline GuestMemory* g_mem = nullptr;

}  // namespace rexwasm

// Sustitutos de las macros de pch_h.inja. `base` queda sin usar: la traducción la hace g_mem.
#define REX_LOAD_U8(x) ::rexwasm::g_mem->Load<uint8_t>((uint32_t)(x))
#define REX_LOAD_U16(x) ::rexwasm::g_mem->Load<uint16_t>((uint32_t)(x))
#define REX_LOAD_U32(x) ::rexwasm::g_mem->Load<uint32_t>((uint32_t)(x))
#define REX_LOAD_U64(x) ::rexwasm::g_mem->Load<uint64_t>((uint32_t)(x))
#define REX_STORE_U8(x, y) ::rexwasm::g_mem->Store<uint8_t>((uint32_t)(x), (uint8_t)(y))
#define REX_STORE_U16(x, y) ::rexwasm::g_mem->Store<uint16_t>((uint32_t)(x), (uint16_t)(y))
#define REX_STORE_U32(x, y) ::rexwasm::g_mem->Store<uint32_t>((uint32_t)(x), (uint32_t)(y))
#define REX_STORE_U64(x, y) ::rexwasm::g_mem->Store<uint64_t>((uint32_t)(x), (uint64_t)(y))
#define REX_RAW_ADDR(x) ::rexwasm::g_mem->RawAddr((uint32_t)(x))
// Toda carga/guardado ya consulta la tabla, así que las variantes MMIO son las mismas.
#define REX_MM_LOAD_U8 REX_LOAD_U8
#define REX_MM_LOAD_U16 REX_LOAD_U16
#define REX_MM_LOAD_U32 REX_LOAD_U32
#define REX_MM_LOAD_U64 REX_LOAD_U64
#define REX_MM_STORE_U8 REX_STORE_U8
#define REX_MM_STORE_U16 REX_STORE_U16
#define REX_MM_STORE_U32 REX_STORE_U32
#define REX_MM_STORE_U64 REX_STORE_U64
