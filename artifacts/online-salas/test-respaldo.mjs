// Prueba del servidor de respaldo: node test-respaldo.mjs (usa el WebSocket cliente de Node 22+).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
process.env.CLAVE_ADMIN = 'clave-de-prueba';
process.env.COMENTARIOS_ARCHIVO = 'NUL';
import {servidor} from './respaldo/servidor.mjs';
const P = 8897, H = 'http://127.0.0.1:' + P, W = 'ws://127.0.0.1:' + P;
await new Promise(r => servidor.listen(P, '127.0.0.1', r));
const cli = (ruta) => new Promise((res, rej) => {
  const ws = new WebSocket(W + ruta), cola = [], esp = [];
  ws.onmessage = e => { const o = JSON.parse(e.data); const i = esp.findIndex(x => x.t === o.t); if (i >= 0) esp.splice(i, 1)[0].r(o); else cola.push(o); };
  ws.espera = (t, ms = 2000) => new Promise((r, j) => { const i = cola.findIndex(o => o.t === t); if (i >= 0) return r(cola.splice(i, 1)[0]); const x = {t, r}; esp.push(x); setTimeout(() => j(Error('timeout ' + t)), ms); });
  ws.onopen = () => res(ws); ws.onerror = () => rej(Error('error ws ' + ruta));
});
const pierde = (ruta) => new Promise(r => { const ws = new WebSocket(W + ruta); ws.onerror = () => r('error'); ws.onclose = () => r('close'); ws.onopen = () => { ws.onmessage = null; }; });
try {
  const lista = await (await fetch(H + '/api/sala/lista')).json();
  assert.equal(lista.salas.length, 20); assert.equal(lista.salas[10].modo, 'coop');
  const nueva = (await (await fetch(H + '/api/sala/nueva')).json()).codigo; assert.match(nueva, /^[A-Z]{5}$/);
  assert.equal((await fetch(H + '/api/sala/lista', {headers: {Origin: 'https://malo.example'}})).status, 403);
  // comentarios
  const idc = crypto.randomUUID(), ok = {rating: 4, category: 'audio', message: 'suena bien', nickname: 'ana', request_id: idc, device: 'desktop', browser: 'Brave'};
  const pc = (b, o = 'https://lasvegasherogame.com') => fetch(H + '/api/feedback', {method: 'POST', headers: {'content-type': 'application/json', Origin: o}, body: JSON.stringify(b)});
  assert.equal((await pc(ok)).status, 200); assert.equal((await pc(ok)).status, 200); // duplicado ok
  assert.equal((await pc({...ok, request_id: crypto.randomUUID(), rating: 9})).status, 400);
  assert.equal((await pc(ok, 'https://malo.example')).status, 403);
  assert.equal((await fetch(H + '/api/feedback/pendientes')).status, 401);
  const pend = await (await fetch(H + '/api/feedback/pendientes', {headers: {authorization: 'Bearer clave-de-prueba'}})).json(); assert.equal(pend.total, 1); assert.equal(pend.comentarios[0].request_id, idc);
  for (let i = 0; i < 2; i++) await pc({...ok, request_id: crypto.randomUUID()});
  assert.equal((await pc({...ok, request_id: crypto.randomUUID()})).status, 429);
  const a = await cli('/api/sala/SALAB'); const ha = await a.espera('hola'); assert.equal(ha.anfitrion, true); assert.equal(ha.modo, 'cara');
  const b = await cli('/api/sala/SALAB'); const hb = await b.espera('hola'); assert.equal(hb.anfitrion, false);
  let jn = await a.espera('jugadores'); if (jn.n === 1) jn = await a.espera('jugadores'); assert.equal(jn.n, 2);
  assert.equal(await pierde('/api/sala/SALAB'), 'close'); // ocupada: tercero rechazado
  a.send(JSON.stringify({t: 'nombre', nombre: 'ana', modelo: 'axel_1'}));
  assert.equal((await b.espera('nombre')).nombre, 'ANA');
  a.send(JSON.stringify({t: 'hora', cli: 5})); assert.equal((await a.espera('hora')).cli, 5);
  a.send(JSON.stringify({t: 'lista', cancion: 'slow_ride', dificultad: 'expert'}));
  const la = await a.espera('lista'), lb = await b.espera('lista'); assert.equal(la.ronda, lb.ronda);
  a.send(JSON.stringify({t: 'listo', ronda: la.ronda})); b.send(JSON.stringify({t: 'listo', ronda: la.ronda}));
  const ir = await b.espera('ir'); assert.ok(ir.goEpoch > Date.now()); await a.espera('ir');
  a.send(JSON.stringify({t: 'estado', ronda: la.ronda, puntos: 100, racha: 3, rock: .5, energia: 0}));
  assert.equal((await b.espera('estado')).puntos, 100);
  a.send(JSON.stringify({t: 'ev', ronda: la.ronda, song: 1, ev: [1]})); assert.equal((await b.espera('ev')).song, 1);
  a.send(JSON.stringify({t: 'pausa', ronda: la.ronda, on: true})); assert.equal((await b.espera('pausa')).on, true);
  b.close(); const chau = await a.espera('chau'); assert.equal(chau.anfitrion, true);
  const c1 = await cli('/api/sala/chat'); await c1.espera('chat-hola'); const c2 = await cli('/api/sala/chat'); await c2.espera('chat-hola');
  c1.send(JSON.stringify({t: 'chat', texto: 'hola <b>', nombre: 'zz'})); const m = await c2.espera('chat'); assert.equal(m.nombre, 'ZZ'); assert.ok(!m.texto.includes('<'));
  a.close(); c1.close(); c2.close();
  console.log('respaldo OK');
} catch (e) { console.error('FALLÓ', e); process.exitCode = 1; }
servidor.close(); setTimeout(() => process.exit(process.exitCode || 0), 300);
