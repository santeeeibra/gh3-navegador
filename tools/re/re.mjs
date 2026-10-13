#!/usr/bin/env node
// Herramienta de ingeniería inversa de GH3 X360 (dd2ca1ab). Uso:
//   node tools/re/re.mjs buscar <texto>          busca en la base (nombres, descripciones, shaders, funciones de scripts)
//   node tools/re/re.mjs funcion <dir|nombre> [prof]   info + decompilado Ghidra con nombres + llamadores
//   node tools/re/re.mjs shader <hash>            qué se sabe de un shader
//   node tools/re/re.mjs tsv                      genera artifacts/re/names.tsv para Ghidra
//   node tools/re/re.mjs nombrar-ghidra           aplica names.tsv al proyecto Ghidra (escribe en él)
//   node tools/re/re.mjs nombres-cpp              genera artifacts/re/func-names.tsv (nombre por función para las trazas)
//   node tools/re/re.mjs perfil <corrida> <ms> [antes] [despues] [base]   funciones nuevas / con pico alrededor de ese momento
//   node tools/re/re.mjs serie <corrida> <dir|nombre>   llamadas de una función a lo largo de la corrida
//   node tools/re/re.mjs escrituras <corrida>     quién escribió en lo vigilado (RE_WATCH de tools/re/re-run.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(ROOT, 'artifacts/re');
const kb = JSON.parse(fs.readFileSync(path.join(HERE, 'kb/gh3-kb.json'), 'utf8')).entries;
const cfuncs = fs.readFileSync(path.join(HERE, 'kb/cfuncs.tsv'), 'utf8').trim().split(/\r?\n/).slice(1)
  .map(l => { const [addr, name] = l.split('\t'); return { kind: 'func', addr, name, desc: 'Función C de scripts QB (tabla 828E8A98).', estado: 'COMPROBADO', fuente: 'cfuncs.tsv' }; });
const all = [...kb, ...cfuncs];
const norm = a => a.replace(/^0x/i, '').replace(/^(sub_|loc_)/i, '').toUpperCase();
const byAddr = new Map([...cfuncs, ...kb].filter(e => e.addr).map(e => [e.addr.toUpperCase(), e]));  // la base manda sobre la tabla

function show(e) {
  const id = e.addr ? '0x' + e.addr : e.hash ? 'shader ' + e.hash : '';
  console.log(`${e.kind.padEnd(7)} ${id.padEnd(22)} ${e.name}  [${e.estado}]`);
  if (e.desc) console.log(`        ${e.desc}`);
  if (e.hashes) console.log(`        ${e.hashes.join(' ')}`);
  if (e.fuente && e.fuente !== 'cfuncs.tsv') console.log(`        fuente: ${e.fuente}`);
}

function namesTsv() {
  fs.mkdirSync(OUT, { recursive: true });
  const rows = ['kind\taddr\tname\tcomment'];
  const seen = new Set();
  for (const e of all) {
    if (!e.addr || !['func', 'global', 'table'].includes(e.kind)) continue;
    const k = e.addr.toUpperCase();
    if (seen.has(k)) continue;
    seen.add(k);
    rows.push([e.kind === 'func' ? 'func' : 'global', k, e.name, (e.desc || '').replace(/[\t\r\n]/g, ' ')].join('\t'));
  }
  const f = path.join(OUT, 'names.tsv');
  fs.writeFileSync(f, rows.join('\n') + '\n');
  return { f, n: rows.length - 1 };
}

function resolve(arg) {
  if (/^(0x|sub_|loc_)?[0-9a-f]{8}$/i.test(arg)) return norm(arg);
  const e = all.find(x => x.addr && x.name.toLowerCase() === arg.toLowerCase());
  if (!e) throw new Error(`no conozco "${arg}"`);
  return e.addr.toUpperCase();
}

const [cmd, ...args] = process.argv.slice(2);
switch (cmd) {
  case 'buscar': {
    const q = args.join(' ').toLowerCase();
    const hits = all.filter(e => JSON.stringify(e).toLowerCase().includes(q));
    hits.slice(0, 80).forEach(show);
    console.log(`${hits.length} resultado(s)${hits.length > 80 ? ' (mostrando 80)' : ''}`);
    break;
  }
  case 'shader': {
    const h = (args[0] || '').toUpperCase();
    const hits = kb.filter(e => (e.hash && (e.hash.startsWith(h) || h.startsWith(e.hash))) || (e.hashes || []).some(x => x.startsWith(h)));
    hits.length ? hits.forEach(show) : console.log('sin datos de ese shader');
    break;
  }
  case 'tsv': { const r = namesTsv(); console.log(`${r.n} nombres → ${r.f}`); break; }
  case 'nombrar-ghidra': {
    const r = namesTsv();
    const p = spawnSync('cmd', ['/c', path.join('tools', 'ghidra', 'apply-kb.cmd'), path.relative(ROOT, r.f)], { stdio: 'ignore', cwd: ROOT });
    const log = fs.readFileSync(path.join(ROOT, 'artifacts/ghidra/logs/apply-kb.out'), 'utf8');
    console.log((log.match(/ApplyKbGh3:.*$/m) || ['sin resumen; ver artifacts/ghidra/logs/apply-kb.out'])[0]);
    process.exit(p.status ?? 1);
  }
  case 'nombres-cpp': {
    fs.mkdirSync(OUT, { recursive: true });
    const rows = all.filter(e => e.kind === 'func' && e.addr).map(e => `sub_${e.addr.toUpperCase()}\t${e.name}`);
    fs.writeFileSync(path.join(OUT, 'func-names.tsv'), rows.join('\n') + '\n');
    console.log(`${rows.length} → artifacts/re/func-names.tsv`);
    break;
  }
  case 'funcion': {
    const a = resolve(args[0]);
    const depth = args[1] || '2';
    const e = byAddr.get(a);
    e ? show(e) : console.log(`0x${a}: sin datos en la base`);
    const dir = path.join(OUT, 'funcs', a);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    spawnSync('cmd', ['/c', path.join('tools', 'ghidra', 'report.cmd'), path.relative(ROOT, dir), a, depth], { stdio: 'ignore', cwd: ROOT });
    const idx = path.join(dir, 'index.txt');
    if (!fs.existsSync(idx)) { console.log(`Ghidra falló; ver ${dir}.log`); process.exit(1); }
    // anotar direcciones conocidas en el índice
    const named = fs.readFileSync(idx, 'utf8').replace(/\b(8[0-9A-Fa-f]{7})\b/g, m => byAddr.has(m.toUpperCase()) ? `${m}(${byAddr.get(m.toUpperCase()).name})` : m);
    console.log(named);
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.c'))) console.log(`decompilado: ${path.relative(ROOT, path.join(dir, f))}`);
    break;
  }
  case 'perfil': {
    // re perfil <carpeta-corrida> <ms-canción> [antes=1500] [despues=500] [base=5000-<ms-3000>]
    const dir = path.resolve(args[0]), at = Number(args[1]), antes = Number(args[2] || 1500), despues = Number(args[3] || 500);
    const names = JSON.parse(fs.readFileSync(path.join(dir, 're-names.json'), 'utf8'));
    const S = fs.readFileSync(path.join(dir, 're-samples.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    const iAt = S.findIndex(s => s.clock >= at);
    if (iAt < 0) { console.log('la corrida no llegó a ese momento'); process.exit(1); }
    const tAt = S[iAt].t, song = S[iAt].song;
    const [b0, b1] = (args[4] || `5000-${at - 3000}`).split('-').map(Number);
    const sum = sel => { const m = new Map(); let n = 0; for (const s of sel) { n++; for (let i = 0; i < s.d.length; i += 2) m.set(s.d[i], (m.get(s.d[i]) || 0) + s.d[i + 1]); } return { m, n }; };
    const W = sum(S.filter(s => s.t >= tAt - antes && s.t <= tAt + despues));
    const B = sum(S.filter((s, i) => i < iAt && s.song === song && s.clock >= b0 && s.clock <= b1));
    const label = id => { const f = names[id] || `id${id}`; const a = f.replace(/^sub_/, '').toUpperCase(); const e = byAddr.get(a); return e ? `${f} (${e.name})` : f; };
    const rows = [...W.m].map(([id, c]) => ({ id, c, rw: c / W.n, rb: (B.m.get(+id) || 0) / Math.max(1, B.n) }));
    console.log(`tema ${song}; momento ${at} ms (t=${tAt}); ventana ${W.n} muestras; base ${b0}-${b1} ms = ${B.n} muestras`);
    console.log('\nNUEVAS (no corrieron en la base):');
    rows.filter(r => r.rb === 0).sort((a, b) => b.c - a.c).slice(0, 40).forEach(r => console.log(`  ${String(r.c).padStart(8)}  ${label(r.id)}`));
    console.log('\nPICOS (≥5× la base):');
    rows.filter(r => r.rb > 0 && r.rw >= 5 * r.rb).sort((a, b) => b.rw / b.rb - a.rw / a.rb).slice(0, 25).forEach(r => console.log(`  ×${(r.rw / r.rb).toFixed(1).padStart(7)}  ${label(r.id)}`));
    break;
  }
  case 'serie': {
    // re serie <carpeta-corrida> <función|dir> : llamadas por muestra a lo largo de la corrida (reloj, cantidad)
    const dir = path.resolve(args[0]);
    const names = JSON.parse(fs.readFileSync(path.join(dir, 're-names.json'), 'utf8'));
    const want = 'sub_' + resolve(args[1]);
    const id = Object.keys(names).find(k => names[k].toUpperCase() === want.toUpperCase());
    if (id === undefined) { console.log('esa función nunca corrió'); break; }
    for (const l of fs.readFileSync(path.join(dir, 're-samples.jsonl'), 'utf8').trim().split('\n')) {
      const s = JSON.parse(l); let c = 0;
      for (let i = 0; i < s.d.length; i += 2) if (s.d[i] === +id) c = s.d[i + 1];
      if (c) console.log(`${s.song || '-'}\t${s.clock?.toFixed?.(0)}\t${c}`);
    }
    break;
  }
  case 'escrituras': {
    // re escrituras <carpeta-corrida> : quién escribió en lo vigilado (agrupado por dirección y función)
    const dir = path.resolve(args[0]);
    const H = fs.readFileSync(path.join(dir, 're-hits.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
    const val = (hex, size) => { const v = BigInt('0x' + hex); let be = 0n; for (let i = 0; i < size; i++) be = (be << 8n) | ((v >> BigInt(8 * i)) & 0xFFn); return be; };
    const asF = (b, size) => size === 4 ? new Float32Array(new Uint32Array([Number(b)]).buffer)[0] : null;
    const g = new Map();
    for (const h of H) {
      const k = `${h.addr.toString(16).toUpperCase()} ${h.fn}`;
      const x = g.get(k) || { n: 0, first: h, last: h };
      x.n++; x.last = h; g.set(k, x);
    }
    for (const [k, x] of g) {
      const [a, f] = k.split(' '); const e = byAddr.get(f.replace(/^sub_/, '').toUpperCase());
      const nv = val(x.last.value, x.last.size);
      console.log(`0x${a} ← ${f}${e ? ` (${e.name})` : ''}  ×${x.n}  lr ${x.last.lr}  reloj ${x.first.clock.toFixed(0)}…${x.last.clock.toFixed(0)}  último=0x${nv.toString(16)}${x.last.size === 4 ? ` (float ${asF(nv, 4)})` : ''}`);
    }
    console.log(`${H.length} escritura(s)`);
    break;
  }
  default:
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 11).join('\n'));
}
