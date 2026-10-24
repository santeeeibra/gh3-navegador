// Corre las pruebas PPC compiladas (memoria plana y traducida) en Node.
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const load = (file, name) => { const module = { exports: {} }; vm.runInThisContext(`(function(module,exports,require,__dirname,__filename){${readFileSync(file,'utf8')}\n;module.exports=${name};})`)(module, module.exports, require, '.', file); return module.exports; };
let ok = true;
for (const v of ['flat', 'tr', 'roto']) for (const bits of [32, 64]) {
  const f = `D:/guitar hero/artifacts/fase1-mem/ppc/ppc-${v}${bits}.js`;
  if (!existsSync(f)) continue;
  const lines = [];
  const m = await load(f, `createPpc_${v}${bits}`)({ print: l => lines.push(l), printErr: l => lines.push('ERR ' + l) });
  const fails = m.ccall('run_all', 'number', [], []);
  const res = lines.find(l => l.startsWith('RESULT')) || 'sin RESULT';
  console.log(`${v} wasm${bits}: ${res}`);
  lines.filter(l => l.startsWith('FAIL')).slice(0, 10).forEach(l => console.log('  ' + l));
  ok &&= v === 'roto' ? fails > 0 : fails === 0 && /pass=1458 fail=0/.test(res);
}
process.exitCode = ok ? 0 : 1;
