var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// tools/local-loader/network-cache.mjs
var network_cache_exports = {};
__export(network_cache_exports, {
  CHUNK_CACHE: () => CHUNK_CACHE,
  activateChunkCache: () => activateChunkCache,
  warmChunk: () => warmChunk
});
async function activateChunkCache() {
  if (!("serviceWorker" in navigator) || !("caches" in globalThis)) throw Error("Este navegador no permite la cach\xE9 compartida del juego.");
  const scope = new URL("/gh3/", location.href).href;
  await navigator.serviceWorker.register("/gh3/gh3-chunks-sw.js", { scope, updateViaCache: "none" });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      navigator.serviceWorker.removeEventListener("controllerchange", changed);
      reject(Error("La cach\xE9 del juego no pudo activarse. Recarg\xE1 para reintentar."));
    }, 15e3);
    const changed = () => {
      if (!navigator.serviceWorker.controller) return;
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("controllerchange", changed);
      resolve();
    };
    navigator.serviceWorker.addEventListener("controllerchange", changed);
    changed();
  });
}
async function warmChunk(url, hash, blob) {
  const cache = await caches.open(CHUNK_CACHE), old = await cache.match(url);
  if (old && old.headers.get("X-GH3-Hash") === hash && Number(old.headers.get("Content-Length")) === blob.size) return;
  await cache.put(url, new Response(blob, { headers: { "Content-Type": "application/octet-stream", "Content-Length": String(blob.size), "X-GH3-Hash": hash } }));
}
var CHUNK_CACHE;
var init_network_cache = __esm({
  "tools/local-loader/network-cache.mjs"() {
    CHUNK_CACHE = "gh3-network-chunks-v1";
  }
});

// tools/local-loader/cache.mjs
var DB_NAME = "gh3-local-chunks-v1";
var request = (q) => new Promise((resolve, reject) => {
  q.onsuccess = () => resolve(q.result);
  q.onerror = () => reject(q.error);
});
function openCache() {
  return new Promise((resolve, reject) => {
    const q = indexedDB.open(DB_NAME, 1);
    q.onupgradeneeded = () => {
      q.result.createObjectStore("chunks");
      q.result.createObjectStore("meta");
    };
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
    q.onblocked = () => reject(Error("Cerr\xE1 las otras pesta\xF1as de esta prueba y reintent\xE1."));
  });
}
function get(db2, store, key) {
  return request(db2.transaction(store).objectStore(store).get(key));
}
function put(db2, store, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db2.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error || Error("No se pudo guardar en el navegador."));
  });
}
var digest = async (b) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", b))].map((x) => x.toString(16).padStart(2, "0")).join("");
function validateManifest(m2) {
  if (m2?.format !== 1 || !Number.isSafeInteger(m2.chunkSize) || m2.chunkSize <= 0 || m2.chunkSize > 8 * 1048576 || !Array.isArray(m2.files) || !/^[a-f0-9]{64}$/.test(m2.version) || !m2.files.length) throw Error("Lista de archivos inv\xE1lida.");
  const paths = /* @__PURE__ */ new Set();
  if (m2.delivery && !/^(\/[a-zA-Z0-9_-]+)+$/.test(m2.delivery.chunks || "")) throw Error("Ruta de entrega inv\xE1lida.");
  for (const [i, f] of m2.files.entries()) {
    if (f.id !== i || typeof f.path !== "string" || !f.path || f.path.includes("\\") || f.path.split("/").some((x) => !x || x === "." || x === "..") || f.path.includes(":") || paths.has(f.path.toLowerCase())) throw Error("Ruta de archivo inv\xE1lida.");
    paths.add(f.path.toLowerCase());
    if (!Number.isSafeInteger(f.size) || f.size < 0 || !Array.isArray(f.chunks)) throw Error("Tama\xF1o inv\xE1lido.");
    let at = 0;
    for (const c of f.chunks) {
      if (c.offset !== at || !Number.isSafeInteger(c.size) || c.size <= 0 || c.size > m2.chunkSize || !/^[a-f0-9]{64}$/.test(c.hash)) throw Error("Parte de archivo inv\xE1lida.");
      at += c.size;
    }
    if (at !== f.size) throw Error("Archivo incompleto en la lista.");
  }
  for (const p of Object.values(m2.packages || {})) if (!Array.isArray(p.files) || p.files.some((i) => !Number.isInteger(i) || !m2.files[i])) throw Error("Paquete inv\xE1lido.");
  return m2;
}
var chunkURL = (m2, f, i) => m2.delivery?.chunks ? `${m2.delivery.chunks}/${f.chunks[i].hash}` : `/local-chunk/${m2.version}/${f.id}/${i}`;
async function loadChunk(db2, m2, f, i, stats, signal) {
  const c = f.chunks[i];
  // iPhone puede cortar la conexión a IndexedDB: si no se puede leer/guardar, se sigue sin caché.
  let blob = await get(db2, "chunks", c.hash).catch(() => null);
  const share = async () => {
    if (m2.delivery?.sharedCache) {
      const { warmChunk: warmChunk2 } = await Promise.resolve().then(() => (init_network_cache(), network_cache_exports));
      await warmChunk2(chunkURL(m2, f, i), c.hash, blob);
    }
  };
  // Claude 2026-10-12: lo guardado ya se verificó al bajarlo; no se vuelve a calcular el hash en cada entrada.
  if (blob instanceof Blob && blob.size === c.size) {
    await share();
    stats.cached += c.size;
    return blob;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw new DOMException("Preparaci\xF3n pausada.", "AbortError");
    try {
      const r = await fetch(chunkURL(m2, f, i), { signal, cache: "no-store" });
      if (!r.ok) throw Error(`No se pudo cargar una parte (${r.status}).`);
      const b = await r.arrayBuffer();
      if (b.byteLength !== c.size || await digest(b) !== c.hash) throw Error("Una parte lleg\xF3 incompleta o modificada.");
      blob = new Blob([b]);
      await put(db2, "chunks", c.hash, blob).catch(() => stats.notSaved = (stats.notSaved || 0) + c.size);
      await share();
      stats.downloaded += c.size;
      return blob;
    } catch (e) {
      if (signal?.aborted || e.name === "QuotaExceededError" || attempt === 2) throw e;
    }
  }
}
// Claude 2026-10-12: varias partes a la vez (antes de a una: ~4 MB/s aun con red local) y `skip` para dejar
// archivos fuera de la carga inicial (el juego los lee a demanda / se bajan de fondo).
async function prepare(db2, m2, packageIds2, { signal, onProgress = () => {
}, skip = null, parallel = 6 } = {}) {
  const ids = [...new Set(packageIds2.flatMap((id) => {
    if (!m2.packages[id]) throw Error("Paquete desconocido.");
    return m2.packages[id].files;
  }))].filter((id) => !skip || !skip(m2.files[id]));
  const total = ids.reduce((n, i) => n + m2.files[i].size, 0), stats = { total, done: 0, cached: 0, downloaded: 0 }, chunks = /* @__PURE__ */ new Map();
  const jobs = ids.flatMap((id) => m2.files[id].chunks.map((_, i) => [m2.files[id], i]));
  let next = 0;
  const run = async () => {
    while (next < jobs.length) {
      if (signal?.aborted) throw new DOMException("Preparaci\xF3n pausada.", "AbortError");
      const [f, i] = jobs[next++], c = f.chunks[i], blob = await loadChunk(db2, m2, f, i, stats, signal);
      chunks.set(c.hash, blob);
      stats.done += c.size;
      onProgress({ ...stats, path: f.path });
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, jobs.length) }, run));
  return { chunks, stats, ids };
}
// Archivos que no hacen falta para arrancar: videos. Se bajan de fondo al cache compartido (el service worker
// los sirve a las lecturas del juego; si el juego llega antes, los pide él mismo).
var deferInitial = (f) => /\.bik\.xen$/i.test(f.path);
var deferOrder = ["atvi", "ns_logo", "ro_logo", "intro"];
async function warmDeferred(m2, files) {
  const rank = (f) => {
    const i = deferOrder.findIndex((n) => f.path.toLowerCase().includes("/" + n + "."));
    return i < 0 ? 99 : i;
  };
  const jobs = files.slice().sort((a, b) => rank(a) - rank(b)).flatMap((f) => f.chunks.map((c) => `${m2.delivery.chunks}/${c.hash}`));
  let next = 0;
  const run = async () => {
    while (next < jobs.length) {
      const url = jobs[next++];
      try { await (await fetch(url)).arrayBuffer(); } catch {}
    }
  };
  await Promise.all([run(), run()]);
}

// tools/local-loader/theme.mjs
var theme_default = `
:root{color-scheme:dark;--bg:#0e1015;--fg:#f2f3f6;--muted:#a5aab6;--ok:#acdf92;--bad:#ff9d94;--box:#191c24;--line:#333743}
body{padding:28px 24px 40px;background:radial-gradient(ellipse at 20% 0%,#252132 0%,transparent 48%),var(--bg);font:15px/1.5 system-ui,sans-serif}
main{max-width:1340px!important}button,select,input{font:inherit;color:var(--fg)}button,select{background:#252935;border:1px solid #424755;border-radius:9px;padding:9px 13px;min-height:40px}button{cursor:pointer;transition:background-color 160ms ease-out,border-color 160ms ease-out}button:disabled{opacity:.44;cursor:default}button:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #c7ebad;outline-offset:3px}
@media(hover:hover){button:not(:disabled):hover{background:#34394a;border-color:#697184}}
.card{border-color:var(--line);background:var(--box);border-radius:16px;padding:22px;box-shadow:0 16px 48px #0002}.note{color:var(--muted)}.eyebrow{font-size:11px;font-weight:700;letter-spacing:.12em;color:#bac2d0}.hero{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:12px 0 26px}.hero h1{font-size:clamp(28px,4vw,42px);letter-spacing:-.035em;margin:3px 0 5px;line-height:1.15}.hero p{margin:0;max-width:720px}.localBadge{white-space:nowrap;padding:6px 10px;border:1px solid #454252;background:#24212c;border-radius:30px;font-size:12px;color:#d5cce8}.localBadge:before{content:'\u25CF';color:var(--ok);margin-right:7px}
#loaderLobby{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:18px;align-items:start;margin-bottom:20px}#loaderPanel h2{margin:4px 0 8px;font-size:26px;letter-spacing:-.025em}#loaderPanel p{max-width:650px}#loaderPanel .row{gap:8px;margin:20px 0}#loaderPanel label{display:flex;align-items:center;gap:12px;flex-wrap:wrap}#loaderPlay{background:#c4e7a6;border-color:#c4e7a6;color:#1b2813;font-weight:700;padding-inline:26px}#loaderPrepare:not(:disabled){border-color:#a59ac0}#loaderPause{background:transparent}.loadNumbers{display:flex;justify-content:space-between;gap:12px;align-items:baseline;margin-top:26px}.loadNumbers strong{font-size:30px;font-variant-numeric:tabular-nums;letter-spacing:-.04em}.loadNumbers span{font-size:12px;color:var(--muted)}progress{display:block;width:100%;height:8px;appearance:none;border:0;border-radius:8px;overflow:hidden;background:#303442}progress::-webkit-progress-bar{background:#303442;border-radius:8px}progress::-webkit-progress-value{background:#b4dfa0;border-radius:8px}#loaderStatus{min-height:24px;margin:12px 0 4px;font-size:14px}#loaderStorage{font-size:12px;color:var(--muted)}.trackList{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:10px;overflow:hidden;margin:22px 0}.trackList div{background:#161921;padding:13px;display:flex;gap:12px;align-items:center}.trackList b{font-size:13px;font-weight:500}.trackList small{font-size:11px;color:var(--muted);min-width:16px}.trackList [data-unselected]{opacity:.45}
.guideHeading{display:flex;justify-content:space-between;align-items:center;gap:10px}.guideHeading h2{margin:3px 0 12px;font-size:21px}.guideLive{color:var(--ok);font-size:12px;border:1px solid #53654b;border-radius:20px;padding:3px 8px}.guideSwitch{display:flex;padding:3px;border:1px solid var(--line);border-radius:10px;background:#11131a;margin:8px 0 14px}.guideSwitch button{flex:1;min-height:34px;padding:5px 10px;border-color:transparent;background:transparent;font-size:13px}.guideSwitch button[aria-pressed=true]{background:#343145;border-color:#5f576e}.guideContext{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;color:var(--muted)}.guideContext select{min-height:32px;padding:4px 7px;font-size:12px;max-width:180px}.guideColumns{display:flex;justify-content:space-between;margin:18px 0 5px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}.guideRow{display:flex;align-items:center;justify-content:space-between;padding:9px 5px;border-top:1px solid #303440;gap:10px;border-radius:4px}.guideRow.held{background:#353d30;outline:1px solid #adc994}.guideActionName{display:flex;align-items:center;gap:7px;font-size:12px}.keycaps{display:flex;gap:5px;margin-top:4px;flex-wrap:wrap;color:var(--muted);font-size:11px}kbd{font:600 11px/1.4 system-ui;background:#242834;border:1px solid #565d6c;border-bottom-width:2px;min-width:16px;padding:2px 6px;border-radius:5px;color:#edf0f5;text-align:center}.fretDot{height:7px;width:7px;display:inline-block;border-radius:50%}.verde{background:#84d17b}.rojo{background:#ff7a81}.amarillo{background:#eed67f}.azul{background:#7eaaff}.naranja{background:#f4aa6a}.padGlyph{display:inline-flex;align-items:center;justify-content:center;min-width:27px;min-height:27px;padding:2px 5px;border:1px solid #697283;border-radius:8px;font-size:12px;font-weight:700;background:#222631;box-sizing:border-box}.xb-A,.xb-B,.xb-X,.xb-Y{border-radius:50%;width:29px;height:29px}.xb-A{color:#9de78e;border-color:#5e9560}.xb-B{color:#ff9e9d;border-color:#a45b60}.xb-X{color:#93bbff;border-color:#567aaa}.xb-Y{color:#f4dc8d;border-color:#9e8c57}.ps-glyph{color:#d2c6fc}.ps-A,.ps-B,.ps-X,.ps-Y{border-radius:50%;width:29px;height:29px;font-size:15px}.ps-A{color:#8fb4ff;border-color:#5a76b0}.ps-B{color:#ff8f8f;border-color:#a45b60}.ps-X{color:#f5a3dc;border-color:#9a5d88}.ps-Y{color:#7fe0a5;border-color:#4f9168}.guideHint{font-size:11px;color:#c2bdcc;line-height:1.5;margin-bottom:4px}#controllerGuide>.note{font-size:11px;margin-bottom:0}
#gh3Row{gap:18px!important}#gh3Panel{flex-basis:340px!important;padding:16px!important;border-radius:16px;scrollbar-width:thin}#gh3Panel #controllerGuide{padding:0 0 16px;background:transparent;border:0;border-bottom:1px solid var(--line);box-shadow:none;border-radius:0;margin-bottom:18px}#gh3Panel>h3{color:#d9deeb;font-size:14px!important;border-top:1px solid var(--line);padding-top:15px;margin-top:18px!important}#gh3Panel button{border-radius:7px}#gh3Panel .row{line-height:1.5}#gh3Panel label{cursor:pointer}#gh3Panel input[type=range],#gh3Panel input[type=checkbox]{accent-color:#c4e7a6}#r5Box{position:relative;padding:0;overflow:hidden;background:#080a0f;min-height:250px}#r5Canvas{display:block;width:100%;height:auto}body.gh3fit #r5Canvas{max-height:calc(100vh - 48px)!important}#r5Stat{display:none}#loaderLobby:empty{display:none}body.loaderStarted #loaderLobby{display:block}body.loaderStarted #loaderPanel{padding:12px 18px;margin-bottom:0}body.loaderStarted #loaderPanel>.eyebrow,body.loaderStarted #loaderPanel>h2,body.loaderStarted #loaderPanel>.intro,body.loaderStarted #loaderPanel>.trackList,body.loaderStarted #loaderPanel>label,body.loaderStarted #loaderPanel>.row,body.loaderStarted #loaderPanel>.loadNumbers,body.loaderStarted #loaderPanel>progress,body.loaderStarted #loaderStorage{display:none}body.loaderStarted #loaderStatus{margin:0;min-height:0;color:var(--ok)}
#gameLoading{position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;padding:24px;background:linear-gradient(145deg,#161923f7,#101219f5);box-sizing:border-box}#gameLoading .loadingContent{max-width:490px;width:100%}.loadingMark{display:inline-flex;align-items:center;gap:8px;color:var(--ok);font-size:12px;font-weight:600}.loadingMark i{width:7px;height:7px;background:var(--ok);border-radius:50%}#gameLoading h2{font-size:clamp(22px,3vw,32px);letter-spacing:-.035em;margin:13px 0 8px}#gameLoading p{font-size:13px;color:var(--muted);margin:8px 0}.loadingSteps{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:22px 0}.loadingSteps span{background:#252a35;height:4px;border-radius:4px}.loadingSteps span.done{background:#b4dfa0}.loadingSteps span.current{background:#9e90bb}#gameLoading progress{margin-top:20px}#gameLoading .loadingFoot{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:18px;font-size:11px;color:var(--muted)}#loadWait{color:#e4c9a0!important}#loadRetry{margin-top:10px}.gameTopline{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:0 0 12px;font-size:12px;color:var(--muted)}#gameState{color:var(--ok)}details{color:var(--muted);margin-top:24px;font-size:12px}summary{cursor:pointer;padding:8px 0}details .card{margin-top:10px}#songBox{font-size:12px;margin:10px 0!important}.loaderError #loaderStatus{color:var(--bad)!important}
@media(max-width:900px){body{padding:18px 14px 32px}#loaderLobby{grid-template-columns:1fr}#gh3Row{flex-direction:column}#gh3Panel{width:100%!important;flex-basis:auto!important;box-sizing:border-box;position:static!important;max-height:none!important}#gh3Row>#r5Box{width:100%}#controllerGuide{box-sizing:border-box}.hero{align-items:flex-start}.localBadge{font-size:10px}.card{padding:18px}.trackList{grid-template-columns:1fr}#gameLoading{padding:18px}#gameLoading h2{margin-top:8px}.loadingSteps{margin:12px 0}.loadingFoot{margin-top:10px!important}#r5Box{min-height:330px}}
@media(prefers-reduced-motion:reduce){button{transition:none}}
`;

// tools/local-loader/controls.mjs
var frets = ["verde", "rojo", "amarillo", "azul", "naranja"];
var menu = ["A", "B", "Y", "X", "LB"];
var song = ["LT", "LB", "RB", "RT", "A"];
var ps = { A: "\u2715", B: "\u25CB", X: "\u25A1", Y: "\u25B3", LB: "L1", RB: "R1", LT: "L2", RT: "R2", Start: "Options", Back: "Share" };
var names = { ArrowUp: "\u2191", ArrowDown: "\u2193", ArrowLeft: "\u2190", ArrowRight: "\u2192", Space: "Espacio", Escape: "Esc", Backspace: "Retroceso", NumpadEnter: "Enter num." };
var keyName = (code) => names[code] || code?.replace(/^(Key|Digit)/, "") || "\u2014";
function createControls() {
  const guide2 = document.createElement("section");
  guide2.id = "controllerGuide";
  guide2.className = "card";
  guide2.innerHTML = `<div class="guideHeading"><div><span class="eyebrow">TEN\xC9 LAS TECLAS A MANO</span><h2>Controles</h2></div><span class="guideLive" id="guideMode">Men\xFAs</span></div>
    <div class="guideSwitch" role="group" aria-label="Ver botones del mando"><button type="button" data-platform="xbox" aria-pressed="true">Xbox</button><button type="button" data-platform="ps4" aria-pressed="false">PS4</button></div>
    <label class="guideContext">Mostrar <select id="guideContext"><option value="auto">Seg\xFAn el juego</option><option value="menu">Men\xFAs</option><option value="song">Canci\xF3n</option></select></label>
    <div class="guideColumns"><span>Acci\xF3n / tecla</span><span id="guidePlatform">Xbox</span></div><div id="guideRows"></div>
    <p class="guideHint" id="guideHint"></p><p class="note">Para tocar: manten\xE9 el color y rasgue\xE1 con \u2191 o \u2193. Las teclas se pueden cambiar en Ajustes.</p>`;
  let platform = "xbox", signature = "", rowKeys = [];
  const pressed = /* @__PURE__ */ new Set();
  guide2.querySelectorAll("[data-platform]").forEach((btn) => btn.onclick = () => {
    platform = btn.dataset.platform;
    guide2.querySelectorAll("[data-platform]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    btn.blur();
    refresh();
  });
  guide2.querySelector("#guideContext").onchange = refresh;
  function refresh() {
    const G = window.gh3Input;
    if (!G?.getBinds) return;
    const choice = guide2.querySelector("#guideContext").value, inSong = choice === "song" || choice === "auto" && !!G.songMode?.();
    const binds = G.getBinds(), sig = JSON.stringify([platform, inSong, binds]);
    if (sig === signature) return;
    signature = sig;
    guide2.querySelector("#guideMode").textContent = inSong ? "Canci\xF3n" : "Men\xFAs";
    guide2.querySelector("#guidePlatform").textContent = platform === "xbox" ? "Xbox" : "PS4";
    guide2.querySelector("#guideHint").textContent = inSong ? "En la canci\xF3n se usa el esquema de GH3 para mando com\xFAn." : "En los men\xFAs, A de Xbox / \u2715 de PS4 confirma; B / \u25CB vuelve.";
    const rows2 = guide2.querySelector("#guideRows");
    rows2.replaceChildren();
    rowKeys = [];
    const entries = [...frets.map((f, i) => [f, inSong ? song[i] : menu[i], f]), ["rasgueo arriba", "\u2191"], ["rasgueo abajo", "\u2193"], ["izquierda", "\u2190"], ["derecha", "\u2192"], ["Start / pausa", "Start"], ["Poder estelar", "Back"], ["Volver (men\xFA)", "B"]];
    for (const [action, button, color] of entries) {
      const row = document.createElement("div");
      row.className = "guideRow";
      row.dataset.action = action;
      const keys = binds[action]?.filter(Boolean) || [], label = document.createElement("div");
      label.className = "guideAction";
      const title = document.createElement("span");
      title.className = "guideActionName";
      title.textContent = action[0].toUpperCase() + action.slice(1);
      if (color) {
        const dot = document.createElement("i");
        dot.className = "fretDot " + color;
        dot.setAttribute("aria-hidden", "true");
        title.prepend(dot);
      }
      const caps = document.createElement("div");
      caps.className = "keycaps";
      for (const key of keys) {
        const cap = document.createElement("kbd");
        cap.textContent = keyName(key);
        caps.append(cap);
      }
      if (!keys.length) caps.textContent = "Sin tecla";
      label.append(title, caps);
      const glyph = document.createElement("span");
      glyph.className = "padGlyph " + (platform === "xbox" ? "xb-" + button : "ps-glyph ps-" + button);
      glyph.textContent = platform === "ps4" ? ps[button] || button : button;
      glyph.setAttribute("aria-label", `${platform === "xbox" ? "Xbox" : "PS4"}: ${glyph.textContent}`);
      row.append(label, glyph);
      rows2.append(row);
      rowKeys.push([row, keys]);
    }
    highlight();
  }
  function highlight() {
    for (const [row, keys] of rowKeys) row.classList.toggle("held", keys.some((k) => pressed.has(k)));
  }
  addEventListener("keydown", (e) => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName)) return;
    pressed.add(e.code);
    highlight();
  });
  addEventListener("keyup", (e) => {
    pressed.delete(e.code);
    highlight();
  });
  addEventListener("blur", () => {
    pressed.clear();
    highlight();
  });
  refresh();
  setInterval(refresh, 300);
  return { element: guide2, refresh };
}

// tools/local-loader/loading.mjs
function createLoadingView(box, state2) {
  const el = document.createElement("section");
  el.id = "gameLoading";
  el.hidden = true;
  el.setAttribute("aria-label", "Progreso de carga del juego");
  el.innerHTML = `<div class="loadingContent"><span class="loadingMark"><i></i> <span id="loadPhase">Iniciando</span></span><h2 id="loadTitle">Preparando el juego</h2><p id="loadDetail">Los archivos ya est\xE1n listos.</p><div class="loadingSteps" aria-hidden="true"><span></span><span></span><span></span><span></span></div><progress id="engineProgress" aria-label="Carga del programa" hidden></progress><div class="loadingFoot"><span id="loadElapsed">0 s de espera</span><span id="loadActivity">Esperando al juego</span></div><p id="loadWait" hidden></p><button type="button" id="loadRetry" hidden>Recargar y reintentar</button></div>`;
  box.append(el);
  const $2 = (id) => el.querySelector("#" + id);
  $2("loadRetry").onclick = () => location.reload();
  let started = 0, lastSignal = 0, lastAdvance = 0, lastKey = "", engineReady = false, wasm = null, error = null, lastSong = null, wasPlaying = false;
  const mb2 = (n) => (n / 1048576).toFixed(1) + " MB";
  function start() {
    started = lastSignal = lastAdvance = performance.now();
    el.hidden = false;
    box.hidden = false;
    update();
  }
  function fail2(message2) {
    error = message2;
    state2.error = message2;
    document.body.classList.add("loaderError");
    update();
  }
  function stage(detail) {
    state2.stage = detail;
    if (detail.stage === "preview") {
      state2.songLoad = null;
      wasPlaying = false;
    }
    if (detail.stage === "loadStart" || detail.stage === "levelConfirmed") {
      wasPlaying = false;
      state2.songLoad = null;
    }
    update();
  }
  function message(m2) {
    if (!started) return;
    if (["log", "mark", "r5SongFrame", "r5SongReport", "g1eInput", "engineLoad", "localCache"].includes(m2.type)) lastSignal = performance.now();
    if (m2.type === "engineLoad") {
      wasm = m2;
      state2.engine = { loaded: m2.loaded, total: m2.total, done: m2.done };
    }
    if (m2.type === "g1eInput" || m2.type === "mark" && m2.what === "wasm listo") engineReady = true;
    if (m2.type === "exit") fail2(m2.code === 0 ? "La prueba del juego termin\xF3. Pod\xE9s volver a iniciarla." : "El juego se detuvo: " + (m2.what || m2.code));
    if (m2.type === "r5SongReport" && m2.data?.fatal) fail2("No se pudo continuar con la imagen: " + m2.data.fatal);
    if (m2.type === "localCache" && (m2.fatal || m2.error)) fail2(m2.fatal || m2.error);
    if (m2.type === "songLoad") {
      lastSignal = performance.now();
      state2.songLoad = m2;
      if (m2.error) fail2("No se pudo preparar la canci\xF3n: " + m2.error);
    }
  }
  function update() {
    if (!started) return;
    const now = performance.now(), clock = window.gh3Song?.clock?.();
    const stageName = state2.stage?.stage;
    const playing = window.gh3Stage ? stageName === "songPlaying" || stageName === "levelConfirmed" && Number.isFinite(clock) && clock < 0 : Number.isFinite(clock) && clock !== 0;
    const song2 = window.songPak;
    if (state2.songLoad && !state2.songLoad.complete && !error) {
      const p = state2.songLoad;
      el.hidden = false;
      state2.phase = "song";
      $2("loadPhase").textContent = "Preparando la canci\xF3n";
      $2("loadTitle").textContent = "Entrando al nivel";
      $2("loadDetail").textContent = `${mb2(p.done)} de ${mb2(p.total)} \xB7 ${Math.floor(100 * (p.total ? p.done / p.total : 1))} %`;
      $2("engineProgress").hidden = false;
      $2("engineProgress").max = p.total || 1;
      $2("engineProgress").value = p.done;
      document.getElementById("gameState").textContent = "Cargando canci\xF3n";
      return;
    }
    if (state2.manualNavigation && engineReady && (!song2 && !["loadStart", "levelConfirmed"].includes(stageName) || stageName === "preview") && !error) {
      el.hidden = true;
      state2.phase = "navigation";
      document.getElementById("gameState").textContent = "Eleg\xED el tema en el juego";
      return;
    }
    if (playing && !error) {
      el.hidden = true;
      wasPlaying = true;
      lastSong = song2 || lastSong;
      state2.phase = "playing";
      document.getElementById("gameState").textContent = clock < 0 ? "Cuenta regresiva" : "A tocar";
      document.getElementById("loaderStatus").textContent = "Juego listo \xB7 archivos guardados en este navegador";
      return;
    }
    if (wasPlaying && (!song2 || song2 === lastSong) && !error) {
      el.hidden = true;
      document.getElementById("gameState").textContent = "Men\xFAs / pausa";
      return;
    }
    el.hidden = false;
    const nav = document.getElementById("navStat")?.textContent || "", title = window.navSeen?.title, menu2 = window.navSeen?.menu;
    const count = [...document.querySelectorAll("#songSteps li")].filter((li) => li.style.opacity).length;
    let stage2 = engineReady ? song2 ? 4 : 3 : 2, label, detail, phase;
    if (error) {
      label = "La carga se interrumpi\xF3";
      detail = error;
      phase = "Necesita atenci\xF3n";
    } else if (!engineReady) {
      label = wasm?.done ? "Preparando el motor" : "Cargando el programa";
      detail = wasm?.total ? `${mb2(wasm.loaded)} de ${mb2(wasm.total)} \xB7 ${Math.floor(100 * wasm.loaded / wasm.total)} %${wasm.done ? " \xB7 preparando el motor" : ""}` : "El navegador est\xE1 iniciando el programa del juego.";
      phase = "Paso 2 de 4 \xB7 Motor";
    } else if (song2 || ["loadStart", "levelConfirmed"].includes(stageName)) {
      label = "Cargando la canci\xF3n";
      detail = "Preparando escenario, notas y sonido. La cuenta regresiva aparece cuando el juego est\xE1 listo.";
      phase = "Paso 4 de 4 \xB7 Canci\xF3n";
    } else {
      label = menu2 ? "Abriendo los men\xFAs" : title ? "Pasando los men\xFAs" : "Iniciando Guitar Hero III";
      detail = nav || "El juego est\xE1 abriendo sus recursos de arranque.";
      phase = `Paso 3 de 4 \xB7 ${menu2 ? "Men\xFA principal alcanzado" : title ? "T\xEDtulo alcanzado" : "Inicio y men\xFAs"}${count ? " \xB7 " + count + "/12 pasos alcanzados" : ""}`;
    }
    state2.phase = error ? "error" : stage2 === 2 ? "engine" : stage2 === 3 ? "navigation" : "song";
    const key = JSON.stringify([stage2, detail, wasm?.loaded, error]);
    if (key !== lastKey) {
      lastAdvance = now;
      lastKey = key;
    }
    $2("loadTitle").textContent = label;
    $2("loadDetail").textContent = detail;
    $2("loadPhase").textContent = phase;
    el.querySelectorAll(".loadingSteps span").forEach((s, i) => {
      s.classList.toggle("done", i + 1 < stage2);
      s.classList.toggle("current", i + 1 === stage2);
    });
    $2("engineProgress").hidden = stage2 !== 2 || !wasm?.total || !!error;
    if (wasm?.total) {
      $2("engineProgress").max = wasm.total;
      $2("engineProgress").value = wasm.loaded;
    }
    $2("loadElapsed").textContent = Math.floor((now - started) / 1e3) + " s de espera";
    const silence = Math.floor((now - lastSignal) / 1e3), stuck = Math.floor((now - lastAdvance) / 1e3);
    $2("loadActivity").textContent = silence < 5 ? "Recibiendo se\xF1ales del juego" : `\xDAltima se\xF1al hace ${silence} s`;
    $2("loadWait").hidden = !!error || silence < 20 && stuck < 90;
    $2("loadWait").textContent = silence >= 20 ? `No llegan nuevas se\xF1ales desde hace ${silence} s. Si sigue as\xED, pod\xE9s reintentar sin perder los archivos preparados.` : `Este paso lleva ${stuck} s sin avanzar. El juego sigue enviando se\xF1ales; si no termina, pod\xE9s reintentar.`;
    $2("loadRetry").hidden = !error && silence < 20 && stuck < 90;
    document.getElementById("gameState").textContent = phase;
  }
  setInterval(update, 500);
  return { start, message, stage, fail: fail2, element: el };
}

// tools/local-loader/songs.mjs
var rows = `slowride|Slow Ride
talkdirtytome|Talk Dirty to Me
hitmewithyourbestshot|Hit Me with Your Best Shot
storyofmylife|Story of My Life
mississippiqueen|Mississippi Queen
schoolsout|School's Out
sunshineofyourlove|Sunshine of Your Love
barracuda|Barracuda
bullsonparade|Bulls on Parade
whenyouwereyoung|When You Were Young
missmurder|Miss Murder
theseeker|The Seeker
laydown|Lay Down
paintitblack|Paint It Black
paranoid|Paranoid
anarchyintheuk|Anarchy in the U.K.
koolthing|Kool Thing
mynameisjonas|My Name Is Jonas
evenflow|Even Flow
holidayincambodia|Holiday in Cambodia
rockulikeahurricane|Rock You Like a Hurricane
sameoldsonganddance|Same Old Song and Dance
lagrange|La Grange
welcometothejungle|Welcome to the Jungle
blackmagicwoman|Black Magic Woman
cherubrock|Cherub Rock
blacksunshine|Black Sunshine
themetal|The Metal
pridenjoy|Pride and Joy
beforeiforget|Before I Forget
stricken|Stricken
threesandsevens|3's & 7's
knightsofcydonia|Knights of Cydonia
cultofpersonality|Cult of Personality
rainingblood|Raining Blood
cliffsofdover|Cliffs of Dover
numberofthebeast|The Number of the Beast
one|One
sabotage|Sabotage
reptilia|Reptilia
suckmykiss|Suck My Kiss
citiesonflame|Cities on Flame with Rock and Roll
helicopter|Helicopter
monsters|Monsters
rocknrollallnite|Rock and Roll All Nite
avalancha|Avalancha
bellyofashark|In the Belly of a Shark
cantbesaved|Can't Be Saved
closer|Closer
dontholdback|Don't Hold Back
downndirty|Down 'n Dirty
fcpremix|F.C.P.R.E.M.I.X.
generationrock|Generation Rock
gothatfar|Go That Far
hierkommtalex|Hier kommt Alex
imintheband|I'm in the Band
impulse|Impulse
inlove|In Love
mauvaisgarcon|Mauvais Gar\xE7on
metalheavylady|Metal Heavy Lady
minuscelsius|Minus Celsius
mycurse|My Curse
nothingformehere|Nothing for Me Here
prayeroftherefugee|Prayer of the Refugee
radiosong|Radio Song
ruby|Ruby
shebangsadrum|She Bangs the Drums
takethislife|Take This Life
thewayitends|The Way It Ends
thrufireandflames|Through the Fire and Flames`;
var titles = Object.fromEntries(rows.split("\n").map((row) => row.split("|")));
var FIRST_FOUR = ["slowride", "talkdirtytome", "hitmewithyourbestshot", "storyofmylife"];
var songIds = (m2) => Object.keys(m2.packages).filter((id) => id !== "base");
function selectedPackages(m2, selection) {
  const ids = selection === "all" ? songIds(m2) : selection === "first4" ? FIRST_FOUR : [selection];
  if (!ids.length || ids.some((id) => id === "base" || !m2.packages[id])) throw Error("Selecci\xF3n de canciones inv\xE1lida.");
  return ["base", ...ids];
}
function restoreSelection(m2, packages) {
  const ids = packages.filter((id) => id !== "base"), same = (other) => other.length === ids.length && other.every((id) => ids.includes(id));
  if (ids.length === 1 && m2.packages[ids[0]]) return ids[0];
  if (same(FIRST_FOUR)) return "first4";
  if (same(songIds(m2))) return "all";
  return "slowride";
}
function populateSongOptions(select, m2) {
  const ids = songIds(m2), previous = select.value, choices = [];
  if (FIRST_FOUR.every((id) => m2.packages[id])) choices.push(["first4", "Las primeras cuatro"]);
  if (ids.length > 4) choices.push(["all", `Todas las canciones (${ids.length})`]);
  for (const id of ids) choices.push([id, m2.packages[id].title]);
  select.replaceChildren(...choices.map(([id, title]) => {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = title;
    return o;
  }));
  select.value = choices.some(([id]) => id === previous) ? previous : choices[0][0];
}
function renderSelectedSongs(container, m2, selection) {
  container.replaceChildren(...selectedPackages(m2, selection).slice(1).map((id, i) => {
    const row = document.createElement("div"), number = document.createElement("small"), title = document.createElement("b");
    number.textContent = String(i + 1).padStart(2, "0");
    title.textContent = m2.packages[id].title;
    row.append(number, title);
    return row;
  }));
}

// tools/local-loader/chart-loader.mjs
function createChartLoader({ song: song2, readFile, decode, onError = () => {
}, onLoaded = () => {
} }) {
  let generation = 0, current = null;
  const load = async (name, diff = "medium") => {
    if (!/^[a-z0-9_]+$/.test(name) || !["easy", "medium", "hard", "expert"].includes(diff)) throw Error("Canci\xF3n o dificultad inv\xE1lida.");
    const key = name + "/" + diff;
    if (current?.key === key) return current.promise;
    const ticket = ++generation;
    const promise = Promise.resolve().then(async () => {
      try {
        const file = await readFile(`DATA/COMPRESSED/SONGS/${name}_song.pak.xen`);
        const chart = await decode(file, name, diff);
        if (ticket !== generation) return null;
        chart.name = name;
        chart.diff = diff;
        song2.chart = chart;
        onLoaded(chart);
        return chart;
      } catch (e) {
        if (ticket === generation) {
          current = null;
          onError(e);
        }
        throw e;
      }
    });
    current = { key, promise };
    return promise;
  };
  return { load, cancel() {
    generation++;
    current = null;
  }, get current() {
    return current?.key;
  } };
}

// tools/local-loader/ui.mjs
init_network_cache();

// tools/local-loader/stage-prefetch.mjs
function createStagePrefetcher({ prepareSong, knownSong, nextSong = () => null, delayMs = 1500, onProgress = () => {
}, onError = () => {
} }) {
  // Claude 2026-10-12: en el menú se precarga primero el tema SIGUIENTE (así al bajar ya está) y después el actual.
  let timer = null, candidate = null, job = null, sequence = 0, disposed = false, queue = [];
  const stopTimer = () => {
    clearTimeout(timer);
    timer = null;
  };
  function start(song2, priority) {
    if (disposed || !knownSong(song2)) return;
    if (job?.song === song2) {
      job.priority = priority;
      return;
    }
    job?.controller.abort();
    const controller = new AbortController(), id = ++sequence;
    const current = job = { song: song2, priority, controller, id };
    Promise.resolve().then(() => prepareSong(song2, { signal: controller.signal, onProgress: (p) => {
      if (job === current && !controller.signal.aborted) onProgress({ ...p, song: song2, priority: current.priority, complete: false });
    } })).then((p) => {
      if (job === current && !controller.signal.aborted) onProgress({ ...p, song: song2, priority: current.priority, complete: true });
    }).catch((e) => {
      if (job === current && e.name !== "AbortError") onError(e, song2);
    }).finally(() => {
      if (job === current) {
        job = null;
        const n = queue.shift();
        if (n && !disposed) start(n, "background");
      }
    });
  }
  function event(detail) {
    if (disposed) return;
    const { stage, song: song2 } = detail || {};
    if (stage === "preview") {
      if (candidate === song2) return;
      candidate = song2;
      stopTimer();
      if (job?.song !== song2) {
        job?.controller.abort();
        job = null;
      }
      queue = [];
      const nx = nextSong(song2);
      if (knownSong(song2)) timer = setTimeout(() => {
        timer = null;
        if (nx && knownSong(nx)) {
          if (job?.song === song2) job.controller.abort(), job = null;  // lo ya bajado queda guardado
          queue = [song2];
          start(nx, "background");
        } else start(song2, "background");
      }, nx ? 300 : delayMs);
    } else if (stage === "loadStart" || stage === "levelConfirmed") {
      stopTimer();
      queue = [];
      if (knownSong(song2)) {
        candidate = song2;
        start(song2, "level");
      }
    }
  }
  return { event, destroy() {
    disposed = true;
    stopTimer();
    job?.controller.abort();
    job = null;
  }, get active() {
    return job ? { song: job.song, priority: job.priority } : null;
  } };
}

// tools/local-loader/ui.mjs
var $ = (id) => document.getElementById(id);
var mb = (n) => (n / 1048576).toFixed(1) + " MB";
var delivery = window.gh3LoaderConfig;
var control = $("dir").closest(".card");
control.hidden = true;
control.style.display = "none";
var style = document.createElement("style");
style.textContent = "[hidden]{display:none!important} body:not(.loaderStarted) #gh3Row,body:not(.loaderStarted) #songBox,body:not(.loaderStarted) #c1Input{display:none!important}" + theme_default;
document.head.append(style);
var main = document.querySelector("main");
var heading = main.querySelector("h1");
var intro = heading.nextElementSibling;
var hero = document.createElement("header");
hero.className = "hero";
hero.innerHTML = '<div><span class="eyebrow">GUITAR HERO III \xB7 LEGENDS OF ROCK</span><h1>Listo para el pr\xF3ximo riff.</h1><p class="note">El original, en el navegador. Prueba con gr\xE1ficos parciales.</p></div><span class="localBadge">PC y m\xF3vil \xB7 prueba parcial</span>';
heading.replaceWith(hero);
intro.remove();
var details = document.createElement("details");
var summary = document.createElement("summary");
summary.textContent = "Detalles de la prueba";
details.append(summary);
$("checks").before(details);
details.append($("checks"), $("log"));
details.append($("status").closest(".card"), $("songBox"));
if ($("c1Input")) details.append($("c1Input"));
var panel = document.createElement("section");
panel.className = "card";
panel.id = "loaderPanel";
panel.innerHTML = `<span class="eyebrow">TU PR\xD3XIMA SESI\xD3N</span><h2>Preparar para jugar</h2><p class="intro note">Una primera carga. Despu\xE9s, tus canciones quedan guardadas en este navegador para la pr\xF3xima vez.</p>
  <div class="trackList"><div><small>01</small><b>Slow Ride</b></div><div><small>02</small><b>Talk Dirty to Me</b></div><div><small>03</small><b>Hit Me with Your Best Shot</b></div><div><small>04</small><b>Story of My Life</b></div></div>
  <label>Canciones <select id="loaderSongs"><option value="first4">Las primeras cuatro</option><option value="slowride">Solo Slow Ride</option></select></label>
  <p class="note">Esta selecci\xF3n prepara los archivos. Los dem\xE1s temas se eligen en los men\xFAs del juego, con los desbloqueos de tu partida. Su ejecuci\xF3n todav\xEDa est\xE1 pendiente de prueba.</p>
  <div class="row"><button id="loaderPrepare" disabled>Preparar canciones</button><button id="loaderPause" disabled>Pausar preparaci\xF3n</button><button id="loaderPlay" disabled>Jugar</button></div>
  <div class="loadNumbers"><strong id="loaderPercent">0 %</strong><span id="loaderBytes">Esperando la lista de archivos</span></div><progress id="loaderProgress" max="1" value="0"></progress><p id="loaderStatus" role="status" aria-live="polite">Buscando los archivos de esta prueba\u2026</p>
  <p class="note" id="loaderStorage">Los archivos quedan en este navegador. Borrar los datos del sitio tambi\xE9n los borra.</p>`;
var lobby = document.createElement("div");
lobby.id = "loaderLobby";
control.before(lobby);
lobby.append(panel);
var guide = createControls();
lobby.append(guide.element);
$("status").textContent = "Prepar\xE1 las canciones para arrancar.";
var state = window.gh3Loader = { ready: false, stats: null, error: null, misses: 0 };
var db;
var m;
var prepared;
var abort;
var running = false;
var loading = createLoadingView($("r5Box"), state);
var topline = document.createElement("div");
topline.className = "gameTopline";
topline.hidden = true;
topline.innerHTML = '<span>Guitar Hero III \xB7 imagen original parcial</span><span id="gameState">Esperando</span>';
lobby.after(topline);
var moveGuide = setInterval(() => {
  const p = $("gh3Panel");
  if (!p || !document.body.classList.contains("loaderStarted")) return;
  p.querySelector("h3").textContent = "Ajustes \xB7 teclas";
  p.insertBefore(guide.element, p.firstElementChild);
  clearInterval(moveGuide);
}, 200);
var packageIds = () => selectedPackages(m, $("loaderSongs").value);
var stagePrefetch = createStagePrefetcher({
  knownSong: (id) => !!m?.packages[id] && id !== "base",
  nextSong: (id) => {
    const ids = m ? songIds(m) : [], i = ids.indexOf(id);
    return i >= 0 && i + 1 < ids.length ? ids[i + 1] : null;
  },
  prepareSong: async (song2, { signal, onProgress }) => (await prepare(db, m, [song2], { signal, onProgress })).stats,
  onProgress: (p) => {
    state.stagePrefetch = p;
  },
  onError: (e, song2) => {
    state.prefetchError = { song: song2, message: e.message };
  }
});
addEventListener("gh3stage", (e) => {
  if (!delivery?.onDemand || !state.ready) return;
  loading.stage(e.detail);
  stagePrefetch.event(e.detail);
});
addEventListener("pagehide", () => stagePrefetch.destroy());
function fail(e) {
  state.error = e.message;
  document.body.classList.toggle("loaderError", e.name !== "AbortError");
  $("loaderStatus").textContent = e.name === "QuotaExceededError" ? "No hay espacio suficiente en el navegador. Liber\xE1 espacio y reintent\xE1." : e.name === "AbortError" ? "Preparaci\xF3n pausada. Pod\xE9s retomarla sin repetir las partes guardadas." : e.message;
}
async function loadManifest() {
  db = await openCache();
  try {
    const r = await fetch(delivery?.manifest || "/local-manifest.json", { cache: "no-store" });
    if (!r.ok) throw Error("No pude obtener la lista de archivos.");
    m = validateManifest(await r.json());
    await put(db, "meta", "manifest", m);
  } catch (e) {
    const old = await get(db, "meta", "manifest");
    if (!old) throw e;
    m = validateManifest(old);
    $("loaderStatus").textContent = "Usando la lista guardada. Se necesita el servidor para las partes que falten.";
  }
  const estimate = await navigator.storage.estimate();
  $("loaderStorage").textContent = `Archivos guardados en este navegador \xB7 espacio disponible aproximado: ${mb(Math.max(0, (estimate.quota || 0) - (estimate.usage || 0)))}. Borrar los datos del sitio tambi\xE9n los borra.`;
  populateSongOptions($("loaderSongs"), m);
  renderSelectedSongs(panel.querySelector(".trackList"), m, $("loaderSongs").value);
  if (delivery?.onDemand) {
    $("loaderSongs").closest("label").hidden = true;
    panel.querySelector(".trackList").hidden = true;
    panel.querySelector("h2").textContent = "Entrar a Guitar Hero III";
    panel.querySelector(".intro").textContent = "Toc\xE1 Jugar. Eleg\xED el tema en los men\xFAs del juego: la previsualizaci\xF3n usa solo las partes necesarias y el tema completo se prepara al abrir el nivel.";
    panel.querySelector("label").nextElementSibling.textContent = `Cat\xE1logo: ${Object.keys(m.packages).length - 1} canciones. Se conservan los desbloqueos de tu partida. Prueba parcial: la ejecuci\xF3n completa de todos los temas todav\xEDa no est\xE1 verificada.`;
    $("loaderPrepare").hidden = true;
    $("loaderPlay").disabled = false;
  }
  $("loaderPrepare").disabled = false;
  if (!state.error) $("loaderStatus").textContent = "Listo para preparar las canciones. No hace falta elegir carpeta.";
}
async function prepareSelected() {
  if (running) return;
  running = true;
  state.error = null;
  state.ready = false;
  prepared = null;
  abort = new AbortController();
  document.body.classList.remove("loaderError");
  state.phase = "preparing";
  $("loaderStatus").textContent = "Revisando los archivos guardados\u2026";
  $("loaderPrepare").disabled = $("loaderPlay").disabled = $("loaderSongs").disabled = true;
  $("loaderPause").disabled = false;
  try {
    if (m.delivery?.sharedCache) await activateChunkCache();
    const ids = delivery?.onDemand ? ["base"] : packageIds();
    const lazy = delivery?.onDemand && m.delivery?.sharedCache;
    prepared = await prepare(db, m, ids, { signal: abort.signal, skip: lazy ? deferInitial : null, onProgress: (p) => {
      state.stats = p;
      $("loaderProgress").value = p.total ? p.done / p.total : 1;
      $("loaderPercent").textContent = Math.floor(100 * (p.total ? p.done / p.total : 1)) + " %";
      $("loaderBytes").textContent = `${mb(p.done)} / ${mb(p.total)}`;
      $("loaderStatus").textContent = `${mb(p.cached)} reutilizados \xB7 ${mb(p.downloaded)} cargados ahora \xB7 ${p.path.split("/").at(-1)}`;
    } });
    const known = new Map(m.files.flatMap((f) => f.chunks.map((c) => [c.hash, c.size])));
    await new Promise((resolve, reject) => {
      const tx = db.transaction("chunks", "readonly"), cursor = tx.objectStore("chunks").openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return;
        const blob = c.value;
        if (blob instanceof Blob && blob.size === known.get(c.key)) prepared.chunks.set(c.key, blob);
        c.continue();
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || Error("No pude recuperar los archivos guardados."));
    });
    window.gh3LoaderFiles = m.files.filter((f) => /\/songs\/.*_song\.pak\.xen$/i.test(f.path) && prepared.ids.includes(f.id)).map((f) => new File(f.chunks.map((c) => prepared.chunks.get(c.hash)), f.path));
    window.gh3LoaderMount = {
      version: m.version,
      chunks: [...prepared.chunks],
      delivery: m.delivery,
      songFiles: delivery?.onDemand ? Object.fromEntries(Object.entries(m.packages).filter(([id]) => id !== "base").map(([id, p]) => [id, p.files.map((i) => ({ ...m.files[i], chunkSize: m.chunkSize }))])) : void 0
    };
    // Claude 2026-10-12: "Saltear videos de inicio" (panel → Partida): el juego no encuentra los logos/intro y sigue
    // de largo, sin apretar botones. GH3_Intro (fondo del menú) se conserva.
    const skipIntro = (() => { try { return localStorage.getItem("gh3skipintro") === "1"; } catch { return false; } })();
    picked = m.files.filter((f) => !(skipIntro && /\/(atvi|ns_logo|ro_logo|intro)\.bik\.xen$/i.test(f.path))).map((f) => ({ name: f.path, data: { gh3Local: true, ...f, chunkSize: m.chunkSize } }));
    $("go").disabled = false;
    state.ready = true;
    state.phase = "ready";
    state.stats = prepared.stats;
    $("loaderPlay").disabled = false;
    $("loaderProgress").value = 1;
    $("loaderStatus").textContent = `Listo para jugar \xB7 ${mb(prepared.stats.cached)} reutilizados \xB7 ${mb(prepared.stats.downloaded)} cargados ahora.`;
    $("status").textContent = "Canciones preparadas. Toc\xE1 Jugar.";
    await put(db, "meta", "prepared", { version: m.version, packages: ids }).catch(() => {});
    if (lazy) {
      state.deferred = { started: Date.now() };
      warmDeferred(m, [...new Set(ids.flatMap((id) => m.packages[id].files))].map((i) => m.files[i]).filter(deferInitial)).then(() => state.deferred.done = Date.now());
    }
  } catch (e) {
    fail(e);
  } finally {
    running = false;
    $("loaderPrepare").disabled = $("loaderSongs").disabled = false;
    $("loaderPause").disabled = true;
    if (delivery?.onDemand && !state.ready) $("loaderPlay").disabled = false;
  }
}
$("loaderPrepare").onclick = prepareSelected;
$("loaderPause").onclick = () => abort?.abort();
$("loaderSongs").onchange = () => {
  state.ready = false;
  $("loaderPlay").disabled = true;
  $("loaderStatus").textContent = "Prepar\xE1 la selecci\xF3n nueva para jugar. Eleg\xED el tema dentro del men\xFA del juego.";
  renderSelectedSongs(panel.querySelector(".trackList"), m, $("loaderSongs").value);
};
$("loaderPlay").onclick = async () => {
  if (!state.ready) {
    if (!delivery?.onDemand) return;
    try {
      await window.r6ctx?.resume();
    } catch {
    }
    await prepareSelected();
    if (!state.ready) return;
  }
  try {
    await window.r6ctx?.resume();
  } catch {
  }
  state.manualNavigation = !!delivery?.onDemand || !["first4", "slowride"].includes($("loaderSongs").value);
  $("loaderPlay").disabled = $("loaderPrepare").disabled = $("loaderSongs").disabled = true;
  document.body.classList.add("loaderStarted");
  topline.hidden = false;
  loading.start();
  $("secs").value = "86400";
  $("go").click();
  if (!delivery?.onDemand && ["first4", "slowride"].includes($("loaderSongs").value)) $("goSong").click();
  $("loaderStatus").textContent = state.manualNavigation ? "Eleg\xED la canci\xF3n en los men\xFAs del juego. Se conservan los desbloqueos de tu partida." : "Arrancando el juego con los archivos preparados\u2026";
  $("gh3Row")?.scrollIntoView({ block: "start", behavior: "instant" });
};
var W = window.Worker;
window.Worker = function(...args) {
  const w = new W(...args);
  w.addEventListener("message", (e) => {
    loading.message(e.data || {});
    if (e.data?.type !== "localCache") return;
    const d = e.data;
    if (d.misses) state.misses = d.misses;
    if (d.fatal || d.error) {
      state.error = d.fatal || d.error;
      $("loaderStatus").textContent = state.error;
    }
  });
  w.addEventListener("error", (e) => loading.fail("No se pudo continuar con el juego: " + e.message));
  return w;
};
state.file = async (name) => {
  const f = m.files.find((f2) => f2.path.toLowerCase() === name.toLowerCase());
  if (!f) throw Error("Archivo desconocido.");
  const stats = { cached: 0, downloaded: 0 }, parts = [];
  for (let i = 0; i < f.chunks.length; i++) parts.push(await loadChunk(db, m, f, i, stats));
  return new File(parts, f.path);
};
var chartLoader = createChartLoader({
  song: window.gh3Song,
  readFile: (name) => state.file(name),
  decode: async (file, name, diff) => gh3Song.parseSongPak(await gh3Song.inflateRaw(file), name, diff),
  onLoaded: (chart) => {
    $("songStat").textContent = `Canci\xF3n: ${m.packages[chart.name]?.title || chart.name} (${chart.diff}), ${chart.notes.length} notas.`;
  },
  onError: (e) => {
    $("songStat").textContent = "No pude leer las notas: " + e.message;
  }
});
state.loadChart = (name, diff) => chartLoader.load(name, diff);
var observedSong = null;
setInterval(() => {
  const name = window.songPak;
  if (!state.ready || !name || name === observedSong) return;
  observedSong = name;
  chartLoader.load(name).catch(() => {
    if (observedSong === name) observedSong = null;
  });
}, 1e3);
try {
  await loadManifest();
  const previous = await get(db, "meta", "prepared");
  if (!delivery?.onDemand && Array.isArray(previous?.packages) && previous.packages.every((id) => m.packages[id])) {
    $("loaderSongs").value = restoreSelection(m, previous.packages);
    renderSelectedSongs(panel.querySelector(".trackList"), m, $("loaderSongs").value);
    await prepareSelected();
  }
} catch (e) {
  fail(e);
}
