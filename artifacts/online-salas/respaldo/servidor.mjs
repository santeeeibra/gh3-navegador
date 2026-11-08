// Servidor de respaldo de las salas online (si Cloudflare falla). Sin dependencias: node respaldo/servidor.mjs
// Mismo protocolo y mismas reglas que src/index.js (Worker gh3-salas), pero con las salas en memoria.
// Variables: PORT (8899), ORIGENES (regex extra de orígenes permitidos, opcional).
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {aceptar, rechazar} from './ws-minimo.mjs';

const json = o => JSON.stringify(o);
const difs = ['easy', 'medium', 'hard', 'expert'];
const FIJAS = Array.from({length: 20}, (_, i) => 'SALA' + String.fromCharCode(65 + i));
const limpiarNombre = n => typeof n === 'string' ? n.toUpperCase().replace(/[^A-Z0-9ÑÁÉÍÓÚÜ _-]/g, '').trim().slice(0, 14) : '';
const modoFija = c => { const i = FIJAS.indexOf(c); return i < 0 ? null : (i < 10 ? 'cara' : 'coop'); };
const extra = process.env.ORIGENES ? new RegExp(process.env.ORIGENES) : null;
const origenOk = o => !o || /^https:\/\/(www\.)?lasvegasherogame\.com$/.test(o) || /^https:\/\/([a-z0-9-]+\.)?lvh3\.pages\.dev$/.test(o)
  || /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(o) || !!extra?.test(o);

const salas = new Map();
const sala = c => { let r = salas.get(c); if (!r) salas.set(c, r = {c, socks: new Set(), vence: 0, modo: null}); return r; };
const vivos = r => [...r.socks].filter(w => !w.s.cerrado);
const enviar = (r, o, salvo) => { for (const w of vivos(r)) if (w !== salvo) try { w.c.send(json(o)); } catch {} };
const estado = r => { const t = vivos(r); return {vdo: 3, nombres: t.map(w => w.s.nombre || '').filter(Boolean), jugadores: t.length, jugando: t.some(w => ['jugando', 'cargando'].includes(w.s.fase))}; };
const enFase = (r, fs) => vivos(r).some(w => fs.includes(w.s.fase));

setInterval(() => { for (const [c, r] of salas) if (!vivos(r).length && r.vence <= Date.now() && !modoFija(c) && c !== 'LOBBYCHAT') salas.delete(c); }, 60000).unref();

function cerrar(r, w) {
  const s = w.s; if (s.cerrado) return;
  s.cerrado = true;
  if (s.chat) { r.socks.delete(w); return; }
  for (const o of vivos(r)) Object.assign(o.s, o.s.fase !== 'jugando' ? {anfitrion: true, listo: false, fase: 'sala'} : {anfitrion: true});
  enviar(r, {t: 'chau', id: s.id, anfitrion: true}, w);
  r.socks.delete(w);
}

function mensaje(r, w, msg) {
  if (typeof msg !== 'string' || msg.length > 2048) return;
  let o; try { o = JSON.parse(msg); } catch { return; }
  if (!o || typeof o !== 'object') return;
  const s = w.s; if (s.cerrado) return;
  if (o.t === 'chat') {
    const texto = typeof o.texto === 'string' ? o.texto.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) : '';
    if (!texto) return;
    const ahora = Date.now(), ult = (s.ult || []).filter(x => ahora - x < 8000);
    if (ult.length >= 4) return w.c.send(json({t: 'chat-lento'}));
    if (s.chat && typeof o.nombre === 'string') s.nombre = limpiarNombre(o.nombre);
    s.ult = [...ult, ahora];
    const m = {t: 'chat', id: s.id, nombre: s.nombre || 'JUGADOR', texto, hora: ahora};
    for (const x of r.socks) if (x !== w && !x.s.cerrado && !!x.s.chat === !!s.chat) try { x.c.send(json(m)); } catch {}
    return;
  }
  if (s.chat) return;
  if (o.t === 'nombre') {
    const pk = v => String(v || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 32);
    Object.assign(s, {nombre: limpiarNombre(o.nombre), modelo: pk(o.modelo), guitarra: pk(o.guitarra)});
    enviar(r, {t: 'nombre', id: s.id, nombre: s.nombre, modelo: s.modelo, guitarra: s.guitarra}, w);
    for (const x of vivos(r)) if (x !== w && x.s.nombre) w.c.send(json({t: 'nombre', id: x.s.id, nombre: x.s.nombre, modelo: x.s.modelo || '', guitarra: x.s.guitarra || ''}));
    return;
  }
  if (o.t === 'hora' && Number.isFinite(o.cli)) return w.c.send(json({t: 'hora', srv: Date.now(), cli: o.cli}));
  if (o.t === 'chau') { cerrar(r, w); w.c.close(1000, 'salida'); return; }
  if (o.t === 'lista' && s.anfitrion && !enFase(r, ['jugando', 'cargando']) && /^[a-z0-9_]{1,64}$/.test(o.cancion) && difs.includes(o.dificultad)) {
    const seleccion = {cancion: o.cancion, dificultad: o.dificultad, modo: r.modo || (o.modo === 'coop' ? 'coop' : 'cara'), ronda: crypto.randomUUID()};
    for (const x of vivos(r)) Object.assign(x.s, {seleccion, listo: false, fase: 'cargando'});
    enviar(r, {t: 'lista', ...seleccion}); return;
  }
  if (o.t === 'reiniciar' && s.anfitrion && s.seleccion && enFase(r, ['jugando', 'cargando', 'terminado'])) {
    const seleccion = {...s.seleccion, ronda: crypto.randomUUID()};
    for (const x of vivos(r)) Object.assign(x.s, {seleccion, listo: false, fase: 'cargando'});
    enviar(r, {t: 'lista', ...seleccion, reinicio: true}); return;
  }
  if (o.t === 'listo' && s.fase === 'cargando' && o.ronda === s.seleccion?.ronda) {
    s.listo = true;
    const todos = vivos(r);
    if (todos.length === 2 && todos.every(x => x.s.listo && x.s.seleccion?.ronda === o.ronda)) {
      const goEpoch = Date.now() + 3000;
      for (const x of todos) Object.assign(x.s, {fase: 'jugando', goEpoch});
      enviar(r, {t: 'ir', goEpoch, ...s.seleccion});
    }
    return;
  }
  if (o.t === 'rtc' && ['oferta', 'respuesta', 'cand', 'hola', 'fin', 'hablando'].includes(o.k) && msg.length <= 12000) { enviar(r, {t: 'rtc', k: o.k, d: o.d ?? null, id: s.id}, w); return; }
  if (o.t === 'menu' && s.anfitrion && !['jugando', 'cargando'].includes(s.fase)) {
    const ahora = Date.now(); if (ahora - (s.ultimoMenu ?? 0) < 40) return;
    const pk = (v, max) => typeof v === 'string' && /^[a-z0-9_]+$/.test(v) ? v.slice(0, max) : '', n = v => Number.isFinite(v) ? Math.max(0, Math.min(999, v | 0)) : 0;
    s.ultimoMenu = ahora;
    enviar(r, {t: 'menu', screen: pk(o.screen, 16), group: n(o.group), selected: n(o.selected), song: pk(o.song, 64), difficulty: pk(o.difficulty, 8), page: pk(o.page, 16)}, w); return;
  }
  if (o.t === 'sugerir' && !s.anfitrion && !['jugando', 'cargando'].includes(s.fase) && typeof o.cancion === 'string' && /^[a-z0-9_]{1,64}$/.test(o.cancion)) {
    const ahora = Date.now(); if (ahora - (s.ultimaSug ?? 0) < 1000) return;
    s.ultimaSug = ahora; enviar(r, {t: 'sugerir', cancion: o.cancion}, w); return;
  }
  if (o.t === 'revancha' && !['jugando', 'cargando'].includes(s.fase)) { enviar(r, {t: 'revancha', id: s.id}, w); return; }
  if (o.t === 'ev' && s.fase === 'jugando' && o.ronda === s.seleccion?.ronda && Number.isFinite(o.song) && Array.isArray(o.ev) && o.ev.length <= 32) {
    enviar(r, {t: 'ev', ronda: o.ronda, song: o.song, ev: o.ev}, w); return;
  }
  if (o.t === 'pausa' && s.fase === 'jugando' && o.ronda === s.seleccion?.ronda) { enviar(r, {t: 'pausa', ronda: o.ronda, on: o.on === true}, w); return; }
  if ((o.t === 'estado' || o.t === 'fin') && s.fase === 'jugando' && o.ronda === s.seleccion?.ronda) {
    const {puntos, racha, rock, energia} = o; const prec = Number.isFinite(o.prec) ? Math.max(0, Math.min(1, o.prec)) : null;
    if (![puntos, racha, rock, energia].every(Number.isFinite) || puntos < 0 || puntos > 1e9 || racha < 0 || racha > 1e6 || rock < 0 || rock > 1 || energia < 0 || energia > 1) return;
    const ahora = Date.now();
    if (o.t === 'estado' && ahora - (s.ultimo ?? 0) < 180) return;
    s.ultimo = ahora; if (o.t === 'fin') s.fase = 'terminado';
    enviar(r, {t: o.t, ronda: s.seleccion.ronda, id: s.id, puntos, racha, rock, energia, activo: o.activo === true, fallida: o.fallida === true, prec, mult: Number.isFinite(o.mult) ? Math.max(1, Math.min(8, o.mult | 0)) : 1}, w);
  }
}

function unirse(r, c, s0) {
  const w = {c, s: s0}; r.socks.add(w);
  c.on('message', m => mensaje(r, w, m));
  c.on('close', () => cerrar(r, w));
  return w;
}

function conectarChat(c) {
  const r = sala('LOBBYCHAT');
  if (r.socks.size >= 60) { c.close(1013, 'lleno'); return; }
  const w = unirse(r, c, {chat: true, id: crypto.randomUUID(), nombre: '', ult: []});
  c.send(json({t: 'chat-hola', n: r.socks.size}));
  return w;
}

function conectarSala(c, codigo) {
  const r = sala(codigo), socks = vivos(r);
  if (!modoFija(codigo) && r.vence <= Date.now() && !socks.length) { c.close(1008, 'Sala inexistente o vencida'); return; }
  if (socks.length >= 2 || socks.some(w => w.s.fase === 'jugando')) { c.close(1013, 'ocupada'); return; }
  const anfitrion = socks.length === 0, id = crypto.randomUUID();
  const s = {id, anfitrion, fase: 'sala', listo: false};
  if (modoFija(codigo)) r.modo = modoFija(codigo);
  const seleccion = socks[0]?.s.seleccion;
  unirse(r, c, s);
  c.send(json({t: 'hola', id, anfitrion, modo: modoFija(codigo)}));
  if (seleccion) { s.seleccion = seleccion; s.fase = 'cargando'; c.send(json({t: 'lista', ...seleccion})); }
  enviar(r, {t: 'jugadores', n: vivos(r).length});
}


// ---- Comentarios (respaldo de /api/feedback de Pages) ----
// Si Cloudflare/D1 falla, el cliente manda el comentario acá y además lo deja en su bandeja para reenviarlo a D1 (request_id evita duplicados).
// Se guardan en memoria y en un .jsonl (en Render gratis se borra al reiniciar). Lectura: GET /api/feedback/pendientes con
// "Authorization: Bearer <CLAVE_ADMIN>" (variable de entorno; sin ella el endpoint no existe).
const CATEGORIAS = ['general', 'performance', 'audio', 'controls', 'loading', 'graphics', 'suggestion', 'other'];
const limpio = v => typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim() : null;
function validarComentario(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  const message = limpio(b.message ?? ''), nickname = limpio(b.nickname ?? '');
  if (!Number.isInteger(b.rating) || b.rating < 1 || b.rating > 5 || !CATEGORIAS.includes(b.category)) return null;
  if (message === null || nickname === null || message.length > 2000 || nickname.length > 40) return null;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(b.request_id || '')) return null;
  return {request_id: b.request_id, rating: b.rating, category: b.category, message, nickname,
    device: ['phone', 'tablet', 'desktop'].includes(b.device) ? b.device : 'unknown',
    browser: ['Edge', 'Firefox', 'Opera', 'Brave', 'Chrome', 'Safari', 'Other'].includes(b.browser) ? b.browser : 'Other'};
}
const ARCHIVO = process.env.COMENTARIOS_ARCHIVO || path.join(os.tmpdir(), 'gh3-comentarios-respaldo.jsonl');
const comentarios = [];
try { for (const l of fs.readFileSync(ARCHIVO, 'utf8').split('\n')) if (l.trim()) comentarios.push(JSON.parse(l)); } catch {}
const sal = crypto.randomBytes(8).toString('hex'), usos = new Map();
const limitado = ip => {
  const k = crypto.createHash('sha256').update(sal + ip).digest('hex'), ahora = Date.now(), l = (usos.get(k) || []).filter(x => ahora - x < 600000);
  if (l.length >= 3) { usos.set(k, l); return true; }
  l.push(ahora); usos.set(k, l); return false;
};
setInterval(() => { const ahora = Date.now(); for (const [k, l] of usos) if (!l.some(x => ahora - x < 600000)) usos.delete(k); }, 600000).unref();
function leerCuerpo(req, max = 12000) {
  return new Promise((res, rej) => {
    const partes = []; let n = 0;
    req.on('data', d => { n += d.length; if (n > max) { rej(Object.assign(Error('size'), {codigo: 413})); req.destroy(); } else partes.push(d); });
    req.on('end', () => res(Buffer.concat(partes).toString('utf8')));
    req.on('error', rej);
  });
}
async function rutaComentarios(req, res, u, dar) {
  if (u.pathname === '/api/feedback/pendientes') {
    const clave = process.env.CLAVE_ADMIN;
    if (!clave || req.method !== 'GET') return dar(404, 'no', 'text/plain');
    const dado = String(req.headers.authorization || '').replace(/^Bearer /, '');
    const a = crypto.createHash('sha256').update(dado).digest(), b = crypto.createHash('sha256').update(clave).digest();
    if (!crypto.timingSafeEqual(a, b)) return dar(401, 'no', 'text/plain');
    return dar(200, {total: comentarios.length, comentarios});
  }
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'content-type, apikey, authorization'); return dar(204, ''); }
  if (req.method !== 'POST') return dar(405, {error: 'method'});
  if (!req.headers.origin) return dar(403, {error: 'origin'});
  let body;
  try { body = JSON.parse(await leerCuerpo(req)); } catch (e) { return dar(e.codigo || 400, {error: e.codigo === 413 ? 'size' : 'json'}); }
  if (typeof body?.website === 'string' && body.website.trim()) return dar(200, {ok: true});
  const d = validarComentario(body); if (!d) return dar(400, {error: 'invalid'});
  if (comentarios.some(c => c.request_id === d.request_id)) return dar(200, {ok: true});
  const ip = String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (limitado(ip)) return dar(429, {error: 'rate_limit'});
  const fila = {...d, recibido: new Date().toISOString(), origen: 'respaldo'};
  comentarios.push(fila); if (comentarios.length > 500) comentarios.shift();
  try { fs.appendFileSync(ARCHIVO, JSON.stringify(fila) + '\n'); } catch {}
  return dar(200, {ok: true});
}

const cors = (req, res) => { const o = req.headers.origin; if (o && origenOk(o)) { res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin'); } };
const servidor = http.createServer(async (req, res) => {
  cors(req, res);
  const u = new URL(req.url, 'http://x');
  const dar = (st, cuerpo, tipo = 'application/json') => { res.writeHead(st, {'Content-Type': tipo, 'Cache-Control': 'no-store'}); res.end(typeof cuerpo === 'string' ? cuerpo : json(cuerpo)); };
  if (!origenOk(req.headers.origin)) return dar(403, 'origen', 'text/plain');
  if (u.pathname.startsWith('/api/feedback')) return rutaComentarios(req, res, u, dar);
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'GET'); return dar(204, ''); }
  if (req.method !== 'GET') return dar(405, 'método', 'text/plain');
  if (u.pathname === '/api/sala/salud' || u.pathname === '/') return dar(200, {ok: true, respaldo: true});
  if (u.pathname === '/api/sala/lista') {
    return dar(200, {v: 'nombres1', respaldo: true, salas: FIJAS.map((codigo, i) => ({codigo, numero: i + 1, modo: modoFija(codigo), ...estado(sala(codigo))}))});
  }
  if (u.pathname === '/api/sala/nueva') {
    const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    for (let i = 0; i < 12; i++) {
      const codigo = Array.from(crypto.randomBytes(5), x => letras[x % letras.length]).join('');
      if (codigo.startsWith('SALA')) continue;
      const r = sala(codigo);
      if (vivos(r).length || r.vence > Date.now()) continue;
      r.vence = Date.now() + 30 * 60 * 1000;
      return dar(200, {codigo});
    }
    return dar(503, 'No hay código disponible; reintentá', 'text/plain');
  }
  dar(400, 'solicitud', 'text/plain');
});
servidor.on('upgrade', (req, socket, head) => {
  const u = new URL(req.url, 'http://x');
  if (!origenOk(req.headers.origin)) return rechazar(socket, 403, 'Forbidden');
  const chat = u.pathname === '/api/sala/chat', m = u.pathname.match(/^\/api\/sala\/([A-Z]{5})$/);
  if (!chat && !m) return rechazar(socket, 400, 'Bad Request');
  const c = aceptar(req, socket, head); if (!c) return;
  if (chat) conectarChat(c); else conectarSala(c, m[1]);
});
export {servidor};
if (import.meta.url === new URL('file:///' + process.argv[1].replace(/\\/g, '/')).href || process.argv[1]?.endsWith('servidor.mjs')) {
  const puerto = Number(process.env.PORT) || 8899;
  servidor.listen(puerto, '0.0.0.0', () => console.log('[salas-respaldo] escuchando en ' + puerto));
}
