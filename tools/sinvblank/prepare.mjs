// Claude 2026-10-18: copia aislada artifacts/d1-wasm/sinvblank = margen/demo (relojpub + ?margen=) + interruptor ?sinvblank=1.
// Fuente: optim/spin1/src/gh3_recomp.16.cpp (la misma del objeto que usa relojpub, con descanso de 250 µs). Uso: node tools/sinvblank/prepare.mjs && bash tools/sinvblank/build.sh
import fs from 'node:fs';
const T = 'artifacts/d1-wasm/sinvblank';
const rep = (s, a, b) => { if (s.split(a).length !== 2) throw Error('Ancla no única: ' + a.slice(0, 90)); return s.replace(a, b); };
fs.mkdirSync(T + '/src', {recursive: true});
let c = fs.readFileSync('artifacts/d1-wasm/optim/spin1/src/gh3_recomp.16.cpp', 'utf8').replace(/\r\n/g, '\n');
c = '#include "sin_vblank.h"\n' + c;
c = rep(c, 'DEFINE_REX_FUNC(sub_822BF0F8) {\n\tREX_FUNC_PROLOGUE();', 'DEFINE_REX_FUNC(sub_822BF0F8) {\n\tREX_FUNC_PROLOGUE();\n\tdouble sv_t0 = 0, sv_t1 = 0;');
c = rep(c, '\t// beq cr6,0x822bf1a8\n\tif (ctx.cr6.eq) goto loc_822BF1A8;', '\t// beq cr6,0x822bf1a8\n\tif (ctx.cr6.eq) { sv_t1 = sinvblank_now(); goto loc_822BF1A8; }');
c = rep(c, '\tREX_STORE_U64(ctx.r30.u32 + 30880, ctx.r3.u64);\n\t// subf r10,r3,r11\n\tctx.r10.u64 = ctx.r11.u64 - ctx.r3.u64;',
  '\tREX_STORE_U64(ctx.r30.u32 + 30880, ctx.r3.u64);\n\t// subf r10,r3,r11\n\tctx.r10.u64 = ctx.r11.u64 - ctx.r3.u64;\n\tsv_t0 = sinvblank_now();\n\tif (sinvblank_late(ctx.r3.u64, ctx.r11.u64)) goto loc_822BF198;');
c = rep(c, 'loc_822BF198:\n\t// lwz r11,30896(r29)', 'loc_822BF198:\n\tg_svb.vbMs += sinvblank_now() - sv_t0;\n\t// lwz r11,30896(r29)');
c = rep(c, '\tREX_STORE_U64(ctx.r31.u32 + 30888, ctx.r11.u64);\nloc_822BF1A8:', '\tREX_STORE_U64(ctx.r31.u32 + 30888, ctx.r11.u64);\n\tsv_t1 = sinvblank_now();\nloc_822BF1A8:');
c = rep(c, '\tif (ctx.cr6.eq) { gh3_spin_rest(); goto loc_822BF1A8; }\n\t// addi r1,r1,128', '\tif (ctx.cr6.eq) { gh3_spin_rest(); goto loc_822BF1A8; }\n\tg_svb.qMs += sinvblank_now() - sv_t1;\n\t// addi r1,r1,128');
fs.writeFileSync(T + '/src/gh3_recomp.16.cpp', c);
let html = fs.readFileSync('artifacts/d1-wasm/margen/demo/index.html', 'utf8');
html = rep(html, '<script src="gh3-relojaudio.js"></script>', '<script src="gh3-relojaudio.js"></script>\n<script src="gh3-sinvblank.js"></script>');
fs.writeFileSync(T + '/index.html', html);
console.log(T);
