// Prueba offline del lector hw60 con una captura R5L (frame.r5f + capture.json/resources.json + .bin).
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm';
const cap = process.argv[2], idx = fs.existsSync(path.join(cap, 'capture.json')) ? JSON.parse(fs.readFileSync(path.join(cap, 'capture.json'))) : JSON.parse(fs.readFileSync(path.join(cap, 'resources.json')));
const ranges = idx.resources.map((r) => ({ ...r, f: path.join(cap, `${r.phys}-${r.length}.bin`) })).filter((r) => fs.existsSync(r.f)).map((r) => ({ ...r, data: new Uint8Array(fs.readFileSync(r.f)) }));
const api = { readPhysical: (p, n) => { const r = ranges.find((r) => r.phys <= p && p + n <= r.phys + r.length); if (!r) throw Error('falta ' + p); return r.data.subarray(p - r.phys, p - r.phys + n); } };
let got = null; const ch = new BroadcastChannel('hw60'); ch.onmessage = (e) => { got = e.data; };
globalThis.__r5liveConsumer = () => {}; vm.runInThisContext(fs.readFileSync('artifacts/hw60/build/hw60-tap.js', 'utf8'));
const bytes = new Uint8Array(fs.readFileSync(path.join(cap, 'frame.r5f')));
const al = new Uint8Array(new ArrayBuffer(bytes.length)); al.set(bytes);
for (let k = 0; k < 15; k++) { const t0 = performance.now(); globalThis.__r5liveConsumer(al, { seq: k }, api); console.log('tap ms', k, (performance.now() - t0).toFixed(1)); }
await new Promise((r) => setTimeout(r, 200)); ch.close(); setTimeout(() => process.exit(0), 50);
fs.writeFileSync(process.argv[3] || 'artifacts/hw60/tap-sample.json', JSON.stringify(got, (k, v) => ArrayBuffer.isView(v) ? (k === 'data' ? `<${v.length} B>` : Array.from(v).slice(0, 2000)) : v));
console.log('draws', got.draws.length, 'textures', got.textures.length, got.draws.map((d) => d.vs.slice(0, 4) + (d.verts ? ':' + d.verts.length / 4 : '')).join(' '));
