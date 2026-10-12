// Clasifica las reservas VirtualAlloc(Ex) en dirección fija que fallaron en una corrida, contra el mapa real
// de BottleShip (módulos registrados en el log + layout de emulator-config.ts) y la regla de Windows
// (MEM_RESERVE redondea la base a 64 KB). Solo lee logs; no ejecuta nada.
// Uso: node classify-fixed-allocs.mjs <logs.json> <salida.json> [guestMB=1536]
import {readFileSync, writeFileSync} from 'node:fs';
const [logsPath, outPath, guestMBArg] = process.argv.slice(2);
const guestTop = Number(guestMBArg ?? 1536) * 1024 * 1024;
const logs = JSON.parse(readFileSync(logsPath, 'utf8'));
const hex = s => parseInt(s, 16);

const modules = [];
let hleCount = 0, hleBase = 0, hleSlot = 0;
for (const {message: m} of logs) {
    let r = /\[ModuleRegistry\] Registered "([^"]+)" at 0x([0-9a-f]+), size=0x([0-9a-f]+)/.exec(m);
    if (r) modules.push({name: r[1], base: hex(r[2]), end: hex(r[2]) + hex(r[3])});
    r = /\[HleImages\] materialized (\d+) module image\(s\) at 0x([0-9a-f]+) \(\d+ slots of 0x([0-9a-f]+)\)/.exec(m);
    if (r) { hleCount = +r[1]; hleBase = hex(r[2]); hleSlot = hex(r[3]); }
}
if (hleCount) modules.push({name: `HLE images (${hleCount} DLL thunked)`, base: hleBase, end: hleBase + hleCount * hleSlot});
// Layout fijo (src/worker/core/cpu/emulator-config.ts, commit c5954ad).
const layout = [
    {name: 'LOWMEM', base: 0, end: 0x100000},
    {name: 'ventana EXE libre', base: 0x100000, end: 0x04000000},
    {name: 'HEAP', base: 0x04000000, end: 0x21000000, heap: true},
    {name: 'THUNK_CODE', base: 0x21000000, end: 0x22000000},
    {name: 'THUNK_DATA', base: 0x22000000, end: 0x23000000},
    {name: 'GUARD+PAGETABLES', base: 0x23000000, end: 0x24000000},
    {name: 'ROM (DLL reales)', base: 0x24000000, end: 0x2A000000},
    {name: 'HLE_IMAGE', base: 0x2A000000, end: 0x2C000000},
    {name: 'SURFACE', base: 0x2C000000, end: 0x40000000},
    {name: 'HEAP_HIGH', base: 0x40000000, end: guestTop, heap: true},
    {name: 'fuera de la RAM del guest', base: guestTop, end: 0x7FFF0000},
];
const fails = new Map();
for (const {message: m} of logs) {
    const r = /VirtualAlloc FAIL (.*?) \(lpAddr=0x([0-9a-f]+), size=0x([0-9a-f]+), type=0x([0-9a-f]+), prot=0x([0-9a-f]+)\)/.exec(m);
    if (!r) continue;
    const next = /high=\{next=0x([0-9a-f]+) slabTop=0x([0-9a-f]+)/.exec(r[1]);
    const k = r[2];
    const e = fails.get(k) ?? {addr: hex(k), size: hex(r[3]), type: r[4], prot: r[5], n: 0, heapNext: next ? hex(next[1]) : null, heapSlabTop: next ? hex(next[2]) : null};
    e.n++; fails.set(k, e);
}
const summary = {};
const rows = [];
for (const e of fails.values()) {
    const winBase = e.addr & ~0xFFFF, winEnd = (e.addr + e.size + 0xFFF) & ~0xFFF;
    const mod = modules.find(x => winBase < x.end && winEnd > x.base);
    const lay = layout.find(x => winBase >= x.base && winBase < x.end);
    let cls;
    if (mod) cls = `choca con módulo: ${mod.name}`;
    else if (lay?.heap && lay.name === 'HEAP' && e.heapNext != null && winBase >= e.heapNext && winEnd <= e.heapSlabTop) cls = 'HEAP libre [next,slabTop)';
    else if (lay?.heap) cls = `${lay.name} (no verificable libre)`;
    else cls = `región del emulador: ${lay?.name ?? '?'}`;
    summary[cls] = summary[cls] ?? {addresses: 0, calls: 0}; summary[cls].addresses++; summary[cls].calls += e.n;
    rows.push({addr: '0x' + e.addr.toString(16), winBase: '0x' + winBase.toString(16), size: e.size, calls: e.n, cls});
}
const out = {logs: logsPath, guestTopHex: '0x' + guestTop.toString(16), modules: modules.map(m => ({...m, base: '0x' + m.base.toString(16), end: '0x' + m.end.toString(16)})), summary, rows};
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(JSON.stringify({modules: out.modules, summary}, null, 1));
