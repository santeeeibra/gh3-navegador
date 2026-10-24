// Ejecuta la prueba de memoria/MMIO en Node: modo normal y los dos controles negativos.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// El paquete es type:module, así que el .js de Emscripten se evalúa como script CommonJS.
const load = (file, name) => { const module = { exports: {} }; vm.runInThisContext(`(function(module,exports,require,__dirname,__filename){${readFileSync(file,'utf8')}
;module.exports=${name};})`)(module, module.exports, require, '.', file); return module.exports; };
const out = { results: [] };
for (const bits of [32, 64]) {
  const factory = load(new URL(`../../artifacts/fase1-mem/build/memmmio${bits}.js`, import.meta.url), `createMem${bits}`);
  for (const mode of [0, 1, 2]) {
    const lines = [];
    const m = await factory({ print: l => lines.push(l), printErr: l => lines.push('ERR ' + l) });
    const fails = m.ccall('run_mode', 'number', ['number'], [mode]);
    out.results.push({ bits, mode, fails, lines });
  }
}
for (const r of out.results) console.log(`wasm${r.bits} modo ${r.mode}: fallos=${r.fails}\n  ` + r.lines.filter(l => !l.startsWith('PASS')).join('\n  '));
const ok = out.results.every(r => (r.mode === 0) === (r.fails === 0));
console.log(ok ? 'OK: modo normal sin fallos y controles negativos detectados' : 'ERROR');
process.exitCode = ok ? 0 : 1;
