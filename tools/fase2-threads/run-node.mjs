import { fork } from 'node:child_process';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const build = new URL('../../artifacts/fase2-threads/build/', import.meta.url);
export function assess(variant, r) {
  if (r.error || !Array.isArray(r.cases)) return false;
  const failures = r.cases.filter(c => !c.ok);
  return variant === 'nosafepoint32'
    ? r.pass === 12 && r.fail === 1 && r.cases.length === 13 && failures.length === 1 && failures[0].name === 'suspension_remota'
    : r.pass === 14 && r.fail === 0 && r.cases.length === 14 && failures.length === 0;
}
if (process.argv[2] === '--child') {
  const variant = process.argv[3];
  const factory = createRequire(import.meta.url)(fileURLToPath(new URL(`threads-${variant}.js`, build)));
  const start = performance.now();
  const lines = [];
  function done(r) { process.send(r, () => process.exit(r.error ? 1 : 0)); }
  factory({
    print(s) { lines.push(s); console.log(`[${variant}] ${s}`); },
    printErr(s) { console.error(`[${variant}] ${s}`); },
    onAbort(reason) { done({error: String(reason), lines}); },
    onDone(pass, fail, ptr) {
      try { done({pass, fail, ms: Math.round(performance.now()-start), cases: JSON.parse(this.UTF8ToString(ptr)), lines}); }
      catch(e) { done({error: String(e), lines}); }
    },
  }).catch(e => done({error: String(e), lines}));
} else {
  const variants = (process.argv[2] || 'ok32,ok64,nosafepoint32').split(',');
  if (variants.some(v => !['ok32','ok64','nosafepoint32'].includes(v))) throw Error('Variante desconocida');
  const out = {};
  for (const variant of variants) {
    out[variant] = await new Promise(resolve => {
      const child = fork(fileURLToPath(import.meta.url), ['--child', variant], {stdio:['ignore','inherit','inherit','ipc']});
      let result;
      const timer = setTimeout(() => { result = {error:'timeout de 30 s'}; child.kill(); }, 30000);
      child.on('message', r => { result = r; });
      child.on('error', e => { result = {error: String(e)}; });
      child.on('exit', (code, signal) => {
        clearTimeout(timer);
        resolve({...result, ...(result ? {} : {error:`salida sin resultado: ${code}/${signal}`})});
      });
    });
    out[variant].expectedOutcome = assess(variant, out[variant]);
  }
  writeFileSync(new URL('../../artifacts/fase2-threads/node-results.json', import.meta.url), JSON.stringify(out,null,2));
  console.log(JSON.stringify(out));
  process.exitCode = Object.values(out).every(r => r.expectedOutcome) ? 0 : 1;
}
