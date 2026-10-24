import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Static inspection only. Never starts GH3 or writes to the game directory.
const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = process.argv[2] || process.env.REA_CLI_PATH;
if (!cli) throw new Error('Usage: node tools/original/rea-probe.mjs <path to rea/scripts/rea.mjs>');
const out = path.join(root, 'artifacts/rea-gh3');
await mkdir(out, { recursive: true });
const packageInfo = JSON.parse(await readFile(path.resolve(path.dirname(cli), '../package.json'), 'utf8'));
if (packageInfo.name !== 'rea-agents' || packageInfo.version !== '6.3.0') {
  throw new Error('This probe was verified against rea-agents 6.3.0; review before using another version.');
}
async function rea(name, args) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args, '--json'], { windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
  await writeFile(path.join(out, `${name}.json`), result.stdout);
  await writeFile(path.join(out, `${name}.stderr.log`), result.stderr);
  let data;
  try { data = JSON.parse(result.stdout); } catch { data = { error: 'non-JSON output' }; }
  return { exitCode: result.code, code: data.code ?? null, evidenceId: data.evidence_id ?? null };
}
const results = {};
results.doctor = await rea('doctor-ghidra', ['doctor', '--provider', 'ghidra']);
results.xex = await rea('xex-analysis', ['analyze',
  'D:/Descargas/GH3LOR-XEX/GH3LOR-XEX/Guitar Hero 3 Legends of Rock/default.xex', '--provider', 'ghidra']);
results.pcInventory = await rea('pc-artifact', ['inspect-artifact', path.join(root, 'original-data/probe/gh3.exe')]);

// This evidence comes from the existing rexglue translation, NOT REA decompilation.
const generated = path.join(root, 'artifacts/xex-adapt/paso-b/gh3-variant/generated/variant-dd2ca1ab');
const callers = [], definitions = [];
for (const name of (await readdir(generated)).filter(name => /^gh3_recomp\.\d+\.cpp$/.test(name)).sort()) {
  const source = await readFile(path.join(generated, name), 'utf8');
  const lines = source.split(/\r?\n/);
  let fn = null;
  for (let i = 0; i < lines.length; i++) {
    const definition = lines[i].match(/^DEFINE_REX_FUNC\(([^)]+)\)/);
    if (definition) fn = definition[1];
    if (definition?.[1] === 'sub_824AC738') {
      definitions.push({ file: path.relative(root, path.join(generated, name)), line: i + 1,
        sha256: createHash('sha256').update(source).digest('hex') });
      const body = lines.slice(i, i + 13).join('\n');
      if (!body.includes('// mr r5,r4') || !body.includes('// li r4,0') || !body.includes('__imp__XamInputGetState(ctx, base);')) {
        throw new Error('Input wrapper differs from the inspected version.');
      }
    }
    if (lines[i].trim() === 'sub_824AC738(ctx, base);') {
      callers.push({ function: fn, file: path.relative(root, path.join(generated, name)), line: i + 1 });
    }
  }
}
if (definitions.length !== 1 || callers.length !== 6) throw new Error('Unexpected wrapper or call-site count; review generated inputs.');
const summary = {
  date: new Date().toISOString(), reaVersion: packageInfo.version, results,
  generatedEvidence: { origin: 'existing rexglue generated C++; not REA decompilation',
    function: 'sub_824AC738', definition: definitions[0], directCallSites: callers,
    inferredPrototype: 'XamInputGetState(userIndex, 0, statePointer)',
    reason: 'PowerPC wrapper moves incoming r4 to r5, sets r4=0, then branches to the import; r3 is preserved.',
    limitations: ['Static direct calls only; does not include indirect callers.',
      'Does not establish scoring, timing windows, button meaning, or runtime behavior.'] },
  pending: ['Ghidra and full JDK not installed/configured.',
    'REA 6.3.0 does not accept raw XEX. A compatible analysis route remains to be verified.',
    'PC artifact inventory establishes identity only; no function decompilation yet.']
};
await writeFile(path.join(out, 'probe-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ results, wrapper: summary.generatedEvidence.function, directCallSites: callers.length, out }, null, 2));
