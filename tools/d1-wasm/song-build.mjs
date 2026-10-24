// Canción híbrida (Claude): página LOCAL para tocar una canción del GH3 original en Edge.
// Parte de la demo R6 (build SIMD + audio AudioWorklet + controles C1) y le agrega la autopista provisoria
// (gh3-song.js) que dibuja las notas reales al ritmo del reloj de la canción leído de la memoria del juego.
// Sin el video de R5 (menos carga). NO publicar: contiene código del juego.
// Uso: node tools/d1-wasm/song-build.mjs   → artifacts/d1-wasm/r6/song
// Servir: D4_ROOT="D:/guitar hero/artifacts/d1-wasm/r6/song" node tools/d1-wasm/serve-d4.mjs 5394
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..'), out = resolve(root, process.env.R6_SONG_OUT || 'artifacts/d1-wasm/r6/song');
// Validated host audio pacing; R6_SONG_WEB can select the original build for comparison.
execFileSync(process.execPath, [resolve(root, 'tools/d1-wasm/r6-build-demo.mjs')], { env: { ...process.env, R6_AUDIO_BUFFER_MS: '200', R6_WEB: process.env.R6_SONG_WEB || 'artifacts/song-sync/pacing/web', R6_DEMO_OUT: out }, stdio: 'inherit' });
await copyFile(resolve(root, 'tools/d1-wasm/gh3-song.js'), resolve(out, 'gh3-song.js'));
const clock = JSON.parse(await readFile(resolve(root, 'tools/d1-wasm/song-clock.json'), 'utf8'));
// Botones automáticos hasta entrar a la canción (Carrera → Medium → héroe → Play Show → Slow Ride), igual que las
// corridas que llegaron a la partida. Después el jugador toca con teclado o mando.
// Pantallas confirmadas con capturas del nativo (artifacts/g0/r6-song-nativo3) con la misma secuencia de botones.
const STEPS = [
  [150, 'start', 'Pantalla de título "PRESS ANY BUTTON TO ROCK"'],
  [175, 'start', 'Pantalla de controles "In the event of rock"'],
  [196, 'a', 'Menú principal → CAREER (Carrera)'],
  [204, 'a', 'Nombre de la banda → escribe una letra'],
  [208, 'start', 'Acepta el nombre de la banda'],
  [216, 'a', 'Dificultad → MEDIUM (ya viene marcada)'],
  [224, 'a', 'Elegir héroe → Axel Steel'],
  [232, 'a', 'Menú del héroe → PLAY SHOW'],
  [240, 'a', 'Saltea la película de la Carrera'],
  [248, 'a', 'Cartel del lugar (Backyard Bash)'],
  [256, 'a', 'Lista de canciones → SLOW RIDE (la primera)'],
  [264, 'a', 'Presentación del lugar → empieza la canción'],
];
const press = STEPS.map(([t, b]) => `${t}:${b}`).join(',');

let html = (await readFile(resolve(out, 'index.html'), 'utf8')).replace(/\r\n/g, '\n');  // la página base mezcla CRLF
const swap = (a, b) => { if (!html.includes(a)) throw Error('falta en index.html: ' + a.slice(0, 70)); html = html.replace(a, b); };
swap(/<head><script>if \(!location\.search\.includes\('r5consumer='\)\)[^<]*<\/script>/.exec(html)[0],
  `<head><script>if (!location.search.includes('song=')) location.replace('/?' + new URLSearchParams({ song: '1', cpwait: 'event', audio: 'silent', xma: 'decode', waitmulti: 'event', audiotap: '1', press: ${JSON.stringify(press)} }));</script>`);
swap('</body>', `<div class="card" id="songBox"><b>Canción (autopista PROVISORIA dibujada por la página; audio, aciertos y puntaje son del GH3 original)</b><br>
<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">
<canvas id="hw" width="440" height="620" style="background:#111;max-width:100%"></canvas>
<div style="flex:1;min-width:260px">
<p><button id="skipIntro" disabled>Saltear intro</button> <button id="goSong" disabled>Ir directo a tocar</button><br>
<small>Saltear intro: pasa rápido los videos del arranque y sigue solo hasta la canción (~65 s). Ir directo a tocar: también pasa rápido los menús (~50 s).</small><br>
<span id="navStat"></span></p>
<b id="stepsTitle">Pasos hasta la canción (los hace el juego solo):</b>
<ol id="songSteps" style="padding-left:22px;line-height:1.7"></ol>
<p id="stepsMode"></p></div></div>
<p id="songStat">Elegí la carpeta del juego y tocá Arrancar. Los menús no tienen imagen todavía: seguí los pasos de la lista.</p>
<p style="font-weight:bold">Para acertar: mantené la tecla del color (A S D F G) y apretá ↓ o ↑ cuando la nota llegue al aro. Apretar solo el color no rasguea.</p>
<button id="copySongAudio">Copiar estado del sonido</button><pre id="songAudioDiagnostic" hidden style="white-space:pre-wrap"></pre>
<p>Teclado en la canción: trastes A S D F G (o 1-5), rasgueo flecha abajo/arriba, poder estelar Espacio. Mando en la canción (esquema de GH3): verde L2/LT, rojo L1/LB, amarillo R1/RB, azul R2/RT, naranja Cruz/A, rasgueo cruceta.
Ajuste visual (ms): <input id="songOff" type="number" value="${clock.offsetMs}" step="10" style="width:70px">
<button id="notesLater">Notas más tarde</button> <button id="notesEarlier">Notas más temprano</button>
<button id="syncReset">Restablecer</button><br>
<small>Se guarda en este navegador. Si las notas llegan antes del sonido, probá «Notas más tarde» (20 ms por clic). Mantené el traste y rasgueá con la flecha cuando la nota llegue al aro.</small></p></div>
<script src="gh3-song.js"></script>
<script>
(() => {
  const CLOCK = ${JSON.stringify(clock)};
  const S = window.gh3Song, cv = document.getElementById('hw'), stat = document.getElementById('songStat');
  S.offsetMs = CLOCK.offsetMs;  // el reloj va adelantado respecto de la imagen/juicio del juego (medido en el nativo)
  const syncKey = 'gh3-song-sync-v2';
  try { const saved = localStorage.getItem(syncKey); if (saved !== null && Number.isFinite(Number(saved))) S.offsetMs = Math.max(-1500, Math.min(1500, Number(saved))); } catch {}
  const syncInput = document.getElementById('songOff'); syncInput.value = S.offsetMs;
  // La autopista va arriba de todo (antes quedaba debajo del registro) y se ocultan la prueba R3c y el registro largo.
  const main = document.querySelector('main') || document.body;
  const ctl = document.getElementById('dir').closest('.card') || main.children[1];
  ctl.after(document.getElementById('songBox'));
  // Audio status next to the playable road, rather than below the long log.
  const audioStatus = document.getElementById('r6Audio'), audioReset = document.getElementById('r6ResetAudio');
  if (audioStatus) stat.after(audioStatus);
  if (audioReset && audioStatus) audioStatus.after(audioReset);
  document.getElementById('copySongAudio').onclick = async () => {
    const text = JSON.stringify({ audio: window.d4?.r6Audio || null, clockMs: S.clock?.(), visualOffsetMs: S.offsetMs, song: S.chart?.name, browser: navigator.userAgent }, null, 2);
    const output = document.getElementById('songAudioDiagnostic'); output.hidden = false; output.textContent = text;
    try { await navigator.clipboard.writeText(text); } catch {}
  };
  for (const id of ['r3cBox']) { const el = document.getElementById(id); if (el) el.hidden = true; }
  const logEl = document.getElementById('log'); if (logEl) logEl.style.maxHeight = '120px';
  let t0 = null; document.getElementById('go').addEventListener('click', () => { t0 = performance.now(); });
  // Pasos hasta la canción. Automático: se tilda cada paso cuando el juego recibe el botón ([g1e] press origin=schedule).
  // Manual (?manual=1, sin botones automáticos): la lista indica qué tecla apretar en cada pantalla.
  const STEPS = ${JSON.stringify(STEPS)}, manual = new URLSearchParams(location.search).get('manual') === '1';
  const KEYNAME = { start: 'Enter (START)', a: 'tecla 1 (botón A / verde)' };
  let done = 0;
  const renderSteps = () => {
    document.getElementById('songSteps').innerHTML = STEPS.map(([t, b, what], k) => {
      const mark = manual ? '' : k < done ? '✓ ' : k === done && t0 !== null ? '▶ ' : '';
      const when = manual ? '' : ' <span style="opacity:.6">(~' + t + ' s)</span>';
      return '<li style="' + (!manual && k < done ? 'opacity:.55' : !manual && k === done ? 'font-weight:600' : '') + '">' + mark + what + ' — <b>' + KEYNAME[b] + '</b>' + when + '</li>';
    }).join('') + '<li>' + (done >= STEPS.length ? '▶ ' : '') + '<b>¡A tocar!</b> Las notas aparecen en la autopista.</li>';
  };
  document.getElementById('stepsTitle').textContent = manual ? 'Pasos hasta la canción (hacelos vos, sin imagen):' : 'Pasos hasta la canción (los hace el juego solo):';
  document.getElementById('stepsMode').innerHTML = manual
    ? 'Modo manual. Esperá ~2 min a la pantalla de título antes del primer Enter y dejá ~8 s entre pantallas (algunas cargan). <a href="/">Volver al modo automático</a>'
    : 'Los botones van solos; no hace falta tocar nada hasta la canción. <a href="/?song=1&manual=1&cpwait=event&audio=silent&xma=decode&waitmulti=event&audiotap=1">Prefiero hacerlo yo (modo manual)</a>';
  renderSteps();
  S.waitText = () => {
    if (t0 === null) return 'Elegí la carpeta del juego y tocá Arrancar.';
    if (manual) return 'Modo manual: seguí los pasos de la lista. Las notas aparecen cuando empieza la canción.';
    const left = Math.max(0, Math.round(CLOCK.navEnd + 10 - (performance.now() - t0) / 1000));
    return left > 0 ? 'Entrando solo a Slow Ride (paso ' + Math.min(done + 1, STEPS.length) + ' de ' + STEPS.length + '): faltan ~' + left + ' s' : 'Cargando la canción…';
  };
  setInterval(renderSteps, 1000);
  // Botones rápidos. Cancelan el calendario (?press=) y aprietan en vivo, guiados por lo que abre el juego:
  // gh.png = pasó la pantalla de título; GH3_Intro.bik = llegó al menú principal. Después del nombre de banda todas
  // las pantallas hasta la canción se pasan con A, así que se repite A hasta que arranca el reloj de la canción.
  const seen = window.navSeen = {};
  let live = null, navBusy = false;
  const BTN = { a: 0x1000, start: 0x0010 };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const tap = async (b) => {
    if (!live) return; const i32 = new Int32Array(live.sab, live.ptr, 11);
    Atomics.or(i32, 10, BTN[b]); Atomics.store(i32, 1, BTN[b]); Atomics.add(i32, 0, 1);
    await sleep(150); Atomics.store(i32, 1, 0); Atomics.add(i32, 0, 1);
  };
  const inSong = () => { const v = S.clock ? S.clock() : 0; return Number.isFinite(v) && v !== 0; };
  const navStat = (t) => { document.getElementById('navStat').textContent = t; };
  async function fastNav(mode) {
    if (navBusy || !window.g1worker) return; navBusy = true;
    document.getElementById('skipIntro').disabled = document.getElementById('goSong').disabled = true;
    navStat('Esperando que cargue el juego…');
    while (!live) await sleep(200);  // el juego ya arrancó (antes, llamar al wasm lo hace abortar)
    window.g1worker.postMessage({ type: 'pressClear' });
    const tStart = performance.now(), limit = (s) => performance.now() - tStart < s * 1000;
    navStat('Salteando los videos del arranque…');
    while (!seen.title && limit(300)) { await tap('start'); await sleep(1000); }
    done = Math.max(done, 1); navStat('Pantalla de controles…');
    while (!seen.menu && limit(330)) { await tap('start'); await sleep(1500); }
    done = Math.max(done, 2); navStat('Menú principal → Carrera…');
    const gap = mode === 'song' ? 2500 : 5000;
    await sleep(3000); await tap('a'); done = 3;          // CAREER
    await sleep(gap); await tap('a'); done = 4;           // letra del nombre de banda
    await sleep(1500); await tap('start'); done = 5;      // aceptar nombre
    navStat('Dificultad, héroe, Play Show, lista → Slow Ride…');
    while (!inSong() && limit(420)) { await sleep(gap); if (inSong()) break; await tap('a'); if (done < STEPS.length) done++; }
    done = STEPS.length; renderSteps();
    navStat(inSong() ? '¡Listo! Ya estás en la canción.' : 'No llegó a la canción: probá el modo manual o recargá.');
    navBusy = false;
  }
  document.getElementById('skipIntro').onclick = () => fastNav('intro');
  document.getElementById('goSong').onclick = () => fastNav('song');
  document.getElementById('go').addEventListener('click', () => { document.getElementById('skipIntro').disabled = document.getElementById('goSong').disabled = false; });
  let files = null, loading = null;
  const W = window.Worker;
  window.Worker = function (...a) {
    const w = new W(...a); window.g1worker = w;
    w.addEventListener('message', (e) => {
      if (e.data?.type === 'g1Mem') S.attachClock(e.data.sab, e.data.seg, parseInt(CLOCK.addr, 16), CLOCK.kind);
      if (e.data?.type === 'g1eInput') live = { sab: e.data.sab, ptr: e.data.ptr };
      if (e.data?.type === 'log') {
        const t = e.data.text;
        if (/\\[g1e\\] press .*origin=schedule/.test(t)) { done++; renderSteps(); }
        if (/memcard\\\\gh\\.png/i.test(t)) seen.title = true;
        if (/GH3_Intro\\.bik/i.test(t)) seen.menu = true;
      }
    });
    setInterval(() => w.postMessage({ type: 'memReq' }), 3000);  // la memoria crece: pedir la vista actual
    return w;
  };
  document.getElementById('dir').addEventListener('change', (e) => { files = e.target.files; });
  const setSync = (value) => {
    if (!Number.isFinite(value)) return;
    S.offsetMs = Math.max(-1500, Math.min(1500, value)); syncInput.value = S.offsetMs;
    try { localStorage.setItem(syncKey, String(S.offsetMs)); } catch {}
    syncInput.blur();
  };
  syncInput.addEventListener('change', (e) => setSync(Number(e.target.value)));
  document.getElementById('notesLater').onclick = () => setSync(S.offsetMs - 20);
  document.getElementById('notesEarlier').onclick = () => setSync(S.offsetMs + 20);
  document.getElementById('syncReset').onclick = () => setSync(CLOCK.offsetMs);
  // Detecta qué canción abre el juego (songs\\<nombre>_song.pak.xen) y lee sus notas de la carpeta elegida.
  setInterval(async () => {
    if (!files || loading || !window.d4) return;
    const name = window.songPak;  // lo marca el manejador del registro (abajo)
    if (!name || (S.chart && S.chart.name === name)) return;
    loading = S.loadFromFiles(files, name, CLOCK.diff).then((c) => { stat.textContent = 'Canción: ' + name + ' (' + CLOCK.diff + '), ' + c.notes.length + ' notas.'; })
      .catch((err) => { stat.textContent = 'No pude leer las notas: ' + err.message; }).finally(() => { loading = null; });
  }, 1000);
  // Modo canción: mientras el reloj de la canción corre (vale 0 en los menús), los trastes del teclado van al
  // esquema de GH3 con mando común (gh3-input.js).
  if (window.gh3Input) window.gh3Input.songMode = () => { const v = S.clock ? S.clock() : 0; return Number.isFinite(v) && v !== 0; };
  const loop = () => { S.draw(cv, window.gh3Input?.stats.frets | 0); requestAnimationFrame(loop); };
  loop();
})();
</script>
</body>`);
swap("document.getElementById('secs').value = '300'", "document.getElementById('secs').value = '1500'");
// Registro: la demo rearma un texto de hasta 400 KB y recalcula el diseño por CADA línea; en la canción hay varias
// líneas por nota ([c1]) y eso traba el hilo principal (las teclas llegan tarde). Acá se agrupa una vez por
// segundo, se guardan las últimas 20000 líneas y se marca la canción que abre el juego apenas llega su línea.
const LOG_OLD = `      logEl.textContent += m.text + '\\n';
      if (logEl.textContent.length > 400000) logEl.textContent = logEl.textContent.slice(-200000);
      logEl.scrollTop = logEl.scrollHeight;`;
const LOG_NEW = `      if (result.log.length > 25000) result.log.splice(0, result.log.length - 20000);
      (window.logBuf = window.logBuf || []).push(m.text);
      const sp = /songs\\\\([a-z0-9_]+)_song\\.pak\\.xen/i.exec(m.text); if (sp) window.songPak = sp[1].toLowerCase();
      if (!window.logTimer) window.logTimer = setTimeout(() => { window.logTimer = null; const t = window.logBuf.join('\\n'); window.logBuf = [];
        logEl.textContent = (logEl.textContent + t + '\\n').slice(-60000); logEl.scrollTop = logEl.scrollHeight; }, 1000);`;
swap(LOG_OLD, LOG_NEW);
await writeFile(resolve(out, 'index.html'), html);
console.log('Página de la canción lista en artifacts/d1-wasm/r6/song (no publicar).');
