// Corre el lector hw60 sobre una captura R5L varias veces y guarda los mensajes (prueba sin juego).
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm';
const [cap, out] = process.argv.slice(2);
const idx = JSON.parse(fs.readFileSync(path.join(cap, fs.existsSync(path.join(cap, 'capture.json')) ? 'capture.json' : 'resources.json')));
const ranges = idx.resources.map((r) => ({ ...r, f: path.join(cap, `${r.phys}-${r.length}.bin`) })).filter((r) => fs.existsSync(r.f)).map((r) => ({ ...r, data: new Uint8Array(fs.readFileSync(r.f)) }));
const api = { readPhysical: (p, n) => { const r = ranges.find((r) => r.phys <= p && p + n <= r.phys + r.length); if (!r) throw Error('falta ' + p); return r.data.subarray(p - r.phys, p - r.phys + n); } };
const msgs = []; const ch = new BroadcastChannel('hw60'); ch.onmessage = (e) => msgs.push(e.data);
globalThis.__r5liveConsumer = () => {}; vm.runInThisContext(fs.readFileSync('artifacts/hw60/build/hw60-tap.js', 'utf8'));
const b = fs.readFileSync(path.join(cap, 'frame.r5f')), al = new Uint8Array(new ArrayBuffer(b.length)); al.set(b);
for (let k = 0; k < 20; k++) globalThis.__r5liveConsumer(al, { seq: k }, api);
await new Promise((r) => setTimeout(r, 300)); ch.close();
const enc = (k, v) => ArrayBuffer.isView(v) ? { $t: v.constructor.name, b64: Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64') } : v;
fs.writeFileSync(out, JSON.stringify(msgs, enc)); console.log(msgs.length, 'mensajes', fs.statSync(out).size, 'B');
setTimeout(() => process.exit(0), 50);
