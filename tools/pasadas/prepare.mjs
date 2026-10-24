// Claude 2026-10-17: fuentes de la copia de diagnóstico artifacts/d1-wasm/pasadas (NO publicable).
// 1) gh3_recomp.18.cpp: cada llamada dentro de sub_822F0AD0 queda envuelta en pas_run(K) (tools/pasadas/pasadas.h).
// 2) r5_frame.cpp = tools/sinescena/r5_frame.cpp + conteo de dibujos por ventana ([pas] en el registro).
import fs from 'node:fs';
const T = 'artifacts/d1-wasm/pasadas';
const GEN = 'artifacts/xex-adapt/paso-b/gh3-variant/generated/variant-dd2ca1ab/gh3_recomp.18.cpp';
fs.mkdirSync(T + '/src', {recursive: true});
let code = fs.readFileSync(GEN, 'utf8').replaceAll('\r\n', '\n');
const a = code.indexOf('DEFINE_REX_FUNC(sub_822F0AD0)'), b = code.indexOf('DEFINE_REX_FUNC(', a + 10);
if (a < 0) throw Error('No está sub_822F0AD0');
let f = code.slice(a, b), k = 0;
const sites = [];
f = f.replace(/\tctx\.lr = (0x[0-9A-F]+);\n\t(sub_8[0-9A-F]+\(ctx, base\)|REX_CALL_INDIRECT_FUNC\(ctx\.ctr\.u32\));/g, (m, lr, call) => {
  sites.push({k, lr, call: call.startsWith('sub_') ? call.slice(0, 12) : 'indirecta'});
  return `\tctx.lr = ${lr};\n\tif (pas_run(${k++})) ${call};`;
});
if (k !== 47) throw Error('Se esperaban 47 llamadas, hay ' + k);
code = '#include "pasadas.h"\n' + code.slice(0, a) + f + code.slice(b);
fs.writeFileSync(T + '/src/gh3_recomp.18.cpp', code);
fs.writeFileSync(T + '/sitios.json', JSON.stringify(sites, null, 1));

let r = fs.readFileSync('tools/sinescena/r5_frame.cpp', 'utf8');
const rep = (s, x, y) => { if (s.split(x).length !== 2) throw Error('Ancla no única: ' + x.slice(0, 60)); return s.replace(x, y); };
r = rep(r, '#include "r5_frame.h"\n', `#include "r5_frame.h"
#include <unordered_map>
#include "D:/guitar hero/tools/pasadas/pasadas.h"
// [pas] dibujos por ventana (Claude 2026-10-17, diagnóstico): se descartan los primeros 0,15 s de cada ventana (retraso CP).
static int pas_w = -2; static uint32_t pas_n = 0; static std::unordered_map<uint64_t, uint32_t> pas_vs;
static void pas_note(uint64_t vs) {
  const int w = pas_window_now();
  if (w != pas_w) {
    if (pas_w >= 0 && pas_n) {
      std::string s; char buf[48];
      for (auto& [h, c] : pas_vs) { std::snprintf(buf, sizeof buf, "%s\\"%016llX\\":%u", s.empty() ? "" : ",", (unsigned long long)h, c); s += buf; }
      std::fprintf(stderr, "[pas] {\\"w\\":%d,\\"draws\\":%u,\\"vs\\":{%s}}\\n", pas_w, pas_n, s.c_str());
    }
    pas_w = w; pas_n = 0; pas_vs.clear();
  }
  if (w < 0) return;
  const uint32_t u = __builtin_bswap32(*(volatile uint32_t*)::rexwasm::Host(0x829B57B0u)); float ms; std::memcpy(&ms, &u, 4); const double t = ms / 1000.0;
  if (t - PAS_T0 - w * PAS_W < 0.15) return;
  pas_n++; pas_vs[vs]++;
}
`);
r = rep(r, '  const bool issued = status == kIssued;\n', '  const bool issued = status == kIssued;\n  if (issued) pas_note(d.vs_hash);\n');
fs.writeFileSync('tools/pasadas/r5_frame.cpp', r);
console.log(T, k, 'llamadas');
