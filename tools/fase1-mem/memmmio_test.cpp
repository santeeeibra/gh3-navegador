// Prueba mínima de memoria espejada y MMIO del guest Xbox 360 en WebAssembly.
// No usa ningún archivo de Guitar Hero. Modo 0: semántica correcta. Modos 1 y 2: controles
// negativos (la semántica se rompe a propósito y las pruebas de alias tienen que fallar).
#include <chrono>
#include <cstdio>
#include <emscripten.h>

#include "rex_wasm_memory.h"

using rexwasm::GuestMemory;
using rexwasm::Sabotage;

namespace {

int g_pass = 0, g_fail = 0;

void Check(const char* name, bool ok, const char* fmt = "", uint64_t a = 0, uint64_t b = 0) {
  (ok ? g_pass : g_fail)++;
  std::printf("%s %s", ok ? "PASS" : "FAIL", name);
  if (*fmt) { std::printf(" :: "); std::printf(fmt, (unsigned long long)a, (unsigned long long)b); }
  std::printf("\n");
}

// Registros falsos de la GPU (Xenos) y del APU/XMA para comprobar el despacho MMIO.
struct FakeDevice {
  uint32_t regs[0x4000] = {};
  uint32_t reads = 0, writes = 0;
  uint32_t log_addr[8] = {}, log_value[8] = {};
};
uint32_t DevRead(void*, void* ctx, uint32_t addr) {
  auto* d = static_cast<FakeDevice*>(ctx);
  d->reads++;
  return d->regs[(addr & 0xFFFF) >> 2];
}
void DevWrite(void*, void* ctx, uint32_t addr, uint32_t value) {
  auto* d = static_cast<FakeDevice*>(ctx);
  if (d->writes < 8) { d->log_addr[d->writes] = addr; d->log_value[d->writes] = value; }
  d->writes++;
  d->regs[(addr & 0xFFFF) >> 2] = value;
}

struct WatchLog { uint32_t hits = 0, last = 0; };
void OnWatch(void* ctx, uint32_t pa) { auto* w = static_cast<WatchLog*>(ctx); w->hits++; w->last = pa; }

// Forma del código que emite rexglue: registros en ctx y accesos con las macros REX_*.
union PPCRegister { uint32_t u32; uint64_t u64; };
struct PPCContext { PPCRegister r3, r4, r5, r11, r12; };
void sub_copy_words(PPCContext& ctx, uint8_t* base) {
  (void)base;
  while (ctx.r5.u32 != 0) {
    ctx.r11.u64 = REX_LOAD_U32(ctx.r3.u32);
    REX_STORE_U32(ctx.r4.u32, ctx.r11.u32);
    ctx.r3.u32 += 4; ctx.r4.u32 += 4; ctx.r5.u32 -= 1;
  }
}
void sub_gpu_kick(PPCContext& ctx, uint8_t* base) {
  (void)base;
  ctx.r12.u32 = 0x7FC80000;               // lis r12,0x7FC8
  REX_MM_STORE_U32(ctx.r12.u32 + 0x0714, ctx.r3.u32);  // stw r3,0x714(r12)
  ctx.r11.u64 = REX_MM_LOAD_U32(ctx.r12.u32 + 0x0714); // lwz r11,0x714(r12)
}

int RunSuite(Sabotage mode) {
  g_pass = g_fail = 0;
  GuestMemory mem(16u << 20, mode);
  if (!mem.ok()) { std::printf("FAIL init :: sin memoria\n"); return 1; }
  rexwasm::g_mem = &mem;
  uint8_t* base = nullptr;

  // 1. Alias de la memoria física: A0 / C0 / 7F / E0(+0x1000) / TranslatePhysical.
  mem.Commit(0xA0010000, 0x10000);
  REX_STORE_U32(0xA0010010, 0xCAFEBABEu);
  Check("fisica A0->C0", REX_LOAD_U32(0xC0010010) == 0xCAFEBABEu, "leido=%llx", REX_LOAD_U32(0xC0010010));
  Check("fisica A0->7F (GPU writeback)", REX_LOAD_U32(0x7F010010) == 0xCAFEBABEu, "leido=%llx", REX_LOAD_U32(0x7F010010));
  Check("fisica A0->E0 con +0x1000", REX_LOAD_U32(0xE000F010) == 0xCAFEBABEu, "leido=%llx", REX_LOAD_U32(0xE000F010));
  Check("TranslatePhysical(0x10010)", mem.PeekPhysical(0x10010) == 0xCA, "byte=%llx", mem.PeekPhysical(0x10010));
  REX_STORE_U16(0xE000F014, 0xBEEF);
  Check("escritura por E0 vista en A0", REX_LOAD_U16(0xA0010014) == 0xBEEF, "leido=%llx", REX_LOAD_U16(0xA0010014));

  // 2. Alias de la imagen xex: 0x9xxxxxxx == 0x8xxxxxxx.
  mem.Commit(0x82000000, 0x1000);
  REX_STORE_U32(0x82000100, 0x48000010u);
  Check("xex 0x82000100->0x92000100", REX_LOAD_U32(0x92000100) == 0x48000010u, "leido=%llx", REX_LOAD_U32(0x92000100));

  // 3. Lo que NO es alias tiene que seguir separado.
  mem.Commit(0x00010000, 0x1000);
  mem.Commit(0x40010000, 0x1000);
  REX_STORE_U32(0x00010000, 0x11111111u);
  REX_STORE_U32(0x40010000, 0x22222222u);
  Check("virtual 0x00010000 independiente", REX_LOAD_U32(0x00010000) == 0x11111111u, "leido=%llx", REX_LOAD_U32(0x00010000));
  Check("virtual 0x40010000 independiente", REX_LOAD_U32(0x40010000) == 0x22222222u, "leido=%llx", REX_LOAD_U32(0x40010000));
  Check("fisica no pisada por virtual", REX_LOAD_U32(0xA0010010) == 0xCAFEBABEu, "leido=%llx", REX_LOAD_U32(0xA0010010));

  // 4. Orden big-endian, igual que __builtin_bswap en las macros nativas.
  REX_STORE_U32(0xA0011000, 0x11223344u);
  Check("big-endian bytes", REX_LOAD_U8(0xA0011000) == 0x11 && REX_LOAD_U8(0xA0011003) == 0x44,
        "b0=%llx b3=%llx", REX_LOAD_U8(0xA0011000), REX_LOAD_U8(0xA0011003));
  REX_STORE_U64(0xA0011008, 0x0102030405060708ull);
  Check("big-endian u64", REX_LOAD_U32(0xC0011008) == 0x01020304u && REX_LOAD_U32(0xC001100C) == 0x05060708u,
        "hi=%llx lo=%llx", REX_LOAD_U32(0xC0011008), REX_LOAD_U32(0xC001100C));

  // 5. Acceso que cruza el borde de página (ruta lenta byte a byte).
  REX_STORE_U32(0xA0012FFE, 0xA1B2C3D4u);
  Check("cruce de pagina A0", REX_LOAD_U32(0xA0012FFE) == 0xA1B2C3D4u, "leido=%llx", REX_LOAD_U32(0xA0012FFE));
  Check("cruce de pagina leido por E0", REX_LOAD_U32(0xE0011FFE) == 0xA1B2C3D4u, "leido=%llx", REX_LOAD_U32(0xE0011FFE));

  // 6. Alias resuelto de forma diferida (la página se confirmó solo por A0).
  mem.Commit(0xA0300000, 0x1000);
  REX_STORE_U32(0xA0300040, 0x5EED5EEDu);
  Check("alias diferido C0", REX_LOAD_U32(0xC0300040) == 0x5EED5EEDu, "leido=%llx", REX_LOAD_U32(0xC0300040));

  // 7. Accesos sin mapear: fallo registrado en lugar de SIGSEGV, sin cuelgue.
  uint32_t f0 = mem.fault_count();
  uint32_t v = REX_LOAD_U32(0x30000000);
  Check("lectura sin mapear -> fallo", v == 0 && mem.fault_count() == f0 + 1 && mem.last_fault().address == 0x30000000,
        "fallos=%llu dir=%llx", mem.fault_count() - f0, mem.last_fault().address);
  REX_STORE_U32(0x30000000, 1);
  Check("escritura sin mapear -> fallo", mem.fault_count() == f0 + 2 && mem.last_fault().is_write, "fallos=%llu", mem.fault_count() - f0);

  // 8. Guarda de protección (sustituye mprotect + SIGSEGV).
  mem.Protect(0x00010000, 0x1000, rexwasm::kProtRead);
  f0 = mem.fault_count();
  REX_STORE_U32(0x00010000, 0xDEADDEADu);
  Check("escritura en pagina de solo lectura bloqueada",
        REX_LOAD_U32(0x00010000) == 0x11111111u && mem.fault_count() == f0 + 1 &&
            mem.last_fault().reason == rexwasm::FaultReason::kProtection,
        "valor=%llx fallos=%llu", REX_LOAD_U32(0x00010000), mem.fault_count() - f0);
  REX_STORE_U32(0x00010FFE, 0xDEADDEADu);  // cruza a una página sin mapear: no escribe nada
  Check("sin escritura parcial al fallar", REX_LOAD_U16(0x00010FFE) == 0, "leido=%llx", REX_LOAD_U16(0x00010FFE));
  mem.Protect(0x00010000, 0x1000, rexwasm::kProtRW);
  REX_STORE_U32(0x00010000, 0x33333333u);
  Check("escritura tras restaurar RW", REX_LOAD_U32(0x00010000) == 0x33333333u, "leido=%llx", REX_LOAD_U32(0x00010000));

  // 9. MMIO de la GPU en 0x7FC80000 (misma llamada que graphics_system.cpp).
  static FakeDevice gpu, apu;
  gpu = FakeDevice{}; apu = FakeDevice{};
  mem.Commit(0xA0C80000, 0x1000);  // física 0xC80000 = lo que 0x7FC80000 tocaría sin MMIO
  REX_STORE_U32(0xA0C80714, 0x5A5A5A5Au);
  mem.AddVirtualMappedRange(0x7FC80000, 0xFFFF0000, 0x0000FFFF, &gpu, DevRead, DevWrite);
  mem.AddVirtualMappedRange(0x7FEA0000, 0xFFFF0000, 0x0000FFFF, &apu, DevRead, DevWrite);
  PPCContext ctx{};
  ctx.r3.u32 = 0x00C0FFEE;
  sub_gpu_kick(ctx, base);
  Check("MMIO GPU escritura despachada", gpu.writes == 1 && gpu.log_addr[0] == 0x7FC80714 && gpu.log_value[0] == 0x00C0FFEE,
        "writes=%llu valor=%llx", gpu.writes, gpu.log_value[0]);
  Check("MMIO GPU lectura despachada", ctx.r11.u32 == 0x00C0FFEE && gpu.reads == 1, "leido=%llx reads=%llu", ctx.r11.u32, gpu.reads);
  Check("MMIO no toca la RAM fisica", REX_LOAD_U32(0xA0C80714) == 0x5A5A5A5Au, "ram=%llx", REX_LOAD_U32(0xA0C80714));
  REX_STORE_U32(0x7FC80800, 7);  // macro sin MM_: igual pasa por el manejador (no hace falta SIGSEGV)
  Check("MMIO desde REX_STORE_U32 comun", gpu.writes == 2 && gpu.regs[0x800 >> 2] == 7, "writes=%llu", gpu.writes);
  REX_STORE_U64(0x7FEA0010, 0xAAAABBBBCCCCDDDDull);
  Check("MMIO XMA u64 = dos escrituras hi/lo",
        apu.writes == 2 && apu.log_addr[0] == 0x7FEA0010 && apu.log_value[0] == 0xAAAABBBB &&
            apu.log_addr[1] == 0x7FEA0014 && apu.log_value[1] == 0xCCCCDDDD,
        "hi=%llx lo=%llx", apu.log_value[0], apu.log_value[1]);
  Check("MMIO XMA no llega a la GPU", gpu.writes == 2, "gpu.writes=%llu", gpu.writes);

  // 10. Vigilancia de escritura física (caché de texturas): salta por cualquier alias, una vez.
  static WatchLog watch;
  watch = WatchLog{};
  mem.Commit(0xA0040000, 0x1000);
  REX_STORE_U32(0xA0040000, 1);
  (void)REX_LOAD_U32(0xC0040000);  // deja la entrada de C0 resuelta antes de vigilar
  mem.WatchPhysicalWrite(0x40000, OnWatch, &watch);
  Check("lectura no dispara vigilancia", REX_LOAD_U32(0xC0040000) == 1 && watch.hits == 0, "hits=%llu", watch.hits);
  REX_STORE_U32(0xE003F004, 0xFEEDu);  // E0 + 0x1000 -> física 0x40004
  Check("escritura por alias dispara vigilancia", watch.hits == 1 && watch.last == 0x40000, "hits=%llu pagina=%llx", watch.hits, watch.last);
  Check("dato escrito tras vigilancia", REX_LOAD_U32(0xA0040004) == 0xFEEDu, "leido=%llx", REX_LOAD_U32(0xA0040004));
  REX_STORE_U32(0xC0040008, 2);
  Check("vigilancia de un solo disparo", watch.hits == 1, "hits=%llu", watch.hits);

  // 11. Función con la forma del código generado copiando de física a virtual.
  mem.Commit(0xA0050000, 0x1000);
  for (uint32_t i = 0; i < 16; ++i) REX_STORE_U32(0xA0050000 + i * 4, 0x1000 + i);
  mem.Commit(0x40020000, 0x1000);
  ctx.r3.u32 = 0xC0050000; ctx.r4.u32 = 0x40020000; ctx.r5.u32 = 16;
  sub_copy_words(ctx, base);
  bool same = true;
  for (uint32_t i = 0; i < 16; ++i) same &= REX_LOAD_U32(0x40020000 + i * 4) == 0x1000 + i;
  Check("funcion estilo rexglue copia C0->virtual", same, "ultimo=%llx", REX_LOAD_U32(0x4002003C));

  std::printf("RESULT pass=%d fail=%d faults=%u arena_pages=%u\n", g_pass, g_fail, mem.fault_count(), mem.arena_pages_used());

  if (mode == Sabotage::kNone) {  // costo de la traducción frente a un acceso plano
    constexpr uint32_t N = 1u << 22;
    mem.Commit(0x40100000, 0x100000);
    auto t0 = std::chrono::steady_clock::now();
    uint32_t acc = 0;
    for (uint32_t i = 0; i < N; ++i) {
      uint32_t a = 0x40100000 + ((i * 4) & 0xFFFFC);
      REX_STORE_U32(a, i);
      acc += REX_LOAD_U32(a);
    }
    double t_tr = std::chrono::duration<double, std::nano>(std::chrono::steady_clock::now() - t0).count() / N;
    static uint8_t flat[0x100000];
    t0 = std::chrono::steady_clock::now();
    for (uint32_t i = 0; i < N; ++i) {
      uint32_t o = (i * 4) & 0xFFFFC;
      *(volatile uint32_t*)(flat + o) = __builtin_bswap32(i);
      acc += __builtin_bswap32(*(volatile uint32_t*)(flat + o));
    }
    double t_flat = std::chrono::duration<double, std::nano>(std::chrono::steady_clock::now() - t0).count() / N;
    std::printf("BENCH store+load u32: traducido=%.2f ns plano=%.2f ns (x%.2f) acc=%u\n", t_tr, t_flat, t_tr / t_flat, acc);
  }
  rexwasm::g_mem = nullptr;
  return g_fail;
}

}  // namespace

extern "C" EMSCRIPTEN_KEEPALIVE int run_mode(int mode) {
  static const char* names[] = {"normal", "control negativo: copias independientes (como mmap de Emscripten)",
                                "control negativo: sin desplazamiento +0x1000 de E0"};
  std::printf("== modo %d: %s ==\n", mode, names[mode]);
  return RunSuite(static_cast<Sabotage>(mode));
}

int main() { return 0; }
