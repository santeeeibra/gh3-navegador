(() => {
  // tools/local-loader/sha256.mjs
  var K = new Uint32Array([
    1116352408,
    1899447441,
    3049323471,
    3921009573,
    961987163,
    1508970993,
    2453635748,
    2870763221,
    3624381080,
    310598401,
    607225278,
    1426881987,
    1925078388,
    2162078206,
    2614888103,
    3248222580,
    3835390401,
    4022224774,
    264347078,
    604807628,
    770255983,
    1249150122,
    1555081692,
    1996064986,
    2554220882,
    2821834349,
    2952996808,
    3210313671,
    3336571891,
    3584528711,
    113926993,
    338241895,
    666307205,
    773529912,
    1294757372,
    1396182291,
    1695183700,
    1986661051,
    2177026350,
    2456956037,
    2730485921,
    2820302411,
    3259730800,
    3345764771,
    3516065817,
    3600352804,
    4094571909,
    275423344,
    430227734,
    506948616,
    659060556,
    883997877,
    958139571,
    1322822218,
    1537002063,
    1747873779,
    1955562222,
    2024104815,
    2227730452,
    2361852424,
    2428436474,
    2756734187,
    3204031479,
    3329325298
  ]);
  var rotr = (x, n) => x >>> n | x << 32 - n;
  function sha256(input) {
    const b = new Uint8Array(Math.ceil((input.length + 9) / 64) * 64);
    b.set(input);
    b[input.length] = 128;
    const dv = new DataView(b.buffer), bits = input.length * 8;
    dv.setUint32(b.length - 8, Math.floor(bits / 4294967296));
    dv.setUint32(b.length - 4, bits >>> 0);
    const h = new Uint32Array([1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225]), w = new Uint32Array(64);
    for (let off = 0; off < b.length; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const x = w[i - 15], y = w[i - 2];
        w[i] = w[i - 16] + (rotr(x, 7) ^ rotr(x, 18) ^ x >>> 3) + w[i - 7] + (rotr(y, 17) ^ rotr(y, 19) ^ y >>> 10) >>> 0;
      }
      let [a, c, d, e, f, g, j, k] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = k + (rotr(f, 6) ^ rotr(f, 11) ^ rotr(f, 25)) + (f & g ^ ~f & j) + K[i] + w[i] >>> 0;
        const t2 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + (a & c ^ a & d ^ c & d) >>> 0;
        k = j;
        j = g;
        g = f;
        f = e + t1 >>> 0;
        e = d;
        d = c;
        c = a;
        a = t1 + t2 >>> 0;
      }
      [a, c, d, e, f, g, j, k].forEach((x, i) => {
        h[i] = h[i] + x >>> 0;
      });
    }
    return [...h].map((x) => x.toString(16).padStart(8, "0")).join("");
  }

  // tools/local-loader/cache.mjs
  var DB_NAME = "gh3-local-chunks-v1";
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
  function put(db, store, key, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error || Error("No se pudo guardar en el navegador."));
    });
  }
  var chunkURL = (m, f, i) => m.delivery?.chunks ? `${m.delivery.chunks}/${f.chunks[i].hash}` : `/local-chunk/${m.version}/${f.id}/${i}`;

  // tools/local-loader/song-prefetch.mjs
  function createSongPrefetcher({ packages, ensureChunk, notify = () => {
  } }) {
    const ready = /* @__PURE__ */ new Set();
    let loading = false;
    return (file) => {
      const id = /\/songs\/([a-z0-9_]+)_song\.pak\.xen$/i.exec(file.path)?.[1].toLowerCase();
      if (!id || !packages[id] || ready.has(id) || loading) return;
      loading = true;
      const files = packages[id], total = files.reduce((n, f) => n + f.size, 0);
      let done = 0;
      notify({ type: "songLoad", song: id, done, total, complete: false });
      try {
        for (const f of files) for (let i = 0; i < f.chunks.length; i++) {
          ensureChunk(f, i);
          done += f.chunks[i].size;
          notify({ type: "songLoad", song: id, done, total, complete: false });
        }
        ready.add(id);
        notify({ type: "songLoad", song: id, done, total, complete: true });
      } catch (e) {
        notify({ type: "songLoad", song: id, done, total, error: e.message });
        throw e;
      } finally {
        loading = false;
      }
    };
  }

  // tools/local-loader/runtime.mjs
  function createReader({ cached = /* @__PURE__ */ new Map(), fetchSync, readBlob, persist = () => {
  }, onMiss = () => {
  }, beforeRead = () => {
  }, maxBytes = 32 * 1048576 }) {
    const hot = /* @__PURE__ */ new Map(), verified = /* @__PURE__ */ new Set();
    let bytes = 0;
    return (f, buffer, offset, length, position) => {
      if (position >= f.size || length <= 0) return 0;
      beforeRead(f);
      const end = Math.min(f.size, position + length);
      let at = position;
      while (at < end) {
        const i = Math.floor(at / f.chunkSize), c = f.chunks[i];
        if (!c) throw Error("Parte ausente.");
        let b = hot.get(c.hash);
        if (b) {
          hot.delete(c.hash);
          hot.set(c.hash, b);
        } else {
          const blob = cached.get(c.hash);
          b = blob ? readBlob(blob) : fetchSync(f, i);
          if (b.length !== c.size || !verified.has(c.hash) && sha256(b) !== c.hash) throw Error("Integridad de archivo incorrecta: " + f.path);
          verified.add(c.hash);
          if (!blob) {
            onMiss(f, c);
            persist(c.hash, new Blob([b]));
          }
          hot.set(c.hash, b);
          bytes += b.length;
          while (bytes > maxBytes && hot.size > 1) {
            const [key, old] = hot.entries().next().value;
            hot.delete(key);
            bytes -= old.length;
          }
        }
        const start = at - c.offset, n = Math.min(end - at, c.size - start);
        if (n <= 0) throw Error("Lectura fuera de la parte.");
        buffer.set(b.subarray(start, start + n), offset + at - position);
        at += n;
      }
      return end - position;
    };
  }
  function install(WORKERFS, configuration) {
    const cached = new Map(configuration.chunks), db = openCache();
    let misses = 0;
    db.catch((e) => self.postMessage({ type: "localCache", error: e.message }));
    const readBlob = (blob) => new Uint8Array(WORKERFS.reader.readAsArrayBuffer(blob));
    const persist = (hash, blob) => {
      cached.set(hash, blob);
      db.then((d) => put(d, "chunks", hash, blob)).catch((e) => self.postMessage({ type: "localCache", error: e.message }));
    };
    const fetchSync = (f, i) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", chunkURL(configuration, f, i), false);
      xhr.responseType = "arraybuffer";
      xhr.send();
      if (xhr.status !== 200) throw Error("Falta un archivo y el servidor local no est\xE1 disponible: " + f.path);
      return new Uint8Array(xhr.response);
    };
    const prefetch = createSongPrefetcher({ packages: configuration.songFiles || {}, notify: (m) => self.postMessage(m), ensureChunk: (f, i) => {
      const c = f.chunks[i], existing = cached.get(c.hash);
      const bytes = existing ? readBlob(existing) : fetchSync(f, i);
      if (bytes.length !== c.size || sha256(bytes) !== c.hash) throw Error("Integridad de canci\xF3n incorrecta: " + f.path);
      if (!existing) persist(c.hash, new Blob([bytes]));
    } });
    const reader = createReader({
      cached,
      readBlob,
      fetchSync,
      persist,
      beforeRead: prefetch,
      onMiss: (f, c) => self.postMessage({ type: "localCache", misses: ++misses, path: f.path, bytes: c.size })
    });
    const original = WORKERFS.stream_ops.read;
    WORKERFS.stream_ops.read = function(stream, ...args) {
      if (!stream.node.contents.gh3Local) return original.call(this, stream, ...args);
      try {
        return reader(stream.node.contents, ...args);
      } catch (e) {
        self.postMessage({ type: "localCache", fatal: e.message });
        throw e;
      }
    };
  }
  globalThis.GH3LocalFS = { install };
  if (typeof WorkerGlobalScope !== "undefined" && globalThis instanceof WorkerGlobalScope) {
    const nativeFetch = globalThis.fetch;
    globalThis.fetch = async function(...args) {
      const response = await nativeFetch(...args), url = typeof args[0] === "string" ? args[0] : args[0]?.url;
      if (!/\.wasm(?:\?|$)/.test(url || "") || !response.ok || !response.body) return response;
      const total = Number(response.headers.get("content-length")) || 0, reader = response.body.getReader();
      let loaded = 0, last = 0;
      self.postMessage({ type: "engineLoad", loaded, total, done: false });
      const stream = new ReadableStream({ async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            self.postMessage({ type: "engineLoad", loaded, total, done: true });
            controller.close();
            return;
          }
          loaded += value.byteLength;
          const now = performance.now();
          if (now - last > 150) {
            last = now;
            self.postMessage({ type: "engineLoad", loaded, total, done: false });
          }
          controller.enqueue(value);
        } catch (e) {
          controller.error(e);
          self.postMessage({ type: "localCache", fatal: "No se pudo cargar el programa: " + e.message });
        }
      }, cancel(reason) {
        return reader.cancel(reason);
      } });
      return new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers });
    };
  }
})();
