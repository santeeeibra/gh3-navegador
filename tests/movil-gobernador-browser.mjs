// Gobernador móvil en el navegador (Chromium + WebGPU por software SwiftShader), SIN el juego:
// A) worker GPU REAL (web/gh3-native60/r5snap-native60-gpu.js) con dibujos y shaders SINTÉTICOS (no del juego):
//    escala 1280×720 → 960×540 → 640×360 y vuelta en marcha, telemetría en el tablero, presupuestos y texturas de
//    escena diferidas bajo presión (lo esencial siempre se dibuja).
// B) página: gh3-governor.js + worklet de audio REAL de index.html con productor simulado + native60-page.js con un
//    worker falso que entrega el tablero: el gobernador protege en riesgo, llega a mínimo con un corte, recupera
//    despacio, «observa» no actúa, y la latencia escritura→lectura del juego se mide.
// SwiftShader no representa la GPU del iPhone: sólo valida funcionamiento, no rendimiento.
// Uso: node tests/movil-gobernador-browser.mjs   (resultado en artifacts/movil-gobernador/verification.json)
import fs from 'node:fs';
import {serveWeb, launch, IPHONE11_LANDSCAPE, checker} from './lib/movil-server.mjs';

const out = 'artifacts/movil-gobernador'; fs.mkdirSync(out, {recursive: true});
const report = {checks: [], errors: [], nota: 'WebGPU SwiftShader (software) y emulación: valida lógica y cableado, no rendimiento del iPhone. La presentación al lienzo WebGPU no se puede probar en esta nube (lienzo falso).'};
const check = checker(report);

// ---------- A) página de prueba del worker GPU ----------
// En esta nube (Chromium sin GPU, SwiftShader) ningún lienzo WebGPU puede presentar ("A valid external Instance
// reference no longer exists", también con un programa mínimo), en worker o en la página. Por eso el MISMO bundle del
// worker corre en la página con un OffscreenCanvas falso que dibuja en una textura común (se leen sus píxeles) y un
// puerto falso. Se prueba todo el worker y el renderer con WebGPU real salvo la presentación final al lienzo.
const gpuPage = `<!doctype html><meta charset="utf-8"><script type="module">
const C = (await import('/control.mjs')).C;
const shaders = {
  SYNVS: {id: 'SYNVS', stage: 'vs', constants: [], code: '@group(0) @binding(0) var<storage, read> xe_memory: array<f32>;\\n@vertex fn main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> { return vec4<f32>(xe_memory[i * 2u], xe_memory[i * 2u + 1u], 0.0, 1.0); }'},
  SYNPS: {id: 'SYNPS', stage: 'ps', constants: [], code: '@group(2) @binding(0) var xe_texture0: texture_2d_array<f32>;\\n@group(2) @binding(1) var xe_sampler0: sampler;\\n@fragment fn main() -> @location(0) vec4<f32> { return textureSampleLevel(xe_texture0, xe_sampler0, vec2<f32>(0.5, 0.5), 0, 0.0); }'},
};
const quad = (x0, x1) => new Uint8Array(new Float32Array([x0, -1, x1, -1, x1, 1, x0, 1]).buffer);
const tex = (key, rgba, scene, revision = 1) => ({key, revision, width: 4, height: 4, layers: 1, format: 'rgba8unorm', bytesPerRow: 16, rowsPerImage: 4, scene, data: new Uint8Array(64).map((_, i) => rgba[i % 4])});
// Dibujo esencial (pista): rojo a la izquierda. Dibujo de escena NO esencial con textura propia: azul a la derecha.
const draw = (x0, x1, t, essential, n) => ({manifest: {draw: n, vs: 'SYNVS', ps: 'SYNPS', video: false, indices: 6, blend: 0x10001, raster: 0, depth: 0, stencil: 0, writeMask: 15, scissor: [0, 0, 1280, 720], essential, identity: 'd' + n},
  textures: [{slot: 0, sampler: {mag: 0, min: 0, mip: 0, clampX: 2, clampY: 2}, texture: t}], assets: {'memory.bin': quad(x0, x1), 'indices.bin': new Uint8Array(new Uint32Array([0, 1, 2, 0, 2, 3]).buffer)}});
class FakeCanvas {
  constructor(w, h) { this.width = w; this.height = h; window.canvas = this; }
  getContext() { const c = this; return {configure(o) { c.device = o.device; c.tex = o.device.createTexture({size: [c.width, c.height], format: o.format, usage: o.usage | GPUTextureUsage.COPY_SRC}); }, getCurrentTexture: () => c.tex}; }
  transferToImageBitmap() { return {close() {}}; }
}
const code = await (await fetch('/r5snap-native60-gpu.js')).text();
// stage: etapa del juego en el tablero (0 sin dato, 1 cargas/menús, 2 canción); snapshots=false: arranca sin dibujos (go() los empieza).
window.start = async (cpuLevel, stage = 0, snapshots = true) => {
  const board = new SharedArrayBuffer(128), ctl = new Int32Array(board); Atomics.store(ctl, C.VERSION, 1); Atomics.store(ctl, C.CPU, cpuLevel || 0); Atomics.store(ctl, C.STAGE, stage);
  const transport = new SharedArrayBuffer(4), st = window.st = {ctl, frames: 0, errors: [], stats: null};
  const port = {onmessage: null, start() {}, postMessage(m) { if (m.type !== 'frame') return; st.frames++; const l = new Int32Array(m.latch); Atomics.add(l, 1, 1); Atomics.store(l, 0, 0); }};
  const send = new Function('postMessage', 'OffscreenCanvas', 'let onmessage;\\n' + code + '\\nreturn (d) => onmessage({data: d});')((m) => {
    if (m.type === 'error') st.errors.push(m.error); if (m.type === 'stats') { st.stats = m.gpu; st.temporal = m.temporal; } if (m.type === 'ready') st.ready = true; }, FakeCanvas);
  send({type: 'init', shaders, presentation: board, transport, port, sceneMotion: false});
  while (!st.ready && !st.errors.length) await new Promise((r) => setTimeout(r, 20));
  let seq = 0;
  window.go = () => st.timer = setInterval(() => {
    const inputs = [draw(-1, 0, tex('pista', [255, 0, 0, 255], false), true, 0), draw(0.2, 1, tex('escena', window.sceneColor || [0, 0, 255, 255], true, window.sceneRev || 1), false, 1)];
    Atomics.store(new Int32Array(transport), 0, 1);
    send({type: 'snapshot', inputs, info: {seq: ++seq}, at: performance.timeOrigin + performance.now(), timing: {}});
  }, 50);
  if (snapshots) go();
};
// Pipelines recordados por la precarga (IndexedDB del worker; acá el worker corre en la página).
window.remembered = () => new Promise((res) => { const r = indexedDB.open('gh3-native60', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('pipelines'); g.onsuccess = () => { r.result.close(); res(g.result || []); }; }; });
// Lee el último cuadro del lienzo falso (1280×720 rgba8unorm).
window.px = async (x, y) => {
  const d = canvas.device, buf = d.createBuffer({size: 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ}), e = d.createCommandEncoder();
  e.copyTextureToBuffer({texture: canvas.tex, origin: [x, y, 0]}, {buffer: buf, bytesPerRow: 256}, [1, 1, 1]); d.queue.submit([e.finish()]);
  await buf.mapAsync(GPUMapMode.READ); const v = [...new Uint8Array(buf.getMappedRange()).slice(0, 4)]; buf.unmap(); buf.destroy(); return v;
};
window.stop = () => clearInterval(st.timer);
</script>`;

// ---------- B) página del gobernador ----------
// Como el script de cabecera de index.html: marca celular/PC (de eso depende el modo por defecto).
const govPage = `<!doctype html><meta charset="utf-8"><body><script>window.gh3Quality={mobile:/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)};</script><script src="/native60-page.js"></script><script src="/gh3-input.js"></script><script src="/gh3-governor.js"></script>`;

const web = await serveWeb({routes: {
  '/gpu': {body: gpuPage},
  '/gov': {body: govPage},
  '/control.mjs': {body: fs.readFileSync('tools/r5-native60/control.mjs'), type: 'text/javascript'},
}});
const browser = await launch();
const settle = (page, ms) => page.waitForTimeout(ms);
const near = (a, b, tol = 8) => a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= tol);

try {
  // ---------------- A ----------------
  {
    const page = await (await browser.newContext()).newPage(); page.on('pageerror', (e) => report.errors.push(e.message));
    await page.goto(web.url + '/gpu'); await page.waitForFunction(() => window.start); await page.evaluate(() => start(0)); await settle(page, 800);
    const ctl = () => page.evaluate(() => { const C = st.ctl; return {scale: C[18], rendered: C[19], gpuUs: C[14], workerUs: C[25], texKiB: C[16], cpuKiB: C[17], bufKiB: C[23], deferred: C[21], lost: C[20], frames: st.frames, errors: st.errors}; });
    let c = await ctl();
    check('A worker GPU (bundle real) arranca y dibuja con WebGPU (SwiftShader)', c.frames > 5 && !c.errors.length, c);
    check('A telemetría en el tablero: cuadros, espera GPU, costo del worker, memoria', c.rendered > 5 && c.workerUs > 0 && c.gpuUs >= 0 && c.bufKiB >= 0 && c.scale === 100, c);
    check('A normal 1280×720: pista roja y escena azul', near(await page.evaluate(() => px(320, 360)), [255, 0, 0]) && near(await page.evaluate(() => px(1000, 360)), [0, 0, 255]));
    for (const [level, pct] of [[1, 75], [2, 50], [1, 75], [0, 100]]) {
      await page.evaluate((l) => Atomics.store(st.ctl, 4, l), level); await settle(page, 600);
      c = await ctl();
      const red = await page.evaluate(() => px(320, 360)), blue = await page.evaluate(() => px(1000, 360)), dark = await page.evaluate(() => px(700, 360));
      check(`A perilla GPU ${level} → escala ${pct} % aplicada en marcha, imagen correcta`, c.scale === pct && near(red, [255, 0, 0], 12) && near(blue, [0, 0, 255], 12) && near(dark, [0, 0, 0], 12) && !c.errors.length, {scale: c.scale, red, blue, dark});
    }
    const r1 = c.rendered; await settle(page, 500); c = await ctl();
    check('A sigue dibujando tras 4 cambios de escala (sin pérdida de dispositivo)', c.rendered > r1 && c.lost === 0 && !c.errors.length);
    await page.evaluate(() => Atomics.store(st.ctl, 5, 2)); await settle(page, 1300);
    const s = await page.evaluate(() => st.stats);
    check('A perilla de memoria 2 → presupuesto de texturas GPU 24 MiB', s?.textureBudgetBytes === 24 << 20, s && s.textureBudgetBytes);
    const formats = await page.evaluate(() => st.temporal?.compression);
    check('A informa formatos comprimidos reales del adaptador', Array.isArray(formats) && formats.includes('texture-compression-bc'), formats);
    await page.evaluate(() => stop());
    // Bajo presión de CPU desde el inicio: la textura NUEVA de escena no se sube; la pista sí.
    await page.reload(); await page.waitForFunction(() => window.start); await page.evaluate(() => start(1)); await settle(page, 800); c = await ctl();
    const redP = await page.evaluate(() => px(320, 360)), blueP = await page.evaluate(() => px(1000, 360));
    check('A protegido: la pista (esencial) se dibuja y la escena con textura nueva se difiere', near(redP, [255, 0, 0]) && near(blueP, [0, 0, 0]) && c.deferred > 0, {redP, blueP, deferred: c.deferred});
    await page.evaluate(() => Atomics.store(st.ctl, 3, 0)); await settle(page, 600);
    check('A al volver a normal la escena aparece', near(await page.evaluate(() => px(1000, 360)), [0, 0, 255]));
    // Textura de escena que CAMBIA durante la presión: no se convierte en canción y se actualiza al terminar la presión.
    await page.evaluate(() => { Atomics.store(st.ctl, 3, 1); window.sceneColor = [0, 255, 0, 255]; window.sceneRev = 2; }); await settle(page, 600);
    const still = await page.evaluate(() => px(1000, 360));
    await page.evaluate(() => Atomics.store(st.ctl, 3, 0)); await settle(page, 600);
    const updated = await page.evaluate(() => px(1000, 360));
    check('A textura de escena que cambia bajo presión: se mantiene la anterior y se actualiza al terminar', near(still, [0, 0, 255]) && near(updated, [0, 255, 0]), {still, updated});
    await page.evaluate(() => stop());
  }

  // ---------------- C: precarga de pipelines (dos sesiones, mismo almacenamiento) ----------------
  {
    const page = await (await browser.newContext()).newPage(); page.on('pageerror', (e) => report.errors.push(e.message));
    const ctl = () => page.evaluate(() => { const C = st.ctl; return {preloaded: C[27], pending: C[28], songBuilds: C[29], frames: st.frames, errors: st.errors, stats: st.stats && {pipelineBuilds: st.stats.pipelineBuilds, preloadBuilds: st.stats.preloadBuilds}}; });
    await page.goto(web.url + '/gpu'); await page.waitForFunction(() => window.start);
    await page.evaluate(() => start(0, 2)); await settle(page, 1200);
    let c = await ctl();
    check('C sesión 1 en canción: compila en juego (sin recuerdos) y lo cuenta', c.songBuilds === 1 && c.preloaded === 0 && c.frames > 5 && !c.errors.length, c);
    check('C con la canción en juego no guarda nada todavía', (await page.evaluate(() => remembered())).length === 0);
    await page.evaluate(() => Atomics.store(st.ctl, 26, 1)); await settle(page, 600);
    const mem = await page.evaluate(() => remembered());
    check('C al salir de la canción guarda el pipeline usado (marcado como de canción)', mem.length === 1 && mem[0].s === 1 && mem[0].n === 1 && mem[0].d.vs === 'SYNVS', mem);
    await page.evaluate(() => stop());
    await page.reload(); await page.waitForFunction(() => window.start);
    await page.evaluate(() => start(0, 1, false)); await settle(page, 1200);
    c = await ctl();
    check('C sesión 2 en carga: precompila lo recordado sin dibujos del juego', c.preloaded === 1 && c.pending === 0 && c.frames === 0 && !c.errors.length, c);
    await page.evaluate(() => { Atomics.store(st.ctl, 26, 2); go(); }); await settle(page, 1000);
    c = await ctl();
    check('C sesión 2 en canción: no compila nada en juego y dibuja bien', c.songBuilds === 0 && c.frames > 5 && near(await page.evaluate(() => px(320, 360)), [255, 0, 0]) && !c.errors.length, c);
    await page.evaluate(() => stop());
  }

  // ---------------- B ----------------
  {
    const ctx = await browser.newContext(IPHONE11_LANDSCAPE), page = await ctx.newPage();
    page.on('pageerror', (e) => report.errors.push(e.message));
    await page.goto(web.url + '/gov');
    check('B celular: gobernador en modo «activo»', (await page.evaluate(() => gh3Governor.mode)) === 'activo');
    // Tiempos cortos para la prueba (los reales: 10 s / 5 s / 3 s y 6 s de anticipo).
    await page.evaluate(() => gh3Governor.setConfig({anticipate: {startMs: 0}, recover: {fromProtMs: 1500, fromMinMs: 800, minDwellMs: 300}}));
    // Worklet REAL de index.html con productor simulado a ritmo real.
    const worklet = JSON.parse(/new Blob\(\[(".*?")\], \{ type/s.exec(fs.readFileSync('web/gh3-native60/index.html', 'utf8'))[1]);
    await page.evaluate(async (code) => {
      const ctx = window.r6ctx = new AudioContext({sampleRate: 48000});
      await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([code], {type: 'text/javascript'})));
      const CAP = 1 << 16, ring = new SharedArrayBuffer(8 + CAP * 8); new Uint32Array(ring, 4, 1)[0] = CAP;
      const w = new Uint32Array(ring, 0, 1), tel = new SharedArrayBuffer(64); Atomics.store(new Int32Array(tel), 6, 0x7fffffff);
      const node = new AudioWorkletNode(ctx, 'r6-gh3', {outputChannelCount: [2], processorOptions: {sab: ring, ptr: 0, tel}});
      node.connect(ctx.destination); await ctx.resume();
      // Productor: sigue al reloj del AudioContext; window.prod = fracción de tiempo real (1 = normal, 0 = parado).
      window.prod = 1; let written = 12000, last = ctx.currentTime; Atomics.store(w, 0, written);
      setInterval(() => { const now = ctx.currentTime; written += Math.round((now - last) * 48000 * window.prod); last = now; Atomics.store(w, 0, written >>> 0); }, 10);
      window.tel = new Int32Array(tel);
      gh3Governor.attachAudio(tel);
    }, worklet);
    // Tablero entregado por native60-page.js desde un worker falso (como lo hace el consumidor real).
    await page.evaluate(() => {
      const code = `const sab=new SharedArrayBuffer(128),i=new Int32Array(sab);Atomics.store(i,24,1);const ch=new MessageChannel();
        postMessage({type:'r5NativePort',port:ch.port2,latch:sab},[ch.port2]);onmessage=()=>postMessage({type:'knobs',v:[i[2],i[3],i[4],i[5],i[7]]});`;
      const w = window.fake = new Worker(URL.createObjectURL(new Blob([code], {type: 'text/javascript'})));
      w.addEventListener('message', (e) => { if (e.data.type === 'knobs') window.knobs = e.data.v; });
    });
    const knobs = async () => { await page.evaluate(() => { window.knobs = null; fake.postMessage(0); }); await page.waitForFunction(() => window.knobs); return page.evaluate(() => window.knobs); };
    await settle(page, 2500);
    let s = await page.evaluate(() => gh3Governor.summary());
    check('B worklet real sonando con telemetría (colchón y producción medidos)', s.medidas.colchonMs > 100 && s.medidas.produccionAudio > 0.9 && !s.sinAudio && !s.sinTablero, s.medidas);
    check('B en calma: normal y tablero en 0 (activo)', JSON.stringify(await knobs()) === '[0,0,0,0,1]', {knobs: await knobs(), transiciones: s.transiciones, medidas: s.medidas});
    // Productor al 85 %: el colchón cae → protegido.
    await page.evaluate(() => { window.prod = 0.85; }); await page.waitForFunction(() => gh3Governor.core.out.level >= 1, null, {timeout: 8000});
    let k = await knobs();
    check('B producción de audio insuficiente → protegido, CPU recortada', k[0] >= 1 && k[1] >= 1 && k[4] === 1, {knobs: k, por: (await page.evaluate(() => gh3Governor.summary().transiciones.at(-1)?.por))});
    // Parón total: corte → mínimo.
    await page.evaluate(() => { window.prod = 0; }); await page.waitForFunction(() => gh3Governor.core.out.level === 2, null, {timeout: 8000});
    const cutsAtMin = await page.evaluate(() => tel[1]);
    await page.waitForFunction(() => tel[1] >= 1, null, {timeout: 8000});  // con el productor parado el corte llega igual
    k = await knobs();
    check('B colchón crítico/corte de audio → mínimo (CPU y GPU al mínimo)', k[0] === 2 && k[1] === 2 && k[2] === 2, {knobs: k, minimoAntesDelCorte: cutsAtMin === 0});
    // Vuelve el productor (con colchón): recupera de a un escalón.
    await page.evaluate(() => { window.prod = 1.3; }); await settle(page, 400); await page.evaluate(() => { window.prod = 1; });
    const levels = [];
    for (let i = 0; i < 40 && (levels.at(-1) ?? 2) > 0; i++) { await settle(page, 250); levels.push(await page.evaluate(() => gh3Governor.core.out.level)); }
    check('B recuperación escalonada hasta normal (mínimo → protegido → normal)', levels.at(-1) === 0 && levels.includes(1), levels.join(','));
    s = await page.evaluate(() => gh3Governor.summary());
    check('B validación: el corte queda registrado como falla y no se borra', s.audio.cortes >= 1 && s.audio.falla === true, s.audio);
    check('B informe con métricas separadas (imagen / simulación / controles)', 'fpsPresentados' in s.medidas && 'swapsJuegoPorSeg' in s.medidas && 'latenciaJuego' in s.medidas && s.transiciones.length >= 3);
    // Latencia escritura al mando → lectura del juego (el "juego" lee a los 40 ms).
    await page.evaluate(() => { const sab = new SharedArrayBuffer(64); window.pad = new Int32Array(sab, 0, 11); gh3Input.attach(sab, 0); gh3Input.setTouch(2, 0);
      setTimeout(() => Atomics.exchange(pad, 10, 0), 40); });
    await settle(page, 150);
    const lat = await page.evaluate(() => gh3Input.stats.lat);
    check('B latencia escritura→lectura del juego medida (≈40 ms, resolución 8 ms)', lat.n === 1 && lat.lastMs >= 38 && lat.lastMs < 70, lat);
    await page.evaluate(() => gh3Input.setTouch(0, 0));
    fs.writeFileSync(out + '/resumen-activo.json', JSON.stringify(await page.evaluate(() => gh3Governor.summary()), null, 2));
    await ctx.close();
  }
  {
    // Modo observa (PC por defecto): decide y registra, pero no toca el tablero.
    const page = await (await browser.newContext()).newPage(); page.on('pageerror', (e) => report.errors.push(e.message));
    await page.goto(web.url + '/gov');
    check('B PC: gobernador en modo «observa» por defecto', (await page.evaluate(() => gh3Governor.mode)) === 'observa');
    await page.evaluate(() => {
      gh3Governor.setConfig({anticipate: {startMs: 0}});
      const sab = new SharedArrayBuffer(128); window.ctl = new Int32Array(sab); Atomics.store(ctl, 24, 1); gh3Governor.attachControl(sab);
      const tel = new SharedArrayBuffer(64); window.tel = new Int32Array(tel); Atomics.store(window.tel, 9, 9600); Atomics.store(window.tel, 10, 1);
      gh3Governor.attachAudio(tel);
      let blocks = 0; setInterval(() => { Atomics.store(window.tel, 4, ++blocks); Atomics.store(window.tel, 0, 1000); Atomics.store(window.tel, 5, 1e6); }, 20);
    });
    await page.waitForFunction(() => gh3Governor.core.out.level === 2, null, {timeout: 5000});
    const s = await page.evaluate(() => ({sum: gh3Governor.summary(), board: [ctl[2], ctl[3], ctl[4], ctl[5], ctl[7]]}));
    check('B observa: decide «mínimo» pero el tablero queda en 0 (no actúa)', s.sum.decision.estado === 'mínimo' && s.sum.estado === 'normal' && JSON.stringify(s.board) === '[0,0,0,0,0]', s);
  }
  {
    const page = await (await browser.newContext()).newPage();
    await page.goto(web.url + '/gov?gov=0');
    check('B ?gov=0: apagado', (await page.evaluate(() => gh3Governor.mode)) === 'apagado');
  }
  {
    // La página real carga el gobernador (sin el juego).
    const ctx = await browser.newContext(IPHONE11_LANDSCAPE), page = await ctx.newPage(); page.on('pageerror', (e) => report.errors.push(e.message));
    await page.goto(web.url + '/'); await page.waitForSelector('#loaderPanel');
    check('B index.html: gobernador cargado y activo en celular, sin arrancar el juego', await page.evaluate(() => gh3Governor.mode === 'activo' && !window.g1worker && gh3Governor.summary().sinAudio));
    await ctx.close();
  }
  const ours = report.errors.filter((e) => !/WebGPU|navigator\.gpu|manifest|lista de archivos/i.test(e));
  check('sin errores de página', ours.length === 0, ours);
} catch (e) {
  report.failed = (report.failed || 0) + 1; report.crash = e.stack; console.error(e);
} finally {
  await browser.close(); await web.close();
  report.ok = !report.failed;
  fs.writeFileSync(out + '/verification.json', JSON.stringify(report, null, 2));
  console.log(report.ok ? `MOVIL_GOBERNADOR_OK (${report.checks.length} comprobaciones)` : `MOVIL_GOBERNADOR_FALLA (${report.failed})`);
  process.exitCode = report.ok ? 0 : 1;
}
