// Claude 2026-10-17: fuentes de la copia artifacts/d1-wasm/interruptores (base sinsombra = c1strum-pub + escena sin sombras).
// gh3_recomp.2 parte de la de c1strum-pub (ya tiene el juicio C1); .0/.13/.14/.23 del código generado original.
import fs from 'node:fs';
const GEN = 'artifacts/xex-adapt/paso-b/gh3-variant/generated/variant-dd2ca1ab', T = 'artifacts/d1-wasm/interruptores';
const rep = (s, a, b) => { if (s.split(a).length !== 2) throw Error('Ancla no única: ' + a.slice(0, 90)); return s.replace(a, b); };
const fn = (code, name, edit) => { const a = code.indexOf('DEFINE_REX_FUNC(' + name + ')'), b = code.indexOf('DEFINE_REX_FUNC(', a + 10);
  if (a < 0) throw Error(name); return code.slice(0, a) + edit(code.slice(a, b)) + code.slice(b); };
fs.mkdirSync(T + '/src', {recursive: true});
const files = {
  2: ['artifacts/d1-wasm/c1strum-pub/src/gh3_recomp.2.cpp', c => {
    c = fn(c, 'sub_82113830', f => rep(f, '\tctx.cr6.compare<uint32_t>(ctx.r11.u32, ctx.r24.u32, ctx.xer);', '\tctx.r11.u64 = gh3sw_crowd(ctx.r11.u32, ctx.r24.u32);\n\tctx.cr6.compare<uint32_t>(ctx.r11.u32, ctx.r24.u32, ctx.xer);'));
    return fn(c, 'sub_821289E0', f => rep(f, 'loc_82128A38:\n', 'loc_82128A38:\n\tctx.r11.s64 = gh3sw_light(ctx.r11.s64);\n')); }],
  0: [GEN + '/gh3_recomp.0.cpp', c => fn(c, 'sub_820ED820', f => rep(f, '\tctx.r4.u64 = ctx.r11.u64 ^ 1;\n', '\tctx.r4.u64 = gh3sw_toggle(ctx.r11.u64 ^ 1);\n'))],
  14: [GEN + '/gh3_recomp.14.cpp', c => fn(c, 'sub_8227B4F0', f => rep(f, '\tctx.f1.f64 = ctx.f31.f64;\n', '\tctx.f1.f64 = gh3sw_viewer(ctx.f31.f64);\n'))],
  13: [GEN + '/gh3_recomp.13.cpp', c => fn(c, 'sub_8226B060', f => rep(f, 'loc_8226B09C:\n', 'loc_8226B09C:\n\tctx.r3.s64 = gh3sw_bone(ctx.r3.s64);\n'))],
  23: [GEN + '/gh3_recomp.23.cpp', c => fn(c, 'sub_823812B8', f => rep(f, '\tREX_FUNC_PROLOGUE();\n', '\tREX_FUNC_PROLOGUE();\n\tgh3sw_tick();\n'))],
};
for (const [n, [src, edit]] of Object.entries(files)) {
  const c = fs.readFileSync(src, 'utf8').replaceAll('\r\n', '\n');
  fs.writeFileSync(`${T}/src/gh3_recomp.${n}.cpp`, '#include "gh3_sw.h"\n' + edit(c));
}
console.log('ok', Object.keys(files).join(','));
