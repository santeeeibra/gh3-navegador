// Claude 2026-10-17: copia aislada artifacts/d1-wasm/relojaudio = c1strum-pub (publicada) + gancho del reloj atado al audio.
// Toma las fuentes ya preparadas de c1strum-pub (node tools/c1-strum/prepare-pub.mjs) y les suma sólo esto.
// Uso (Git Bash, desde la raíz): node tools/relojaudio/prepare.mjs && bash tools/relojaudio/build.sh
import fs from 'node:fs';
const S = 'artifacts/d1-wasm/c1strum-pub', T = 'artifacts/d1-wasm/relojaudio';
const rep = (s, a, b) => { if (s.split(a).length !== 2) throw Error('Ancla no única: ' + a.slice(0, 80)); return s.replace(a, b); };
fs.mkdirSync(T + '/src', {recursive: true});
let code = fs.readFileSync(S + '/src/gh3_recomp.2.cpp', 'utf8');
code = '#include "reloj_audio.h"\n' + code;
code = rep(code, '\tctx.lr = 0x821139F0;\n\tsub_82266250(ctx, base);', '\tctx.lr = 0x821139F0;\n\tctx.f1.f64 = relojaudio_delta(ctx.f1.f64);\n\tsub_82266250(ctx, base);');
fs.writeFileSync(T + '/src/gh3_recomp.2.cpp', code);
let a60 = fs.readFileSync(S + '/demo/autopista60.js', 'utf8');
// Con el gancho encendido el ancla queda fija desde el arranque de la canción (el reloj corregido ya no sirve de referencia).
a60 = rep(a60, `    const target = anc.med + s / 48;
    if (vis.b === null || Math.abs(anc.med - vis.b) > 60) vis.b = anc.med;
    else vis.b += Math.max(-1, Math.min(1, anc.med - vis.b));`, `    const med = window.relojAudioMed ? window.relojAudioMed(anc.med) : anc.med; // relojaudio: ancla fija
    const target = med + s / 48;
    if (vis.b === null || Math.abs(med - vis.b) > 60) vis.b = med;
    else vis.b += Math.max(-1, Math.min(1, med - vis.b));`);
a60 = rep(a60, 'st.audioTimeMs = target;', 'st.audioTimeMs = target; window.relojAudioWrite?.(target, p);');
fs.writeFileSync(T + '/autopista60.js', a60);
let html = fs.readFileSync(S + '/demo/index.html', 'utf8');
html = rep(html, '<script src="c1-strum-page.js"></script>', '<script src="c1-strum-page.js"></script>\n<script src="gh3-relojaudio.js"></script>');
fs.writeFileSync(T + '/index.html', html);
console.log(T);
