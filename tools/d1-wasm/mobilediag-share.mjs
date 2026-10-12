// Pasar el paquete de diagnóstico al iPhone por el Wi-Fi de casa (Claude). Sirve SOLO ese archivo, en la red local,
// bajo un link con clave al azar, con límite de velocidad (por defecto 1 MB/s; 'rapido' = sin límite). No sube nada a
// internet. Uso: node tools/d1-wasm/mobilediag-share.mjs [MBporSegundo=1|rapido] [puerto=5490]
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
const FILE = 'artifacts/d1-wasm/mobilediag/GH3-Slow-Ride-diag.gh3mobile', NAME = 'GH3-Slow-Ride-diag.gh3mobile';
const [rate = '1', port = 5490] = process.argv.slice(2), bps = rate === 'rapido' ? Infinity : Number(rate) * 1048576;
const key = crypto.randomBytes(6).toString('hex'), size = fs.statSync(FILE).size;
const page = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GH3 paquete</title>
<body style="font:18px system-ui;background:#111;color:#eee;padding:20px;line-height:1.5"><h2>Paquete de diagnóstico GH3</h2>
<p>1. Tocá <a style="color:#9bf" href="/${key}/${NAME}" download>Descargar ${(size / 1048576).toFixed(0)} MB</a> y elegí «Descargar». Queda en Archivos → Descargas.</p>
<p>2. Cuando termine, abrí <a style="color:#9bf" href="https://riff-duel.vercel.app/iphone/preparar.html">riff-duel.vercel.app/iphone/preparar.html</a>, elegí el archivo y tocá «Guardar paquete».</p></body>`;
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/' + key || u.pathname === '/' + key + '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(page); }
  if (u.pathname !== `/${key}/${NAME}`) { res.writeHead(404); return res.end(); }
  console.log(new Date().toLocaleTimeString(), 'descarga desde', req.socket.remoteAddress);
  res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': size, 'Content-Disposition': `attachment; filename="${NAME}"` });
  const st = fs.createReadStream(FILE, { highWaterMark: 256 * 1024 }); let sent = 0; const t0 = Date.now();
  st.on('data', (b) => {
    sent += b.length;
    const ahead = sent / bps * 1000 - (Date.now() - t0);
    if (!res.write(b) || ahead > 0) { st.pause(); setTimeout(() => st.resume(), Math.max(0, ahead)); }
  });
  st.on('end', () => { res.end(); console.log('terminada:', (sent / 1048576).toFixed(0), 'MB en', ((Date.now() - t0) / 1000).toFixed(0), 's'); });
  res.on('close', () => st.destroy());
}).listen(+port, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`Paquete: ${(size / 1048576).toFixed(0)} MB · límite ${bps === Infinity ? 'sin límite' : rate + ' MB/s'}`);
  console.log('Con el iPhone en el MISMO Wi-Fi, abrí en Safari:');
  for (const ip of ips) console.log(`   http://${ip}:${port}/${key}`);
  console.log('Si Windows pregunta por el firewall, permití "redes privadas". Cerrá esta ventana al terminar.');
});
