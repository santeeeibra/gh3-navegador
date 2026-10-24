(() => {
  // tools/r5-live-song/live-reader.mjs
  var regs = 20483;
  var hex = (n) => n.toString(16).toUpperCase().padStart(16, "0");
  function* readLiveDraws(bytes, { hash, wanted = null, verifyShaders = wanted, counts = {} } = {}) {
    const fail = (m) => {
      throw Error("R5L projection: " + m);
    };
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 112 || bytes.byteLength > 96 * 1024 * 1024 || bytes.byteOffset % 4)
      fail("input bounds/alignment");
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), u = (o) => v.getUint32(o, true), q = (o) => v.getBigUint64(o, true), words = (o, n) => new Uint32Array(bytes.buffer, bytes.byteOffset + o, n);
    if (u(0) !== 826684754 || v.getUint16(4, true) !== 1 || v.getUint16(6, true) !== 64 || u(24) !== regs || u(20) !== 1)
      fail("header");
    let bank, ended = false, footer = false;
    const shaders = new Set;
    for (let off = 64;off < bytes.length; ) {
      if (off + 16 > bytes.length)
        fail("short record");
      const type = u(off), size = u(off + 4), b = off + 16, end = off + size;
      if (type < 1 || type > 9 || size < 16 || size % 16 || end > bytes.length || size > 16 * 1024 * 1024)
        fail("record bounds/type");
      switch (type) {
        case 1:
          if (size < 48 + regs * 4 || bank || u(b + 16) !== 1)
            fail("begin");
          bank = words(b + 32, regs).slice();
          break;
        case 2: {
          if (!bank || size < 32)
            fail("delta");
          const n = u(b);
          if (24 + n * 8 > size)
            fail("delta size");
          for (let i = 0;i < n; i++) {
            const index = u(b + 8 + i * 8);
            if (index >= regs)
              fail("register index");
            bank[index] = u(b + 12 + i * 8);
          }
          break;
        }
        case 3: {
          if (size < 48)
            fail("shader");
          const stage = u(b), n = u(b + 4), id = hex(q(b + 8)), nv = u(b + 24), nt = u(b + 28), p = b + 32 + (nv + nt) * 8;
          if (stage > 1 || nv > 96 || nt > 32 || p + n * 4 > end)
            fail("shader bounds");
          shaders.add(stage + ":" + id);
          if (!verifyShaders || verifyShaders.has(id)) {
            const be = new Uint8Array(n * 4);
            for (let i = 0;i < n * 4; i += 4)
              for (let j = 0;j < 4; j++)
                be[i + j] = bytes[p + i + 3 - j];
            if (hash(be) !== q(b + 8))
              fail("shader hash");
          }
          break;
        }
        case 4:
          fail("unexpected BLOB");
          break;
        case 5: {
          if (!bank || size < 112 || ended)
            fail("draw order");
          const nv = u(b + 52), nt = u(b + 72);
          if (nv > 96 || nt > 32 || 96 + nv * 24 + nt * 128 > size - 16)
            fail("fetch counts");
          const vs = q(b + 56), ps = q(b + 64);
          counts.draws = (counts.draws || 0) + 1;
          if (wanted && !wanted.has(hex(vs))) {
            counts.omitted = (counts.omitted || 0) + 1;
            break;
          }
          if (vs && !shaders.has("0:" + hex(vs)) || ps && !shaders.has("1:" + hex(ps)))
            fail("missing shader");
          const status = u(b + 4);
          if (status > 4)
            fail("status");
          const d = { type: "draw", index: u(b), status, issued: status === 0 || status === 4, unsupported: u(b + 8), primitive: u(b + 12), indexCount: u(b + 16), indexSource: u(b + 28), indexFormat: u(b + 32), indexEndian: u(b + 36), indexPhys: u(b + 40), indexBytes: u(b + 44), vs, ps, vertices: [], textures: [], registers: bank };
          for (let i = 0;i < nv; i++) {
            const p = b + 96 + i * 24, slot = u(p);
            if (slot >= 96)
              fail("vertex slot");
            d.vertices.push({ slot, raw: words(p + 4, 2), status: u(p + 16) });
          }
          for (let i = 0;i < nt; i++) {
            const p = b + 96 + nv * 24 + i * 128, slot = u(p);
            if (slot >= 32)
              fail("texture slot");
            d.textures.push({ slot, raw: words(p + 4, 6), status: u(p + 28), format: u(p + 32), endian: u(p + 36), dimension: u(p + 40), width: u(p + 44), height: u(p + 48), depth: u(p + 52), pitch: u(p + 56), tiled: u(p + 60), mipMin: u(p + 64), mipMax: u(p + 68), packedMips: u(p + 72), basePhys: u(p + 76), baseBytes: u(p + 80), baseDependency: u(p + 104) });
          }
          yield d;
          break;
        }
        case 6:
          counts.copies = (counts.copies || 0) + 1;
          break;
        case 7:
          if (size !== 48 || !bank)
            fail("swap");
          counts.swap = u(b);
          ended = true;
          break;
        case 8:
          if (!ended)
            fail("end");
          break;
        case 9:
          if (!ended || end !== bytes.length)
            fail("footer");
          footer = true;
          break;
      }
      off = end;
    }
    if (!footer)
      fail("missing footer");
  }

  // tools/r5-menu/texture-layout.mjs
  var formats = { 2: { block: 1, bytes: 1, gpu: "r8unorm" }, 6: { block: 1, bytes: 4, gpu: "rgba8unorm" }, 18: { block: 4, bytes: 8, gpu: "bc1-rgba-unorm" }, 19: { block: 4, bytes: 16, gpu: "bc2-rgba-unorm" }, 20: { block: 4, bytes: 16, gpu: "bc3-rgba-unorm" }, 49: { block: 4, bytes: 16, gpu: "bc5-rg-unorm" } };
  var align = (n, a) => Math.ceil(n / a) * a;
  function tiledOffset2D(x, y, pitch, logBytes) {
    pitch = align(pitch, 32);
    const macro = (x >> 5) + (y >> 5) * (pitch >> 5) << logBytes + 7;
    const micro = (x & 7) + ((y & 14) << 2) << logBytes;
    const offset = macro + ((micro & ~15) << 1) + (micro & 15) + ((y & 1) << 4);
    return ((offset & ~511) << 3) + ((y & 16) << 7) + ((offset & 448) << 2) + ((((y & 8) >> 2) + (x >> 3) & 3) << 6) + (offset & 63);
  }
  function prepareTextureBase(t, source, { allowUnknown = false } = {}) {
    const f = formats[t.format];
    if (!f)
      throw Error("Texture layout: unsupported format " + t.format);
    const cube = t.dimension === 3 && t.depth === 5 && t.width === t.height;
    if (!(source instanceof Uint8Array) || !cube && (t.dimension !== 1 || t.depth !== 0) || t.raw[1] & 1 << 10 || t.status)
      throw Error("Texture layout: unsupported dimension/status");
    if (!allowUnknown && t.baseDependency > 1)
      throw Error("Texture layout: unresolved GPU dependency");
    if (![0, 1, 2, 3].includes(t.endian) || ![0, 1].includes(t.tiled))
      throw Error("Texture layout: endian/tiling");
    const width = t.width + 1, height = t.height + 1;
    if (width < 1 || height < 1 || width > 8192 || height > 8192 || t.pitch < width || source.length !== t.baseBytes)
      throw Error("Texture layout: dimensions/payload");
    const nx = Math.ceil(width / f.block), ny = Math.ceil(height / f.block);
    let pitch = align(Math.ceil(t.pitch / f.block), 32);
    if (!t.tiled)
      pitch = align(pitch * f.bytes, 256) / f.bytes;
    let ox = 0, oy = 0;
    if (t.packedMips && Math.min(Math.ceil(Math.log2(width)), Math.ceil(Math.log2(height))) <= 4) {
      if (Math.ceil(Math.log2(width)) > Math.ceil(Math.log2(height)))
        oy = 16 / f.block;
      else
        ox = 16 / f.block;
    }
    const layers = cube ? 6 : 1, faceStride = pitch * align(ny, 32) * f.bytes;
    const output = new Uint8Array(nx * ny * f.bytes * layers), log = Math.log2(f.bytes);
    const xor = [0, 1, 3, 2][t.endian];
    let requiredBytes = 0;
    for (let y = 0;y < ny; y++)
      for (let x = 0;x < nx; x++) {
        const p = t.tiled ? tiledOffset2D(x + ox, y + oy, pitch, log) : ((y + oy) * pitch + x + ox) * f.bytes;
        requiredBytes = Math.max(requiredBytes, p + f.bytes);
      }
    requiredBytes += (layers - 1) * faceStride;
    if (source.length < requiredBytes) {
      const error = Error(`Texture layout: missing guest bytes (${source.length} captured, ${requiredBytes} required)`);
      error.code = "missing-bytes";
      error.requiredBytes = requiredBytes;
      throw error;
    }
    for (let layer = 0;layer < layers; layer++)
      for (let y = 0;y < ny; y++)
        for (let x = 0;x < nx; x++) {
          const offset = layer * faceStride + (t.tiled ? tiledOffset2D(x + ox, y + oy, pitch, log) : ((y + oy) * pitch + x + ox) * f.bytes);
          const dest = (layer * ny * nx + y * nx + x) * f.bytes;
          for (let i = 0;i < f.bytes; i++) {
            const p = offset + i ^ xor;
            if (p < 0 || p >= source.length)
              throw Error(`Texture layout: source bounds at ${p}`);
            output[dest + i] = source[p];
          }
        }
    return { width, height, layers, cube, format: f.gpu, blockWidth: f.block, blockBytes: f.bytes, bytesPerRow: nx * f.bytes, rowsPerImage: ny, data: output, mipsPending: t.mipMax > 0, dependency: t.baseDependency };
  }

  // tools/r5-menu/primitive.mjs
  function preparePrimitive(draw, blob) {
    if (!draw.issued)
      return { topology: null, indices: new Uint32Array, skipped: "not issued" };
    if (draw.unsupported)
      throw Error("Primitive: producer marks draw unsupported");
    const count = draw.indexCount;
    if (!Number.isSafeInteger(count) || count < 0 || count > 1e6)
      throw Error("Primitive: index count");
    let input;
    if (draw.indexSource === 0)
      input = Uint32Array.from({ length: count }, (_, i) => i);
    else if (draw.indexSource === 1) {
      if (!blob || blob.phys !== draw.indexPhys || blob.data.length !== draw.indexBytes || draw.indexFormat > 1 || draw.indexEndian > 3)
        throw Error("Primitive: index source/format");
      const size = draw.indexFormat ? 4 : 2, endian = size === 2 ? draw.indexEndian === 2 ? 1 : draw.indexEndian === 3 ? 0 : draw.indexEndian : draw.indexEndian;
      const xor = [0, 1, 3, 2][endian];
      input = new Uint32Array(count);
      for (let i = 0;i < count; i++) {
        let n = 0;
        for (let j = 0;j < size; j++) {
          const p = i * size + j ^ xor;
          if (p >= blob.data.length)
            throw Error("Primitive: missing endian-aligned index bytes");
          n += blob.data[p] << j * 8 >>> 0;
        }
        input[i] = n >>> 0;
      }
    } else
      throw Error("Primitive: unsupported index source");
    if (draw.indexSource === 1 && !draw.registers)
      throw Error("Primitive: indexed draw needs registers");
    const resetEnabled = draw.indexSource === 1 && !!(draw.registers[8709] & 1 << 21);
    const reset = resetEnabled ? (draw.registers[8451] & (draw.indexFormat ? 16777215 : 65535)) >>> 0 : null;
    const segments = [];
    let segment = [];
    for (const index of input) {
      if (resetEnabled && index === reset) {
        segments.push(segment);
        segment = [];
      } else
        segment.push(index);
    }
    segments.push(segment);
    if (draw.primitive === 1)
      return { topology: "point-list", indices: Uint32Array.from(segments.flat()) };
    const output = [];
    for (const input of segments) {
      const count = input.length;
      if (draw.primitive === 4) {
        output.push(...input.slice(0, Math.floor(count / 3) * 3));
      } else if (draw.primitive === 5) {
        for (let i = 2;i < count; i++)
          output.push(input[0], input[i - 1], input[i]);
      } else if (draw.primitive === 6) {
        for (let i = 2;i < count; i++) {
          const a = input[i - 2], b = input[i - 1], c = input[i];
          if (a === b || b === c || a === c)
            continue;
          output.push(...i & 1 ? [b, a, c] : [a, b, c]);
        }
      } else if (draw.primitive === 13) {
        for (let i = 0;i + 3 < count; i += 4)
          output.push(input[i], input[i + 1], input[i + 2], input[i], input[i + 2], input[i + 3]);
      } else
        throw Error("Primitive: unsupported type " + draw.primitive);
    }
    return { topology: "triangle-list", indices: Uint32Array.from(output) };
  }

  // tools/hw60/src/tap.mjs
  var hex2 = (n) => n.toString(16).toUpperCase().padStart(16, "0");
  var STRIDE = { "80708BD1B82638B0": 5, "582ABCF5FF619A55": 7, "87D4CAE67E72C501": 7, "19815E13AC0DCC92": 7, "27643FEB20B8CBBD": 7, C6F0B6F9BA5A2B12: 7, "10CA3B730086027C": 6, "035C1CB9583C0C7E": 6 };
  var WANTED = new Set(Object.keys(STRIDE));
  var COLAS = new Set(["10CA3B730086027C", "035C1CB9583C0C7E"]);
  var chan = new BroadcastChannel("hw60");
  var sent = new Map;
  var frame = 0;
  var lastBoard = null;
  var enabled = true;
  var stats = { frames: 0, draws: 0, errors: 0, ms: 0, lastError: null };
  chan.onmessage = (e) => {
    if (e.data?.type === "tapEnable")
      enabled = !!e.data.on;
    if (e.data?.type === "tapResend")
      sent.clear();
  };
  var sameBytes = (a, b) => {
    if (!a || a.length !== b.length)
      return false;
    for (let i = 0;i < a.length; i += 4)
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3])
        return false;
    return true;
  };
  function tap(bytes, info, api) {
    if (!enabled || !api?.readPhysical)
      return;
    const t0 = performance.now(), out = [], textures = [];
    frame++;
    const read = (p, n) => api.readPhysical(p, n).slice();
    for (const d of readLiveDraws(bytes, { wanted: WANTED, verifyShaders: new Set, counts: {} })) {
      try {
        if (!d.issued)
          continue;
        const vs = hex2(d.vs), ps = hex2(d.ps), r = d.registers, f = new DataView(r.buffer, r.byteOffset);
        const cf = (base, n) => {
          const o = new Float32Array(n * 4);
          for (let i = 0;i < n * 4; i++)
            o[i] = f.getFloat32((base + i) * 4, true);
          return o;
        };
        const item = { vs, ps, blend: r[8705] >>> 0, mask: r[8452] & 15, vc: cf(16384, COLAS.has(vs) ? 132 : 10), vk: cf(16384 + 154 * 4, 2), vt: cf(16384 + 253 * 4, 3), pc: cf(17408, 3) };
        const tx = d.textures[0];
        if (tx) {
          const key = JSON.stringify([tx.basePhys, tx.baseBytes, ...tx.raw]);
          item.tex = key;
          item.sampler = { clampX: tx.raw[0] >>> 10 & 7, clampY: tx.raw[0] >>> 13 & 7, mag: tx.raw[3] >>> 19 & 3 };
          const last = sent.get(key);
          if ((last === undefined || frame - last > 600) && textures.length < 3) {
            const p = prepareTextureBase(tx, read(tx.basePhys, tx.baseBytes), { allowUnknown: true });
            textures.push({ key, format: p.format, width: p.width, height: p.height, bytesPerRow: p.bytesPerRow, data: p.data });
            sent.set(key, frame);
          }
        }
        const stride = STRIDE[vs];
        if (stride && d.vertices.length) {
          const v = d.vertices[0], phys = (v.raw[0] & ~3) >>> 0, n = (v.raw[1] >>> 2 & 16777215) * 4, raw = read(phys, n);
          if (vs === "80708BD1B82638B0" && lastBoard && sameBytes(lastBoard, raw))
            item.sameMesh = true;
          else {
            if (vs === "80708BD1B82638B0")
              lastBoard = raw;
            const dv = new DataView(raw.buffer), count = Math.floor(n / (stride * 4)), verts = new Float32Array(count * 4), colors = new Uint32Array(count);
            const co = stride === 7 ? 4 : 2, uo = stride === 7 ? 5 : 3, extra = stride === 6 ? new Float32Array(count) : null;
            for (let i = 0;i < count; i++) {
              const b = i * stride * 4;
              verts[i * 4] = dv.getFloat32(b, false);
              verts[i * 4 + 1] = dv.getFloat32(b + 4, false);
              verts[i * 4 + 2] = dv.getFloat32(b + uo * 4, false);
              verts[i * 4 + 3] = dv.getFloat32(b + uo * 4 + 4, false);
              colors[i] = dv.getUint32(b + co * 4, false);
              if (extra)
                extra[i] = dv.getFloat32(b + 20, false);
            }
            item.verts = verts;
            item.colors = colors;
            if (extra)
              item.extra = extra;
            const ib = d.indexSource === 1 ? { phys: d.indexPhys, data: read(d.indexPhys, d.indexBytes) } : undefined;
            const prim = preparePrimitive(d, ib);
            item.idx = prim.indices.length === 6 ? null : prim.indices;
            if (prim.indices.length === 6)
              item.quad = Array.from(prim.indices);
          }
        }
        out.push(item);
        stats.draws++;
      } catch (e) {
        stats.errors++;
        stats.lastError = String(e?.message || e);
      }
    }
    stats.frames++;
    stats.ms += performance.now() - t0;
    chan.postMessage({ type: "frame", seq: info?.seq, swap: info?.swap, at: performance.timeOrigin + t0, draws: out, textures, stats: frame % 60 === 0 ? { ...stats } : null });
  }
  var inner = globalThis.__r5liveConsumer;
  globalThis.__r5liveConsumer = (bytes, info, api) => {
    try {
      tap(bytes, info, api);
    } catch (e) {
      stats.errors++;
      stats.lastError = String(e?.message || e);
    }
    return inner ? inner(bytes, info, api) : undefined;
  };
})();
