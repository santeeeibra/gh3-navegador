// Prepara las 1458 pruebas PPC generadas por rexglue para compilarlas con Emscripten.
// Variantes:
//   flat: memoria lineal como en Fase 0 (base + dirección), macros originales de ppc_config.h.
//   tr:   memoria con traducción explícita (rex_wasm_memory.h), mismas funciones generadas.
// No modifica los archivos generados: escribe copias en artifacts/fase1-mem/ppc/<variante>/.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'D:/guitar hero';
const GEN = join(ROOT, 'artifacts/fase0/repro/src/generated');
const cases = readFileSync(join(GEN, 'ppc_test_cases.cpp'), 'utf8');

// Bloque get_memory() original: usa rex::memory::Memory (mmap + vistas), que no existe en wasm.
const getMemory = /static rex::memory::Memory& get_memory\(\) \{[\s\S]*?\n\}\n/;
if (!getMemory.test(cases)) throw new Error('No se encontró get_memory() en ppc_test_cases.cpp');

const shims = {
  flat: `#include <cstdlib>
// Memoria lineal (Fase 0): un bloque que cubre 0..0x10020000. Sin alias ni MMIO.
struct TestMem {
  uint8_t* base = static_cast<uint8_t*>(std::aligned_alloc(64, 0x10020000u));
  uint8_t* virtual_membase() { return base; }
};
static TestMem& get_memory() { static TestMem m; return m; }
#define TMEM(a) (memory)[a]
`,
  tr: `#include "rex_wasm_memory.h"
// Memoria traducida: misma reserva que el original (0x10000..0x10010000, lectura/escritura),
// confirmada página por página al primer acceso.
struct TestMem { uint8_t* virtual_membase() { return nullptr; } };
static TestMem& get_memory() {
  static TestMem t;
  static rexwasm::GuestMemory* m = nullptr;
  if (!m) { m = new rexwasm::GuestMemory(64u << 20); m->AutoCommit(0x10000, 0x10000000); rexwasm::g_mem = m; }
  return t;
}
struct ByteRef {
  uint32_t a;
  operator uint8_t() const { return rexwasm::g_mem->Load<uint8_t>(a); }
  ByteRef& operator=(uint8_t v) { rexwasm::g_mem->Store<uint8_t>(a, v); return *this; }
};
#define TMEM(a) (ByteRef{(uint32_t)(a)})
`,
};

for (const variant of ['flat', 'tr']) {
  const out = join(ROOT, 'artifacts/fase1-mem/ppc', variant);
  mkdirSync(out, { recursive: true });
  let c = cases.replace('#include <rex/system/xmemory.h>\n', '').replace(getMemory, shims[variant]);
  let n = 0;
  c = c.replace(/memory\[([^\]]+)\]/g, (_, a) => (n++, `TMEM(${a})`));
  writeFileSync(join(out, 'ppc_test_cases.cpp'), c);
  copyFileSync(join(GEN, 'ppc_test_functions.cpp'), join(out, 'ppc_test_functions.cpp'));
  copyFileSync(join(GEN, 'ppc_test_decls.h'), join(out, 'ppc_test_decls.h'));
  copyFileSync(join(GEN, 'ppc_config.h'), join(out, 'ppc_config_orig.h'));
  writeFileSync(join(out, 'ppc_config.h'), variant === 'flat'
    ? '#pragma once\n#include "ppc_config_orig.h"\n'
    : `#pragma once
#include "ppc_config_orig.h"
// Reemplaza las macros de memoria plana por la traducción explícita.
#undef REX_RAW_ADDR
#undef REX_LOAD_U8
#undef REX_LOAD_U16
#undef REX_LOAD_U32
#undef REX_LOAD_U64
#undef REX_STORE_U8
#undef REX_STORE_U16
#undef REX_STORE_U32
#undef REX_STORE_U64
#undef REX_MM_LOAD_U8
#undef REX_MM_LOAD_U16
#undef REX_MM_LOAD_U32
#undef REX_MM_LOAD_U64
#undef REX_MM_STORE_U8
#undef REX_MM_STORE_U16
#undef REX_MM_STORE_U32
#undef REX_MM_STORE_U64
#include "rex_wasm_memory.h"
`);
  console.log(`${variant}: ${n} accesos memory[] reescritos, ${(c.match(/TEST_CASE\(/g) || []).length} TEST_CASE`);
}
