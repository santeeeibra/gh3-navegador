// sin43 = sin3d + llamada 43 (lr 0x822F0F80) salteable con G1_SIN43=1 (página ?sin43=1; por defecto apagada).
// Claude 2026-10-17 (etapa 2): copia aislada artifacts/d1-wasm/sin3d = sinescena + saltear SOLO la llamada 17 de sub_822F0AD0
// (sub_822ED7D8, lr 0x822F0CE8 = mundo 3D principal, ver artifacts/escena-hud-2026-10-17/RESULTADO-ETAPA1.md) cuando G1_SIN3D=1.
// La página pone sin3d=1 sólo en calidad «muy»; ?sin3d=0 lo apaga (=1 lo fuerza). Nada publicado.
import fs from 'node:fs';
const T = 'artifacts/d1-wasm/sin43';
const rep = (s, a, b) => { if (s.split(a).length !== 2) throw Error('Ancla no única: ' + a.slice(0, 80)); return s.replace(a, b); };
fs.mkdirSync(T + '/src', {recursive: true});
let code = fs.readFileSync('artifacts/xex-adapt/paso-b/gh3-variant/generated/variant-dd2ca1ab/gh3_recomp.18.cpp', 'utf8').replaceAll('\r\n', '\n');
code = rep(code, '\tctx.lr = 0x822F0CE8;\n\tsub_822ED7D8(ctx, base);',
  '\tctx.lr = 0x822F0CE8;\n\t{ static const bool sin3d = [] { const char* e = std::getenv("G1_SIN3D"); return e && e[0] == \'1\'; }();  // SIN3D\n\t  if (!sin3d) sub_822ED7D8(ctx, base); }');
code = rep(code, '\tctx.lr = 0x822F0F80;\n\tsub_822ED7D8(ctx, base);',
  '\tctx.lr = 0x822F0F80;\n\t{ static const bool sin43 = [] { const char* e = std::getenv("G1_SIN43"); return e && e[0] == \'1\'; }();  // SIN43\n\t  if (!sin43) sub_822ED7D8(ctx, base); }');
fs.writeFileSync(T + '/src/gh3_recomp.18.cpp', '#include <cstdlib>\n' + code);
// Página: index.html de sinescena + sin3d en el pedido al worker.
let h = fs.readFileSync('artifacts/d1-wasm/sinescena/demo/index.html', 'utf8');
h = rep(h, "r5livevs:(()=>{/* sinescena", "sin43:(()=>{/* sin43 (Claude 2026-10-17) */return q.get('sin43')==='1'?'1':'0';})(),sin3d:(()=>{/* sin3d (Claude 2026-10-17) */const x=q.get('sin3d');if(x==='0')return '0';return x==='1'||qual==='muy'?'1':'0';})(),r5livevs:(()=>{/* sinescena");
h = rep(h, "'r5lite', 'r5livevs',", "'r5lite', 'r5livevs', 'sin3d', 'sin43',");
fs.writeFileSync(T + '/index.html', h);
console.log(T);
