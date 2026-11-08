import {opcionesPartida} from '../../trucos.mjs';
// Claude 2026-11-04: concierto-06-escena. Slow Ride en z_party con el escenario completo, la banda y el público,
// todo deformado en GPU (paleta de huesos en textura RGBA32F 4xN). Cámaras y cortes originales de Slow Ride.
import {paletteAt} from './ska.mjs';
import {base} from './camara.js';

const $ = id => document.getElementById(id);
const cv = $('c'), gl = cv.getContext('webgl2', {antialias: true, preserveDrawingBuffer: true});
if (!gl) throw new Error('WebGL2 no disponible');
const json = async u => {
  if (!u.startsWith('datos/clip-') && !/^datos[/]personajes[/][a-z0-9_]+[/]clip-/.test(u)) return jsonOriginal(u);
  const r = await fetch(u + '.gz');
  if (!r.ok) throw new Error(u + ' ' + r.status);
  return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json();
};
const jsonOriginal = async u => { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); };
const estado = t => { $('estado').textContent = t; };

// ---------------- Shaders ----------------
function programa(vs, fs) {
  const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
  const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) { const n = gl.getActiveUniform(p, i).name; u[n] = gl.getUniformLocation(p, n); }
  return {p, u};
}
// Luces reales de z_party (Claude 2026-11-04): por grupo, ambiente + hasta 6 direccionales (z_party_gfx.qb, snapshots de z_party_snp.qb)
// + proyectores de los conos del snapshot (hot spots sobre el escenario).
const LUZ_GLSL = `uniform vec3 u_amb; uniform vec3 u_ld[6]; uniform vec3 u_lc[6]; uniform vec3 u_pp[12]; uniform vec3 u_pd[12]; uniform vec4 u_pc[12];
vec3 luz(vec3 p, vec3 n){ vec3 s = u_amb;
  for (int i = 0; i < 6; i++) s += u_lc[i] * max(dot(n, -u_ld[i]), 0.0);
  for (int i = 0; i < 12; i++) { vec3 L = p - u_pp[i]; float d = length(L); vec3 l = L / max(d, 1e-3);
    s += u_pc[i].rgb * smoothstep(u_pc[i].w, mix(u_pc[i].w, 1.0, 0.6), dot(l, u_pd[i])) * max(dot(n, -l), 0.0) * clamp(12.0 / (d * d), 0.0, 1.5); }
  return s; }`;
const PA = programa(`#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec3 a_nrm; layout(location=2) in vec2 a_uv;
layout(location=3) in vec3 a_bidx; layout(location=4) in vec3 a_bwgt;
uniform mat4 u_vp, u_world; uniform highp sampler2D u_bones;
out vec3 v_n; out vec2 v_uv; out vec3 v_w;
mat4 hueso(int b){ return mat4(texelFetch(u_bones,ivec2(0,b),0),texelFetch(u_bones,ivec2(1,b),0),texelFetch(u_bones,ivec2(2,b),0),texelFetch(u_bones,ivec2(3,b),0)); }
void main(){
  ivec3 bi = ivec3(a_bidx + 0.5);
  mat4 m = hueso(bi.x) * a_bwgt.x;
  if (a_bwgt.y != 0.0) m += hueso(bi.y) * a_bwgt.y;
  if (a_bwgt.z != 0.0) m += hueso(bi.z) * a_bwgt.z;
  vec4 w = u_world * (m * vec4(a_pos, 1.0));
  v_n = mat3(u_world) * (mat3(m) * a_nrm); v_uv = a_uv; v_w = w.xyz;
  gl_Position = u_vp * w;
}`, `#version 300 es
precision highp float; in vec3 v_n; in vec2 v_uv; in vec3 v_w; uniform sampler2D u_tex; uniform vec3 u_luz; out vec4 o;
${LUZ_GLSL}
void main(){ vec4 t = texture(u_tex, v_uv); if (t.a < 0.15) discard;
  o = vec4(t.rgb * luz(v_w, normalize(v_n)), 1.0); }`);
const PE = programa(`#version 300 es
layout(location=0) in vec3 a_pos; layout(location=2) in vec2 a_uv; uniform mat4 u_vp; out vec2 v_uv; out vec3 v_w;
void main(){ v_uv = a_uv; v_w = a_pos; gl_Position = u_vp * vec4(a_pos, 1.0); }`, `#version 300 es
precision highp float; in vec2 v_uv; in vec3 v_w; uniform sampler2D u_tex; uniform float u_gan; uniform vec3 u_cam; out vec4 o;
${LUZ_GLSL}
void main(){ vec4 t = texture(u_tex, v_uv); if (t.a < 0.4) discard;
  vec3 n = normalize(cross(dFdx(v_w), dFdy(v_w))); if (dot(n, u_cam - v_w) < 0.0) n = -n; // el .scn no trae normales: normal plana por derivadas
  // Lo lejano (fondo, periferia) no recibe las luces del show: vuelve al aspecto original sin luz.
  float lejos = smoothstep(12.0, 20.0, length(v_w.xz - vec2(0.0, 3.0)));
  o = vec4(mix(t.rgb * u_gan * luz(v_w, n), t.rgb * 0.85, lejos), 1.0); }`);
// Fuego de los barriles (Z_Party_GFX_*Fire*): billboard por instancia, llama procedural (la forma es nuestra).
const PF = programa(`#version 300 es
uniform mat4 u_vp; uniform vec3 u_der; uniform vec4 u_base[4]; uniform float u_alto, u_ancho; out vec2 v_q;
const vec2 Q[6] = vec2[6](vec2(-1, 0), vec2(1, 0), vec2(1, 1), vec2(-1, 0), vec2(1, 1), vec2(-1, 1));
void main(){ vec2 q = Q[gl_VertexID]; v_q = q;
  vec3 b = u_base[gl_InstanceID].xyz; gl_Position = u_vp * vec4(b + u_der * q.x * u_ancho + vec3(0.0, q.y * u_alto, 0.0), 1.0); }`, `#version 300 es
precision highp float; in vec2 v_q; uniform float u_t, u_k; out vec4 o;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main(){ float y = v_q.y, ruido = n(vec2(v_q.x * 3.0, y * 4.0 - u_t * 9.0)) * 0.6 + n(vec2(v_q.x * 7.0, y * 9.0 - u_t * 14.0)) * 0.4;
  float ancho = (1.0 - y) * 0.9 + 0.1, f = smoothstep(ancho, ancho * 0.3, abs(v_q.x)) * smoothstep(1.0, 0.2, y + ruido * 0.5) * smoothstep(0.0, 0.05, y);
  vec3 col = mix(vec3(1.0, 0.95, 0.6), vec3(1.0, 0.35, 0.05), clamp(y + ruido * 0.4, 0.0, 1.0));
  o = vec4(col * f * u_k * 1.6, 1.0); }`);
const ubic = (P, n) => gl.getUniformLocation(P.p, n);
// Conos de luz volumétricos (housings del snapshot con volumedensity > 0): cono unitario generado en el shader, aditivo.
const SEG = 24;
const PC = programa(`#version 300 es
uniform mat4 u_vp; uniform vec3 u_pos, u_dir; uniform vec3 u_r; out float v_z; out float v_borde;
void main(){ int lado = gl_VertexID % 2, k = gl_VertexID / 2; float a = 6.2831853 * float(k) / ${SEG}.0, z = float(lado);
  vec3 up = abs(u_dir.y) > 0.9 ? vec3(1, 0, 0) : vec3(0, 1, 0), x = normalize(cross(u_dir, up)), y = cross(u_dir, x);
  float rad = mix(u_r.x, u_r.y, z); v_z = z; v_borde = a;
  gl_Position = u_vp * vec4(u_pos + u_dir * z * u_r.z + (x * cos(a) + y * sin(a)) * rad, 1.0); }`, `#version 300 es
precision highp float; in float v_z; in float v_borde; uniform vec3 u_col; uniform float u_k; out vec4 o;
void main(){ o = vec4(u_col * u_k * pow(1.0 - v_z, 1.4) * 0.45, 1.0); }`);
// Chispas de la pirotecnia de z_party (GP_Party_LanternSparks01 en Z_Party_LanternSparksPos y GP_Party_LightSparks01 en la chimenea).
const CHISPAS = 40;
const PS = programa(`#version 300 es
uniform mat4 u_vp; uniform vec3 u_o[14]; uniform float u_t; uniform float u_esc; out float v_vida;
float h(float n){ return fract(sin(n * 12.9898) * 43758.5453); }
void main(){ int e = gl_VertexID / ${CHISPAS}; float i = float(gl_VertexID);
  float vida = 0.9 + 0.7 * h(i + 3.1), t = u_t - h(i + 7.7) * 0.25; v_vida = clamp(t / vida, 0.0, 1.0);
  vec3 v = normalize(vec3(h(i) - 0.5, h(i + 1.3) * 0.8 + 0.2, h(i + 2.7) - 0.5)) * (1.2 + 1.8 * h(i + 5.5));
  vec3 p = u_o[e] + v * max(t, 0.0) + vec3(0.0, -4.9, 0.0) * max(t, 0.0) * max(t, 0.0);
  gl_Position = u_vp * vec4(p, 1.0); gl_PointSize = (t < 0.0 || t > vida) ? 0.0 : u_esc * 0.12 / gl_Position.w; }`, `#version 300 es
precision highp float; in float v_vida; out vec4 o;
void main(){ vec2 c = gl_PointCoord - 0.5; float f = smoothstep(0.5, 0.0, length(c));
  o = vec4(mix(vec3(1.0, 0.95, 0.7), vec3(1.0, 0.4, 0.05), v_vida) * f * (1.0 - v_vida) * 2.0, 1.0); }`);

// ---------------- Texturas ----------------
const blanco = (() => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([200, 200, 200, 255])); return t; })();
function subirTex(fuente, w, h) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  if (w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, fuente); else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fuente);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return t;
}
const cacheTex = new Map();
const CANCION = (new URLSearchParams(location.search).get('cancion') || 'slowride').toLowerCase().replace(/[^a-z0-9_]/g, '');
// Claude 04/11: sin ?zona= se usa la sala original de la canción (datos/salas.json, de tabla-salas.mjs)
const ZONA = (new URLSearchParams(location.search).get('zona') || (await json('datos/salas.json').catch(() => ({})))[CANCION] || 'z_party').toLowerCase().replace(/[^a-z0-9_]/g, ''); // escenario: z_party (por defecto) u otro z_*
document.querySelector('header strong').textContent = CANCION + ' · ' + ZONA; document.title = 'Escena ' + CANCION + ' · ' + ZONA;
// Claude 04/11: copia web estática (exportar-web.mjs): modelos .json y texturas de personajes .png, sin servidor propio
const ESTATICO = document.documentElement.dataset.estatico === '1';
function texEscenario(id) {
  if (!id) return Promise.resolve(blanco);
  if (!cacheTex.has(id)) cacheTex.set(id, new Promise(ok => { const im = new Image(); im.onload = () => ok(subirTex(im)); im.onerror = () => ok(blanco); im.src = (ZONA === 'z_party' ? 'tex/' : 'texz/' + ZONA + '/') + id + '.png'; }));
  return cacheTex.get(id);
}
function texModelo(pak, id) {
  if (!id) return Promise.resolve(blanco);
  const k = pak + ':' + id;
  if (ESTATICO) { if (!cacheTex.has(k)) cacheTex.set(k, new Promise(ok => { const im = new Image(); im.onload = () => ok(subirTex(im)); im.onerror = () => ok(blanco); im.src = 'api/texture/' + pak + '/' + id + '.png'; })); return cacheTex.get(k); }
  if (!cacheTex.has(k)) cacheTex.set(k, fetch('api/texture/' + pak + '/' + id).then(async r => r.ok ? subirTex(new Uint8Array(await r.arrayBuffer()), +r.headers.get('X-Width'), +r.headers.get('X-Height')) : blanco).catch(() => blanco));
  return cacheTex.get(k);
}

// ---------------- Geometría ----------------
function vao(attrs, indices) {
  const v = gl.createVertexArray(); gl.bindVertexArray(v);
  for (const [loc, data, n] of attrs) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0); }
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null); return v;
}
const modelos = new Map();
function cargarModelo(id) {
  if (!modelos.has(id)) modelos.set(id, json('api/model/' + id + (ESTATICO ? '.json' : '')).then(async m => {
    const mallas = await Promise.all(m.meshes.map(async s => {
      const nv = s.nv, bi = new Float32Array(nv * 3), bw = new Float32Array(nv * 3);
      for (let v = 0; v < nv; v++) {
        const nb = s.boneIdx[4 * v + 3];
        for (let k = 0; k < 3; k++) bi[3 * v + k] = s.boneIdx[4 * v + k];
        bw[3 * v] = nb > 1 ? s.boneWgt[4 * v] : 1; bw[3 * v + 1] = nb > 1 ? s.boneWgt[4 * v + 1] : 0; bw[3 * v + 2] = nb > 2 ? s.boneWgt[4 * v + 2] : 0;
      }
      return {vao: vao([[0, new Float32Array(s.restPos), 3], [1, new Float32Array(s.restNrm), 3], [2, new Float32Array(s.uvs), 2], [3, bi, 3], [4, bw, 3]], new Uint32Array(s.indices)),
        n: s.indices.length, tex: await texModelo(id, s.diffuseTex), maxHueso: Math.max(...bi)};
    }));
    return {id, role: m.role, mallas, maxHueso: Math.max(...mallas.map(x => x.maxHueso))};
  }));
  return modelos.get(id);
}
function texHuesos(n) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, 4, n); return t;
}
const identidad = n => { const a = new Float32Array(16 * n); for (let i = 0; i < n; i++) a[16 * i] = a[16 * i + 5] = a[16 * i + 10] = a[16 * i + 15] = 1; return a; };

// ---------------- Matemática ----------------
const mul = (a, b) => { const r = new Float32Array(16); for (let c = 0; c < 4; c++) for (let f = 0; f < 4; f++) r[c * 4 + f] = a[f] * b[c * 4] + a[f + 4] * b[c * 4 + 1] + a[f + 8] * b[c * 4 + 2] + a[f + 12] * b[c * 4 + 3]; return r; };
const mundo = (p, yaw) => { const c = Math.cos(yaw), s = Math.sin(yaw); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, p[0], p[1], p[2], 1]); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function vista(e, r, u, f) { return new Float32Array([r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -dot(r, e), -dot(u, e), dot(f, e), 1]); }
function persp(fy, a, n, f) { const t = 1 / Math.tan(fy / 2); return new Float32Array([t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]); }

// ---------------- Carga ----------------
const t0 = performance.now();
estado('Cargando escena…');
const E = await json((CANCION === 'slowride' ? 'datos/escena' : 'datos/escena-' + CANCION) + (ZONA === 'z_party' ? '' : '-' + ZONA) + '.json');
// Tarjetas 2D del público con textura de relleno magenta (en el juego se generan en tiempo real): se ocultan, el público 3D ocupa ese lugar.
const RELLENO = new Set(['8bb6eee0', '7e364820', '43566190', 'f176bd80', '399632f0', 'cc169430']);
const escenario = (await json(ZONA === 'z_party' ? 'datos/escenario.json' : 'datos/escenario-' + ZONA + '.json')).filter(m => ZONA !== 'z_party' || !RELLENO.has(m.color));
const objEsc = await Promise.all(escenario.map(async m => ({vao: vao([[0, new Float32Array(m.pos), 3], [2, new Float32Array(m.uv), 2]], new Uint16Array(m.ind)), n: m.ind.length, tex: await texEscenario(m.color)})));
const clips = new Map();
const actores = [];
// Claude 05/11: ?personaje=<id>&modelo=<modelo>&guitarra=<modelo> cambia al guitarrista y su guitarra (datos de exportar-personaje.mjs).
// Los clips salen de datos/personajes/<id>/ con los nombres de Axel; si falta uno, se usa el clip base del personaje.
const Q = new URLSearchParams(location.search), PERS = (Q.get('personaje') || '').toLowerCase().replace(/[^a-z0-9_]/g, ''), MODELO = Q.get('modelo'), GUIT = Q.get('guitarra'), MODELO2 = Q.get('modelo2'), GUIT2 = Q.get('guitarra2');
// Claude 05/11: en online/coop el segundo jugador ocupa el lugar del bajista (como en GH3), con su modelo y guitarra; usa las animaciones del bajista.
const trucosEscena=opcionesPartida({online:!!MODELO2||(()=>{try{return new URLSearchParams(parent.location.search).has('online')||!!parent.__gh3Online?.active;}catch{return true;}})()});
const esBret=a=>trucosEscena.bret&&a.id==='cantante';
const modeloDe = a => a.id === 'guitarrista' ? MODELO : a.id === 'bajista' ? MODELO2 : esBret(a)?'Singer_Brett':null, guitDe = a => a.id === 'guitarrista' ? GUIT : a.id === 'bajista' ? GUIT2 : null;
const esMio = a => esBret(a)||(PERS && PERS !== 'axel' && a.id === 'guitarrista'); // clips propios del personaje
const cambia = a => !!(modeloDe(a) || guitDe(a)); // modelo y guitarra elegidos (también para Axel con otra ropa)
const ruta = (a, f) => esMio(a) ? 'datos/personajes/' + (esBret(a)?'brett':PERS) + '/' + f : 'datos/' + f;
const clipDe = (a, f, base) => { const r = ruta(a, f); if (!clips.has(r)) clips.set(r, esMio(a) ? json(r).catch(() => base) : json(r)); return clips.get(r); };
for (const a of E.actores) {
  estado('Cargando ' + a.id + '…');
  const [clip, cuerpo, ...adj] = await Promise.all([clipDe(a, a.clip), cargarModelo(modeloDe(a) || a.modelo), ...(guitDe(a) ? [guitDe(a)] : a.adjuntos).map(cargarModelo)]);
  // Director: lista de clips [inicioMs, archivo] armada en preparar.mjs desde la pista performance.
  const guion = E.guion?.[a.id] ? await Promise.all(E.guion[a.id].map(async ([t, f]) => ({t, clip: (await clipDe(a, f, clip)) ?? clip, nombre: f}))) : null;
  const propios = []; // todos los adjuntos (guitarra, bajo, micro, batería) usan huesos del rig del actor
  const manos = E.manos?.[a.id] ? await Promise.all(E.manos[a.id].map(async ([t, ...fs]) => ({t, clips: await Promise.all(fs.map(f => f ? clipDe(a, f, null) : null))}))) : null;
  const caras = !esBret(a)&&E.caras?.[a.id] ? await Promise.all(E.caras[a.id].map(async ([t, f, ms]) => ({t, ms, clip: await (clips.has(f) || clips.set(f, json('datos/' + f)), clips.get(f))}))) : null;
  actores.push({...a, guion, manos, caras, clipData: clip, cuerpo, ligados: adj.filter(m => !propios.includes(m)), propios, mundo: mundo(a.pos, a.yaw),
    huesos: texHuesos(clip.parents.length), identTex: propios.length ? (() => { const n = Math.max(...propios.map(m => m.maxHueso)) + 1, t = texHuesos(n); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 4, n, gl.RGBA, gl.FLOAT, identidad(n)); return t; })() : null});
}
const cargaMs = performance.now() - t0;

// ---------------- Cámaras de Slow Ride ----------------
const hash = i => { let x = (i + 1) * 2654435761 >>> 0; x ^= x >>> 15; return x >>> 0; };
function camaraEn(ms) {
  let idx = 0; for (let i = 0; i < E.cortes.length; i++) if (E.cortes[i][0] <= ms) idx = i;
  const [t, nota, dur] = E.cortes[idx], g = E.grupoNota[nota] || [ZONA + '_cameras', 'LongShot'];
  let lista = E.camaras.filter(c => c.grupo === g[0] && (!g[1] || c.tipo === g[1]));
  if (!lista.length) lista = E.camaras.filter(c => c.tipo === 'LongShot');
  const c = lista[hash(idx) % lista.length], k = Math.max(0, Math.min(1, (ms - t) / Math.max(1, dur)));
  const a = c.inicio, b = c.fin || c.inicio, l = (x, y) => x + (y - x) * k;
  return {nombre: c.nombre, nota, pose: {...a, pos: a.pos.map((v, i) => l(v, b.pos[i])), quat: a.quat.map((v, i) => l(v, b.quat[i])), fov: l(a.fov, b.fov)}};
}
let orbita = {yaw: 0.3, pit: 0.25, dist: 9}, modoCam = 'cancion', camMenu = null;
// Claude 05/11: encuadres de menú. 'guitarra' usa la cámara guitar_closeup del escenario si existe (lookat Guitarist,
// bone_guitar_body); 'personaje' es un plano entero del guitarrista corrido a la derecha (el panel del original va a la izquierda).
function encuadreMenu(modo) {
  const g = Object.entries(E.banda).find(([n]) => n.toLowerCase() === 'guitarist')?.[1]?.pos || [0, 0, 3];
  if (modo === 'guitarra') {
    const c = E.camaras.find(c => /guitar_closeup/i.test(c.nombre));
    if (c) return {pos: c.inicio.pos, mira: [g[0], g[1] + 1.0, g[2]], fov: c.inicio.fov || 24};
    return {pos: [g[0] - 0.3, g[1] + 1.15, g[2] + 2.9], mira: [g[0], g[1] + 1.0, g[2]], fov: 24};
  }
  // Claude 08/11: presentación online antes de tocar. 'pres-yo' = vos (guitarrista), 'pres-compa' = tu compañero (bajista),
  // 'pres-duo' = los dos de cuerpo entero. El vaivén lento lo agrega dibujar().
  const b = Object.entries(E.banda).find(([n]) => /bass/i.test(n))?.[1]?.pos || [g[0] + 2.5, g[1], g[2]];
  if (modo === 'pres-yo') return {pos: [g[0], g[1] + 1.2, g[2] + 3.6], mira: [g[0], g[1] + 1.0, g[2]], fov: 34};
  if (modo === 'pres-compa') return {pos: [b[0], b[1] + 1.2, b[2] + 3.6], mira: [b[0], b[1] + 1.0, b[2]], fov: 34};
  if (modo === 'pres-duo') { const m = [(g[0] + b[0]) / 2, (g[1] + b[1]) / 2, (g[2] + b[2]) / 2], d = Math.hypot(g[0] - b[0], g[2] - b[2]); return {pos: [m[0], m[1] + 1.25, m[2] + 2.6 + d * 0.8], mira: [m[0], m[1] + 1.0, m[2]], fov: 42}; }
  return {pos: [g[0] - 0.6, g[1] + 1.25, g[2] + 4.3], mira: [g[0] - 0.95, g[1] + 0.95, g[2]], fov: 38};
}
function ponerCamaraMenu(modo) {
  if (!modo) { modoCam = 'cancion'; camMenu = null; return; }
  const dest = encuadreMenu(modo), desde = camMenu?.ahora || camMenu || dest;
  camMenu = {...dest, desde: {pos: desde.pos, mira: desde.mira, fov: desde.fov}, t0: performance.now(), modo};
  modoCam = 'menu';
}
cv.addEventListener('mousemove', e => { if (e.buttons & 1) { orbita.yaw -= e.movementX * 0.01; orbita.pit = Math.max(-1.3, Math.min(1.3, orbita.pit + e.movementY * 0.01)); modoCam = 'orbita'; $('modo').value = 'orbita'; } });
cv.addEventListener('wheel', e => { orbita.dist *= e.deltaY > 0 ? 1.1 : 0.9; modoCam = 'orbita'; $('modo').value = 'orbita'; e.preventDefault(); }, {passive: false});
$('modo').onchange = e => { modoCam = e.target.value; };

// ---------------- Director: paleta del actor en el tiempo de la canción ----------------
const FUNDIDO_MS = 200;
// Claude 2026-11-04: brazos por IK (ver ska.mjs) cuando el clip deja hombro y codo sin pistas y anima el blanco de la mano.
const CADENAS = [[11, 12, 13, 102], [15, 16, 17, 103]];
function ikDe(a, clip) {
  if (!clip.ik) clip.ik = CADENAS.filter(([h, , , t]) => clip.tracks[t] && !clip.tracks[h].q.length && clip.tracks[t].q.length);
  return clip.ik.length ? clip.ik : null;
}
function paleta(a, ms) {
  if (!a.guion) return paletteAt(a.clipData, ((ms / 1000) * 60 + a.desfase) % a.clipData.endTick);
  const g = a.guion; let lo = 0, hi = g.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (g[m].t <= ms) lo = m; else hi = m - 1; }
  const seg = g[lo], enSeg = Math.max(0, ms - seg.t); a.clipActual = seg.clip.name;
  let capas = null;
  if (a.manos) { const m = a.manos; let l = 0, h = m.length - 1; while (l < h) { const x = (l + h + 1) >> 1; if (m[x].t <= ms) l = x; else h = x - 1; }
    const dt = (Math.max(0, ms - m[l].t) / 1000) * 60; capas = m[l].clips.filter(Boolean).map(c => ({clip: c, tick: Math.min(dt, c.endTick - 1)})); }
  // Cara (Band_PlayFacialAnim): mientras dura el clip, pisa los huesos de la cara del cuerpo.
  if (a.caras) for (const c of a.caras) if (ms >= c.t && ms < c.t + c.ms) { (capas ||= []).unshift({clip: c.clip, tick: ((ms - c.t) / 1000) * 60, pisa: true}); break; }
  const p = paletteAt(seg.clip, ((enSeg / 1000) * 60) % seg.clip.endTick, false, capas, ikDe(a, seg.clip));
  if (lo === 0 || enSeg >= FUNDIDO_MS) return p;
  const ant = g[lo - 1], q = paletteAt(ant.clip, Math.min(ant.clip.endTick - 1, ((ms - ant.t) / 1000) * 60) % ant.clip.endTick, false, capas, ikDe(a, ant.clip));
  const k = enSeg / FUNDIDO_MS, out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i++) out[i] = q[i] + (p[i] - q[i]) * k;
  return out;
}

// ---------------- Luces y efectos: notas de la canción (LightShow_NoteMapping) + luces reales de z_party (datos/luces.json) ----------------
const LUCES = E.luces || [], LZ = await json(ZONA === 'z_party' ? 'datos/luces.json' : 'datos/luces-' + ZONA + '.json');
const MOODS = {76: 'intro', 75: 'verse', 74: 'chorus', 73: 'solo', 72: 'blackout', 71: 'flare', 70: 'strobe'};
// Colores de LightShow_OverrideColor: el juego usa nombres (green, red...); el RGB exacto no está leído, estos son los nominales.
const COLORES = {69: [0, 1, 0], 68: [1, 0, 0], 67: [0, 0, 1], 66: [1, 1, 0], 65: [1, 1, 1], 64: [1, 0, 1], 62: [1, 0.5, 0], 61: [0.5, 0, 1]};
const MEZCLA_MS = 300, GRUPOS = ['banda', 'escenario', 'publico'];
let nivel = new URLSearchParams(location.search).get('nivel') || 'medium';
// Datos de un snapshot listos para uniforms: por grupo ambiente + 6 direccionales; conos (proyector y volumen).
const cacheSnap = new Map();
$('nivel').value = nivel; $('nivel').onchange = e => { nivel = e.target.value; cacheSnap.clear(); };
function datosSnap(nombre, color) {
  const k = nombre + '|' + color; if (cacheSnap.has(k)) return cacheSnap.get(k);
  const S = LZ.snapshots[nombre], out = {}, col = color ? color.split(',').map(Number) : null;
  for (const g of GRUPOS) {
    const amb = [0, 0, 0], ld = [], lc = [];
    for (const [n, L] of Object.entries(LZ.luces)) {
      const v = S.luces[n]; if (!v || (L.grupo !== g && !(g === 'banda' && L.grupo === 'alt'))) continue;
      const c = (col && L.tipo === 'dir' ? col : v.slice(0, 3)).map(x => x * v[3]);
      if (L.tipo === 'ambient') c.forEach((x, i) => { amb[i] += x; }); else if (ld.length < 6) { ld.push(L.dir); lc.push(c); }
    }
    while (ld.length < 6) { ld.push([0, -1, 0]); lc.push([0, 0, 0]); }
    out[g] = {amb, ld: ld.flat(), lc: lc.flat()};
  }
  const pp = [], pd = [], pc = [];
  for (const c of S.conos.slice(0, 12)) { const pcol = col || c.proyector; pp.push(...c.pos); pd.push(...c.dir); pc.push(...pcol.map(x => x * 1.2), Math.cos(Math.atan2(c.r1, c.largo))); }
  while (pp.length < 36) { pp.push(0, -100, 0); pd.push(0, -1, 0); pc.push(0, 0, 0, 1); }
  out.proy = {pp, pd, pc};
  out.conos = S.conos.filter(c => c.densidad > 0).map(c => ({...c, color: col || c.color}));
  cacheSnap.set(k, out); return out;
}
const mezclar = (a, b, k) => a.map((x, i) => x + (b[i] - x) * k);
function estadoLuces(ms) {
  let mood = 'intro', color = null, idx = 0, tCambio = -1e9, previo = null, actual = null, tPiro = -1e9, tStrobe = -1e9, dStrobe = 0;
  const snapDe = () => { const l = (LZ.mapeo[nivel] || LZ.mapeo.medium)[mood]; return l[idx % l.length]; };
  const cambiar = t => { const n = snapDe(); if (n !== actual) { previo = actual; actual = n; tCambio = t; } };
  cambiar(-1e9);
  for (const [t, n, d] of LUCES) {
    if (t > ms) break;
    if (MOODS[n]) { if (MOODS[n] !== mood) { mood = MOODS[n]; idx = 0; } cambiar(t); }
    else if (n === 63) color = null; else if (COLORES[n]) color = COLORES[n];
    else if (n === 57 || n === 58) { idx++; cambiar(t); }
    else if (n === 60) { tStrobe = t; dStrobe = Math.max(d, 120); }
    else if (n === 56) tPiro = t;
  }
  const ck = color && color.join(), A = datosSnap(actual, ck), k = previo ? Math.min(1, (ms - tCambio) / MEZCLA_MS) : 1;
  let D = A;
  if (k < 1) {
    const P = datosSnap(previo, ck); D = {proy: A.proy, conos: A.conos};
    for (const g of GRUPOS) D[g] = {amb: mezclar(P[g].amb, A[g].amb, k), ld: A[g].ld, lc: mezclar(P[g].lc, A[g].lc, k)};
  }
  // Strobe (Strobe_Generic sobre Blackout01): destellos blancos durante la nota strobetoggle o el mood strobe.
  const strobe = (mood === 'strobe' || ms < tStrobe + dStrobe) && (Math.floor(ms / 50) & 1) ? 1.2 : 0;
  return {mood, snap: actual, D, strobe, color: !!color, piroT: (ms - tPiro) / 1000};
}
function luzUniforms(P, L, grupo) {
  const G = L.D[grupo], s = L.strobe;
  gl.uniform3f(ubic(P, 'u_amb'), G.amb[0] + s, G.amb[1] + s, G.amb[2] + s);
  gl.uniform3fv(ubic(P, 'u_ld'), G.ld); gl.uniform3fv(ubic(P, 'u_lc'), G.lc);
  gl.uniform3fv(ubic(P, 'u_pp'), L.D.proy.pp); gl.uniform3fv(ubic(P, 'u_pd'), L.D.proy.pd); gl.uniform4fv(ubic(P, 'u_pc'), L.D.proy.pc);
}
const chimenea = Object.values(LZ.snapshots).flatMap(s => s.conos).find(c => /Chimney01/.test(c.nombre)); // z_party: Chorus01; otras zonas no tienen ese nombre
const ORIGEN_CHISPAS = [...LZ.linternas, ...(chimenea ? [chimenea.pos] : ZONA === 'z_party' ? [[-0.6, 3.5, 0.6]] : [])];
const fuegosDe = () => LZ.fuegos.filter(f => nivel === 'good' ? /GoodFire/.test(f.nombre) : nivel === 'medium' ? /MediumFire/.test(f.nombre) : false);

// ---------------- Reloj y dibujo ----------------
let camPos = [0, 0, 0], luzActual = null, cancionMs = 0, tocando = false, ultimo = 0, cuadros = [], ultimoCpu = 0, ultimoPal = 0, draws = 0, camActual = '';
$('t').max = E.duracionMs;
function dibujar() {
  const c0 = performance.now();
  const w = cv.clientWidth * devicePixelRatio | 0, h = cv.clientHeight * devicePixelRatio | 0;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  gl.viewport(0, 0, w, h); gl.clearColor(0.03, 0.03, 0.05, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
  const asp = w / h; let V, fovY, der; const L = estadoLuces(cancionMs); luzActual = L;
  if (modoCam === 'menu' && camMenu) {
    // Claude 05/11: cámara de los selectores (menu_character_select / menu_guitar_select): fija sobre el guitarrista, con transición corta.
    const k = Math.min(1, (performance.now() - camMenu.t0) / 600), s = k * k * (3 - 2 * k), l = (a, b) => a.map((v, i) => v + (b[i] - v) * s);
    const e = l(camMenu.desde.pos, camMenu.pos), ctr = l(camMenu.desde.mira, camMenu.mira), fov = camMenu.desde.fov + (camMenu.fov - camMenu.desde.fov) * s;
    camMenu.ahora = {pos: e, mira: ctr, fov};
    if (/^pres-/.test(camMenu.modo)) { const t = (performance.now() - camMenu.t0) / 1000; e[0] += Math.sin(t * 0.5) * 0.35; e[1] += Math.sin(t * 0.33) * 0.08; e[2] -= Math.min(t, 8) * 0.06; }
    const f = ctr.map((v, i) => v - e[i]), lf = Math.hypot(...f), fn = f.map(v => v / lf);
    const r = [-fn[2], 0, fn[0]].map(v => v / Math.hypot(fn[0], fn[2])), u = [r[1] * fn[2] - r[2] * fn[1], r[2] * fn[0] - r[0] * fn[2], r[0] * fn[1] - r[1] * fn[0]];
    der = r; camPos = e; V = vista(e, r, u, fn); fovY = 2 * Math.atan(Math.tan(fov * Math.PI / 360) / asp); camActual = 'menú';
  } else if (modoCam === 'orbita') {
    const ctr = ZONA === 'z_party' ? [0, 1, 3] : [E.banda.vocalist.pos[0], 1, E.banda.vocalist.pos[2]], e = [ctr[0] + orbita.dist * Math.cos(orbita.pit) * Math.sin(orbita.yaw), ctr[1] + orbita.dist * Math.sin(orbita.pit), ctr[2] + orbita.dist * Math.cos(orbita.pit) * Math.cos(orbita.yaw)];
    const f = ctr.map((v, i) => v - e[i]), lf = Math.hypot(...f), fn = f.map(v => v / lf);
    const r = [-fn[2], 0, fn[0]].map(v => v / Math.hypot(fn[0], fn[2])), u = [r[1] * fn[2] - r[2] * fn[1], r[2] * fn[0] - r[0] * fn[2], r[0] * fn[1] - r[1] * fn[0]];
    der = r; camPos = e; V = vista(e, r, u, fn); fovY = 50 * Math.PI / 180; camActual = 'órbita';
  } else {
    const c = camaraEn(cancionMs), b = base(c.pose, E.banda, 'quat');
    der = b.derecha; camPos = c.pose.pos; V = vista(c.pose.pos, b.derecha, b.arriba, b.adelante);
    fovY = 2 * Math.atan(Math.tan(c.pose.fov * Math.PI / 360) / asp); camActual = c.nombre + ' (nota ' + c.nota + ')';
  }
  const VP = mul(persp(fovY, asp, 0.05, 400), V);
  draws = 0;
  if ($('ver-esc').checked) {
    gl.useProgram(PE.p); gl.uniformMatrix4fv(PE.u.u_vp, false, VP); gl.uniform1f(PE.u.u_gan, 1.0); gl.uniform1i(PE.u.u_tex, 0); gl.uniform3fv(ubic(PE, 'u_cam'), camPos); luzUniforms(PE, L, 'escenario'); gl.activeTexture(gl.TEXTURE0);
    for (const o of objEsc) { gl.bindTexture(gl.TEXTURE_2D, o.tex); gl.bindVertexArray(o.vao); gl.drawElements(gl.TRIANGLES, o.n, gl.UNSIGNED_SHORT, 0); draws++; }
  }
  gl.useProgram(PA.p); gl.uniformMatrix4fv(PA.u.u_vp, false, VP); luzUniforms(PA, L, 'banda'); let grupoActual = 'banda';
  gl.uniform1i(PA.u.u_tex, 0); gl.uniform1i(PA.u.u_bones, 1);
  const p0 = performance.now(), verPub = $('ver-pub').checked;
  for (const a of actores) {
    if (a.publico && !verPub) continue;
    // Claude 04/11: cámaras de público (z_dive Mid_Center01) caen dentro de una persona; no dibujar a quien tiene la cámara encima
    if (a.publico && Math.hypot(a.pos[0] - camPos[0], a.pos[2] - camPos[2]) < 0.6) continue;
    const g = a.publico ? 'publico' : 'banda'; if (g !== grupoActual) { luzUniforms(PA, L, g); grupoActual = g; }
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, a.huesos);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 4, a.clipData.parents.length, gl.RGBA, gl.FLOAT, paleta(a, cancionMs));
    gl.uniformMatrix4fv(PA.u.u_world, false, a.mundo);
    for (const m of [a.cuerpo, ...(trucosEscena.air&&a.id==='guitarrista'?[]:a.ligados)]) for (const s of m.mallas) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, s.tex); gl.bindVertexArray(s.vao); gl.drawElements(gl.TRIANGLES, s.n, gl.UNSIGNED_INT, 0); draws++; }
    if (a.propios.length) {
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, a.identTex);
      for (const m of a.propios) for (const s of m.mallas) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, s.tex); gl.bindVertexArray(s.vao); gl.drawElements(gl.TRIANGLES, s.n, gl.UNSIGNED_INT, 0); draws++; }
    }
  }
  // Efectos aditivos: conos de luz del snapshot, fuego de barriles según nivel, chispas de pirotecnia.
  gl.bindVertexArray(null); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
  if ($('ver-efe').checked) {
    gl.useProgram(PC.p); gl.uniformMatrix4fv(ubic(PC, 'u_vp'), false, VP);
    for (const c of L.D.conos) {
      gl.uniform3fv(ubic(PC, 'u_pos'), c.pos); gl.uniform3fv(ubic(PC, 'u_dir'), c.dir); gl.uniform3f(ubic(PC, 'u_r'), c.r0, c.r1, c.largo);
      gl.uniform3fv(ubic(PC, 'u_col'), c.color); gl.uniform1f(ubic(PC, 'u_k'), c.densidad); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 2 * SEG + 2); draws++;
    }
    const fu = fuegosDe();
    if (fu.length) {
      gl.useProgram(PF.p); gl.uniformMatrix4fv(ubic(PF, 'u_vp'), false, VP); gl.uniform3fv(ubic(PF, 'u_der'), der);
      const b = fu.map(f => [...f.pos, 0]).flat(); while (b.length < 16) b.push(0, -100, 0, 0);
      gl.uniform4fv(ubic(PF, 'u_base'), b); gl.uniform1f(ubic(PF, 'u_alto'), 0.9); gl.uniform1f(ubic(PF, 'u_ancho'), 0.3);
      gl.uniform1f(ubic(PF, 'u_t'), cancionMs / 1000); gl.uniform1f(ubic(PF, 'u_k'), 1); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, fu.length); draws++;
    }
    if (L.piroT >= 0 && L.piroT < 2.5 && ORIGEN_CHISPAS.length) {
      gl.useProgram(PS.p); gl.uniformMatrix4fv(ubic(PS, 'u_vp'), false, VP); gl.uniform3fv(ubic(PS, 'u_o'), ORIGEN_CHISPAS.flat());
      gl.uniform1f(ubic(PS, 'u_t'), L.piroT); gl.uniform1f(ubic(PS, 'u_esc'), h); gl.drawArrays(gl.POINTS, 0, CHISPAS * ORIGEN_CHISPAS.length); draws++;
    }
  }
  gl.disable(gl.BLEND); gl.depthMask(true);
  gl.bindVertexArray(null);
  ultimoPal = performance.now() - p0; ultimoCpu = performance.now() - c0;
  $('t').value = cancionMs;
  $('info').textContent = (cancionMs / 1000).toFixed(2) + ' s · ' + camActual + ' · CPU ' + ultimoCpu.toFixed(2) + ' ms · ' + draws + ' dibujos';
}
function cuadro(now) {
  if (!tocando) return;
  cancionMs = Math.min(E.duracionMs, cancionMs + (now - ultimo)); ultimo = now;
  dibujar(); cuadros.push({now, cpu: ultimoCpu});
  if (cuadros.length > 600) cuadros.shift();
  if (cuadros.length > 30) { const d = cuadros.at(-1).now - cuadros[0].now, cpu = cuadros.map(x => x.cpu).sort((a, b) => a - b);
    $('perf').textContent = (1000 * (cuadros.length - 1) / d).toFixed(1) + ' cuadros/s · CPU p95 ' + cpu[Math.ceil(cpu.length * 0.95) - 1].toFixed(2) + ' ms'; }
  requestAnimationFrame(cuadro);
}
function tocar() { tocando = !tocando; $('tocar').textContent = tocando ? 'Pausar' : 'Reproducir'; if (tocando) { ultimo = performance.now(); cuadros = []; requestAnimationFrame(cuadro); } }
$('tocar').onclick = tocar;
$('t').oninput = () => { cancionMs = +$('t').value; dibujar(); };
for (const id of ['ver-esc', 'ver-pub']) $(id).onchange = dibujar;
document.addEventListener('visibilitychange', () => { if (document.hidden && tocando) tocar(); });
dibujar();
estado(CANCION + ' · ' + ZONA + ' · ' + escenario.length + ' mallas de escenario · ' + actores.length + ' personajes (' + actores.filter(a => a.publico).length + ' de público) · carga ' + (cargaMs / 1000).toFixed(1) + ' s');
window.__escena = {nivel: v => { nivel = v; cacheSnap.clear(); }, seek: ms => { cancionMs = ms; dibujar(); return {luz: luzActual && {mood: luzActual.mood, snap: luzActual.snap, conos: luzActual.D.conos.length, strobe: luzActual.strobe, piroT: +luzActual.piroT.toFixed(2), color: luzActual.color}, banda: Object.fromEntries(actores.filter(a => a.guion).map(a => [a.id, a.clipActual])), cam: camActual, cpu: ultimoCpu, pal: ultimoPal, draws, gl: gl.getError()}; },
  modo: m => { modoCam = m; $('modo').value = m; dibujar(); }, orbita, cargaMs, actores: actores.map(a => a.id + ':' + a.clipNombre)};

// Claude 2026-11-04: modo fondo (?fondo=1) para el Motor 0.6. La página del juego manda {ms, corre} por postMessage
// con el tiempo de canción de su reloj de audio; acá se extrapola entre mensajes y se dibuja en cada cuadro.
if (new URLSearchParams(location.search).has('fondo')) {
  document.body.style.display = 'block';
  for (const el of document.querySelectorAll('header, footer')) el.style.display = 'none';
  $('c').style.cssText = 'position:fixed;inset:0;width:100%;height:100%';
  let msRec = -2000, tRec = performance.now(), corre = false, dibujado = NaN;
  addEventListener('message', ev => { const d = ev.data; if (d?.tipo === 'gh3-camara') { if ((d.modo || null) !== (camMenu?.modo || null)) ponerCamaraMenu(d.modo || null); return; } if (!d || d.tipo !== 'gh3-cancion') return;
    msRec = d.ms; tRec = performance.now(); corre = !!d.corre; if (d.nivel && d.nivel !== nivel) { nivel = d.nivel; cacheSnap.clear(); } });
  const loop = now => {
    const ms = Math.max(0, Math.min(E.duracionMs, msRec + (corre ? Math.min(now - tRec, 100) : 0)));
    if (ms !== dibujado || corre) { cancionMs = ms; dibujar(); dibujado = ms; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  parent.postMessage({tipo: 'gh3-escena-lista'}, '*');
}
