// Claude 2026-10-16: fuentes de la copia PUBLICABLE del rasgueo nuevo (artifacts/d1-wasm/c1strum-pub), sobre la
// página publicada (artifacts/d1-wasm/lagtest/demo). Código recompilado ORIGINAL + sólo las inserciones del juicio
// (mismos puntos que tools/sincronia/prepare-press.mjs), compilado con -DC1S_SIN_DIAG (sin mensajes por rasgueo).
import fs from 'node:fs';
import {build} from 'esbuild';
const T = 'artifacts/d1-wasm/c1strum-pub', BASE = 'artifacts/d1-wasm/lagtest/demo';
const GEN = 'artifacts/xex-adapt/paso-b/gh3-variant/generated/variant-dd2ca1ab/gh3_recomp.2.cpp';
const rep = (s, a, b) => { if (s.split(a).length !== 2) throw Error('Ancla no única: ' + a.slice(0, 80)); return s.replace(a, b); };
fs.mkdirSync(T + '/src', {recursive: true});
let code = fs.readFileSync(GEN, 'utf8').replaceAll('\r\n', '\n');
code = '#include "press_probe_c1.h"\n' + code;
code = rep(code, 'ctx.lr = 0x8211FADC;\n\tsub_82266240(ctx, base);', 'ctx.lr = 0x8211FADC;\n\tsub_82266240(ctx, base);\n\tsync_press_begin(REX_LOAD_U32(ctx.r1.u32+80),ctx.r29.u32,ctx.f1.f64);');
const a = code.indexOf('DEFINE_REX_FUNC(sub_8211F8B8)'), b = code.indexOf('DEFINE_REX_FUNC(', a + 10);
let f = code.slice(a, b);
f = rep(f, 'ctx.f23.f64 = double(float(ctx.f29.f64 * ctx.f31.f64));', '// f29 sigue siendo el reloj nativo (historial de trastes/sostenidos).\n\tctx.f23.f64 = double(float(sync_press_used_sec * ctx.f31.f64));');
f = rep(f, '// fcmpu cr6,f0,f13\n\tctx.cr6.compare(ctx.f0.f64, ctx.f13.f64);', '// fcmpu cr6,f0,f13\n\tctx.f0.f64=sync_press_expiry(ctx.f0.f64,ctx.f13.f64);\n\tctx.cr6.compare(ctx.f0.f64, ctx.f13.f64);');
code = code.slice(0, a) + f + code.slice(b);
fs.writeFileSync(T + '/src/gh3_recomp.2.cpp', code);

await build({entryPoints: ['tools/c1-strum/c1-strum-page.mjs'], bundle: true, minify: true, format: 'iife', define: {C1STRUM_DEFAULT: '7'}, outfile: T + '/c1-strum-page.js', logLevel: 'warning'});
let input = fs.readFileSync(BASE + '/gh3-input.js', 'utf8');
input = rep(input, 'const s=m&~(n.prev|0);', 'const s=m&~(n.prev|0);if(s&3)window.syncPressWrite?.(m,r.tr,S,Atomics.load(f,0)+1);');
input = rep(input, 'n.pad=t.id,', 'n.pad=t.id,l.padTs=t.timestamp,');
input = rep(input, 'l.attach=(e,t)=>{', 'l.attach=(e,t)=>{window.c1StrumAttach?.(e,t);');
fs.writeFileSync(T + '/gh3-input.js', input);
let html = fs.readFileSync(BASE + '/index.html', 'utf8');
html = rep(html, '<script src="gh3-input.js"></script>', '<script src="c1-strum-page.js"></script>\n<script src="gh3-input.js"></script>');
html = rep(html, '<script src="gh3-notas.js"></script>', '<script src="gh3-notas.js"></script>\n<script src="gh3-novedades.js"></script>');
fs.writeFileSync(T + '/index.html', html);
console.log(T);
