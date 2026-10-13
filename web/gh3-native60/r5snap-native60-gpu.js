(() => {
  // tools/r5-native60/renderer.mjs
  var factors = { 0: "zero", 1: "one", 4: "src", 5: "one-minus-src", 6: "src-alpha", 7: "one-minus-src-alpha", 8: "dst", 9: "one-minus-dst", 10: "dst-alpha", 11: "one-minus-dst-alpha", 12: "constant", 13: "one-minus-constant", 14: "src-alpha-saturated" };
  var ops = ["add", "subtract", "min", "max", "reverse-subtract"];
  var compares = ["never", "less", "equal", "less-equal", "greater", "not-equal", "greater-equal", "always"];
  var stencilOps = ["keep", "zero", "replace", "increment-clamp", "decrement-clamp", "invert", "increment-wrap", "decrement-wrap"];
  async function createLiveSongRenderer(device2, shaders2, { prepareTexture = (t) => t, onPipeline = null } = {}) {
    const modules = {}, bindings = {}, pipelines = /* @__PURE__ */ new Map(), slots = [], arenas = {}, textures = /* @__PURE__ */ new Map(), samplers = /* @__PURE__ */ new Map(), packed = {};
    let frame = 0, generation = 0, cacheInputs = null, cacheReady = null, cacheRejected = null;
    const stats = { frames: 0, draws: 0, pipelineBuilds: 0, bufferBuilds: 0, textureUploads: 0, readbacks: 0, rejectedPipelines: {} };
    function useShader(id) {
      if (modules[id]) return;
      const s = shaders2[id];
      if (!s) throw Error("Shader missing " + id);
      stats.shaderBuilds = (stats.shaderBuilds || 0) + 1;
      modules[id] = device2.createShaderModule({ label: id, code: s.code });
      bindings[id] = [...s.code.matchAll(/@group\((\d+)\)\s*@binding\((\d+)\)\s*var(?:<[^>]*>)?\s+(\w+)\s*:\s*([^;]+);/g)].filter((m) => s.code.split(m[3]).length > 2).map((m) => ({ group: +m[1], binding: +m[2], name: m[3], type: m[4] }));
    }
    const options = globalThis.__r5Options || {}, cfg = { scale: [0.5, 0.75].includes(options.renderScale) ? options.renderScale : 1, gpuTextureBytes: 67108864, deferSceneUploads: false, keepTextures: false };
    let scale = cfg.scale, renderWidth = 1280, renderHeight = 720, target = null, depth = null, upscalePipeline = null, upscaleGroup = null, upscaleSampler = null, upscaleReady = null;
    function upscale() {
      return upscaleReady ??= (async () => {
        const module = device2.createShaderModule({ label: "scene-upscale", code: `
   @group(0) @binding(0) var image:texture_2d<f32>;
   @group(0) @binding(1) var filtering:sampler;
   struct V { @builtin(position) p:vec4<f32>, @location(0) uv:vec2<f32> }
   @vertex fn vs(@builtin(vertex_index) i:u32)->V {let p=array<vec2<f32>,3>(vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.))[i];return V(vec4(p,0.,1.),vec2((p.x+1.)*.5,(1.-p.y)*.5));}
   @fragment fn fs(v:V)->@location(0) vec4<f32>{
    let size=vec2<f32>(textureDimensions(image));let px=1./size;
    let c=textureSampleLevel(image,filtering,v.uv,0.);
    let n=textureSampleLevel(image,filtering,v.uv+vec2(px.x,0.),0.)+textureSampleLevel(image,filtering,v.uv-vec2(px.x,0.),0.)+textureSampleLevel(image,filtering,v.uv+vec2(0.,px.y),0.)+textureSampleLevel(image,filtering,v.uv-vec2(0.,px.y),0.);
    let amount=select(.25,.15,size.x>800.);
    return vec4(clamp(c.rgb+(c.rgb*4.-n.rgb)*amount,vec3(0.),vec3(1.)),1.);}` });
        upscaleSampler = device2.createSampler({ minFilter: "linear", magFilter: "linear" });
        upscalePipeline = await device2.createRenderPipelineAsync({ label: "scene-upscale", layout: "auto", vertex: { module, entryPoint: "vs" }, fragment: { module, entryPoint: "fs", targets: [{ format: "rgba8unorm" }] }, primitive: { topology: "triangle-list" } });
      })();
    }
    function allocateTargets() {
      target?.destroy();
      depth?.destroy();
      upscaleGroup = null;
      renderWidth = Math.round(1280 * scale);
      renderHeight = Math.round(720 * scale);
      target = device2.createTexture({ size: [renderWidth, renderHeight], format: "rgba8unorm", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING });
      depth = device2.createTexture({ size: [renderWidth, renderHeight], format: "depth24plus-stencil8", usage: GPUTextureUsage.RENDER_ATTACHMENT });
      stats.scale = scale;
      stats.renderWidth = renderWidth;
      stats.renderHeight = renderHeight;
    }
    if (scale !== 1) await upscale();
    allocateTargets();
    function configure(next = {}) {
      if (next.gpuTextureBytes > 0) cfg.gpuTextureBytes = next.gpuTextureBytes;
      if ("deferSceneUploads" in next) cfg.deferSceneUploads = !!next.deferSceneUploads;
      if ("keepTextures" in next) cfg.keepTextures = !!next.keepTextures;
      if ([0.5, 0.75, 1].includes(next.scale)) cfg.scale = next.scale;
      if (cfg.scale === scale) return;
      if (cfg.scale !== 1 && !upscalePipeline) {
        if (!stats.upscaleError) upscale().catch((e) => {
          stats.upscaleError = String(e?.message || e);
        });
        return;
      }
      scale = cfg.scale;
      allocateTargets();
      stats.scaleChanges = (stats.scaleChanges || 0) + 1;
    }
    const scaledScissor = (s) => {
      const x = Math.floor(s[0] * scale), y = Math.floor(s[1] * scale);
      return [x, y, Math.min(renderWidth, Math.ceil((s[0] + s[2]) * scale)) - x, Math.min(renderHeight, Math.ceil((s[1] + s[3]) * scale)) - y];
    };
    const pipelineKey = (m) => JSON.stringify([m.vs, m.ps, m.blend, m.raster & 7, m.depth, m.stencil >>> 8, m.writeMask]);
    function pipeline(m, preload = false) {
      useShader(m.vs);
      useShader(m.ps);
      const key = pipelineKey(m);
      if (pipelines.has(key)) return pipelines.get(key);
      const promise = (async () => {
        const b = m.blend, d = m.depth, st = m.stencil, blend = { color: { srcFactor: factors[b & 31], dstFactor: factors[b >>> 8 & 31], operation: ops[b >>> 5 & 7] }, alpha: { srcFactor: factors[b >>> 16 & 31], dstFactor: factors[b >>> 24 & 31], operation: ops[b >>> 21 & 7] } };
        if (Object.values(blend.color).includes(void 0) || Object.values(blend.alpha).includes(void 0)) throw Error("Blend unsupported");
        for (const part of [blend.color, blend.alpha]) if (part.operation === "min" || part.operation === "max") part.srcFactor = part.dstFactor = "one";
        const front = d & 1 ? { compare: compares[d >>> 8 & 7], failOp: stencilOps[d >>> 11 & 7], passOp: stencilOps[d >>> 14 & 7], depthFailOp: stencilOps[d >>> 17 & 7] } : { compare: "always" };
        const p = await device2.createRenderPipelineAsync({ label: m.vs + "/" + m.ps, layout: "auto", vertex: { module: modules[m.vs], entryPoint: "main" }, fragment: { module: modules[m.ps], entryPoint: "main", targets: [{ format: "rgba8unorm", blend, writeMask: m.writeMask }] }, primitive: { topology: "triangle-list", frontFace: m.raster & 4 ? "cw" : "ccw", cullMode: (m.raster & 3) === 2 ? "back" : (m.raster & 3) === 1 ? "front" : "none" }, depthStencil: { format: "depth24plus-stencil8", depthWriteEnabled: !!(d & 4), depthCompare: d & 2 ? compares[d >>> 4 & 7] : "always", stencilFront: front, stencilBack: front, stencilReadMask: st >>> 8 & 255, stencilWriteMask: st >>> 16 & 255 } });
        p.cacheId = ++stats.pipelineBuilds;
        if (preload) stats.preloadBuilds = (stats.preloadBuilds || 0) + 1;
        try {
          onPipeline?.(m, preload);
        } catch {
        }
        return p;
      })().catch((e) => {
        stats.rejectedPipelines[key] = e.message;
        return null;
      });
      pipelines.set(key, promise);
      return promise;
    }
    function texture(t, defer = false) {
      let gpu = textures.get(t.key);
      if (!gpu && defer && t.scene && !t.video) {
        stats.sceneDeferred = (stats.sceneDeferred || 0) + 1;
        throw Error("Scene upload deferred");
      }
      if (!gpu) {
        const u = prepareTexture(t);
        gpu = device2.createTexture({ size: [u.width, u.height, u.layers || 1], format: u.format, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
        device2.queue.writeTexture({ texture: gpu }, u.data, { bytesPerRow: u.bytesPerRow, rowsPerImage: u.rowsPerImage }, [u.width, u.height, u.layers || 1]);
        gpu.view = gpu.createView({ dimension: u.cube ? "cube" : "2d-array" });
        textures.set(t.key, gpu);
        gpu.cacheId = ++stats.textureUploads;
        gpu.revision = t.revision;
        gpu.byteSize = u.data.byteLength;
        stats.residentTextureBytes = (stats.residentTextureBytes || 0) + gpu.byteSize;
      } else if ((t.video || t.revision !== gpu.revision) && gpu.used !== frame) {
        if (defer && t.scene) {
          stats.sceneDeferred = (stats.sceneDeferred || 0) + 1;
          gpu.used = frame;
          return gpu;
        }
        const u = prepareTexture(t);
        device2.queue.writeTexture({ texture: gpu }, u.data, { bytesPerRow: u.bytesPerRow, rowsPerImage: u.rowsPerImage }, [u.width, u.height, u.layers || 1]);
      }
      gpu.revision = t.revision;
      gpu.used = frame;
      return gpu;
    }
    function prepareArenas(inputs) {
      let changed = false;
      let wanted = 0, reserved = 0;
      for (const [i, input] of inputs.entries()) for (const [name, bytes] of Object.entries(input.assets)) {
        const n = Math.max(256, Math.ceil(bytes.length / 256) * 256);
        wanted += n;
        reserved += slots[i]?.capacities[name] || n;
      }
      if (reserved > wanted * 2) {
        for (const [i, input] of inputs.entries()) if (slots[i]) for (const [name, bytes] of Object.entries(input.assets)) slots[i].capacities[name] = Math.max(256, Math.ceil(bytes.length / 256) * 256);
        changed = true;
        stats.layoutCompactions = (stats.layoutCompactions || 0) + 1;
      }
      if (slots.length > inputs.length) {
        slots.length = inputs.length;
        changed = true;
      }
      for (const [i, input] of inputs.entries()) {
        let slot2 = slots[i];
        if (!slot2) {
          slot2 = slots[i] = { capacities: {}, offsets: {}, buffers: {} };
          changed = true;
        }
        for (const [name, bytes] of Object.entries(input.assets)) if (!slot2.capacities[name] || slot2.capacities[name] < bytes.length) {
          slot2.capacities[name] = Math.max(256, Math.ceil(bytes.length / 256) * 256);
          changed = true;
        }
      }
      if (changed) {
        generation++;
        const extents = {};
        for (const slot2 of slots) for (const [name, size] of Object.entries(slot2.capacities)) {
          slot2.offsets[name] = extents[name] || 0;
          extents[name] = (extents[name] || 0) + size;
        }
        for (const [name, size] of Object.entries(extents)) if (!arenas[name] || arenas[name].size < size || arenas[name].size > 4 * 1024 * 1024 && arenas[name].size > size * 4) {
          arenas[name]?.destroy();
          arenas[name] = device2.createBuffer({ size: Math.max(256, 2 ** Math.ceil(Math.log2(size))), usage: GPUBufferUsage.COPY_DST | (name === "memory.bin" ? GPUBufferUsage.STORAGE : name === "indices.bin" ? GPUBufferUsage.INDEX : GPUBufferUsage.UNIFORM) });
          stats.bufferBuilds++;
        }
        for (const slot2 of slots) slot2.buffers = arenas;
      }
      for (const [name, buffer] of Object.entries(arenas)) if (!packed[name] || packed[name].length !== buffer.size) packed[name] = new Uint8Array(buffer.size);
      for (const [i, input] of inputs.entries()) for (const [name, bytes] of Object.entries(input.assets)) packed[name].set(bytes, slots[i].offsets[name]);
      const ends = {};
      for (const [i, input] of inputs.entries()) for (const [name, bytes] of Object.entries(input.assets)) ends[name] = Math.max(ends[name] || 0, slots[i].offsets[name] + bytes.byteLength);
      for (const [name, end] of Object.entries(ends)) {
        device2.queue.writeBuffer(arenas[name], 0, packed[name].buffer, 0, end);
        stats.uploadBytes = (stats.uploadBytes || 0) + end;
      }
      stats.bufferBytes = Object.values(arenas).reduce((n, b) => n + b.size, 0);
      stats.frameAssetBytes = wanted;
      stats.arenaBytes = Object.fromEntries(Object.entries(arenas).map(([n, b]) => [n, b.size]));
    }
    function updateAssets(inputs, dirty) {
      const ranges = /* @__PURE__ */ new Map();
      for (const [i, list] of dirty) for (const name of list) {
        const bytes = inputs[i].assets[name], o = slots[i].offsets[name];
        packed[name].set(bytes, o);
        let r = ranges.get(name);
        if (!r) ranges.set(name, r = { lo: o, hi: o + bytes.byteLength });
        else {
          r.lo = Math.min(r.lo, o);
          r.hi = Math.max(r.hi, o + bytes.byteLength);
        }
      }
      for (const [name, r] of ranges) {
        device2.queue.writeBuffer(arenas[name], r.lo, packed[name].buffer, r.lo, r.hi - r.lo);
        stats.uploadBytes = (stats.uploadBytes || 0) + r.hi - r.lo;
      }
    }
    function slot(i, input, p) {
      const s = slots[i], defer = cfg.deferSceneUploads && !input.manifest.essential && !input.manifest.video;
      const groupKey = JSON.stringify([generation, p.cacheId, input.textures.map((t) => [t.slot, texture(t.texture, defer).cacheId, t.sampler])]);
      if (s.groupKey === groupKey) return s;
      const used = new Map([...bindings[input.manifest.vs], ...bindings[input.manifest.ps]].map((b) => [b.group + ":" + b.binding, b])), groups = /* @__PURE__ */ new Map();
      for (const b of used.values()) {
        const name = b.group === 0 && b.binding === 0 ? "memory.bin" : b.group === 1 ? ["system.bin", "float-vs.bin", "float-ps.bin", "bool.bin", "fetch.bin"][b.binding] : null;
        let resource;
        if (name) resource = { buffer: s.buffers[name], offset: s.offsets[name], size: s.capacities[name] };
        else {
          const match = /xe_(?:texture|sampler)(\d+)/.exec(b.name), t = input.textures.find((t2) => t2.slot === Number(match?.[1]));
          if (!t) throw Error("Missing texture binding " + b.name);
          if (b.type === "sampler") {
            const q = t.sampler, k = JSON.stringify(q), a = ["repeat", "mirror-repeat", "clamp-to-edge"];
            if (!samplers.has(k)) samplers.set(k, device2.createSampler({ magFilter: q.mag ? "linear" : "nearest", minFilter: q.min ? "linear" : "nearest", mipmapFilter: q.mip ? "linear" : "nearest", addressModeU: a[q.clampX], addressModeV: a[q.clampY], lodMaxClamp: 0 }));
            resource = samplers.get(k);
          } else if (b.type.startsWith("texture_2d_array") || b.type.startsWith("texture_cube")) resource = texture(t.texture, defer).view;
          else throw Error("Unsupported binding " + b.name);
        }
        if (!groups.has(b.group)) groups.set(b.group, []);
        groups.get(b.group).push({ binding: b.binding, resource });
      }
      s.groups = Array.from({ length: Math.max(...groups.keys()) + 1 }, (_, g) => device2.createBindGroup({ layout: p.getBindGroupLayout(g), entries: groups.get(g) || [] }));
      s.groupKey = groupKey;
      return s;
    }
    return { stats, configure, prewarm(inputs) {
      return Promise.all(inputs.map((i) => pipeline(i.manifest)));
    }, has: (m) => pipelines.has(pipelineKey(m)), prebuild(m) {
      try {
        return pipeline(m, true).then((p) => !!p);
      } catch {
        return Promise.resolve(false);
      }
    }, async render(inputs, context2, { dirty = /* @__PURE__ */ new Map(), reuse = false } = {}) {
      frame++;
      const t0 = performance.now();
      let ready, rejected, pipelineMs = 0;
      const cached = reuse && inputs === cacheInputs && cacheReady;
      if (!cached) {
        const ps = await Promise.all(inputs.map((i) => pipeline(i.manifest)));
        pipelineMs = performance.now() - t0;
        ready = [];
        rejected = {};
        prepareArenas(inputs);
        for (let i = 0; i < inputs.length; i++) {
          if (!ps[i]) {
            rejected.pipeline = (rejected.pipeline || 0) + 1;
            continue;
          }
          try {
            ready.push({ input: inputs[i], p: ps[i], s: slot(i, inputs[i], ps[i]) });
          } catch (e) {
            rejected[e.message] = (rejected[e.message] || 0) + 1;
          }
        }
        cacheInputs = inputs;
        cacheReady = ready;
        cacheRejected = rejected;
        stats.snapshotPreparations = (stats.snapshotPreparations || 0) + 1;
      } else {
        ready = cacheReady;
        rejected = cacheRejected;
        updateAssets(inputs, dirty);
        for (const { input } of ready) for (const t of input.textures) {
          const gpu = textures.get(t.texture.key);
          if (gpu) gpu.used = frame;
        }
        stats.cachedReplays = (stats.cachedReplays || 0) + 1;
      }
      const resourcesAt = t0 + pipelineMs;
      const resourceMs = performance.now() - resourcesAt, replayAt = performance.now();
      if (ready.length) {
        const e = device2.createCommandEncoder(), pass = e.beginRenderPass({ colorAttachments: [{ view: target.createView(), clearValue: [0, 0, 0, 1], loadOp: "clear", storeOp: "store" }], depthStencilAttachment: { view: depth.createView(), depthLoadOp: "clear", depthStoreOp: "store", depthClearValue: 1, stencilLoadOp: "clear", stencilStoreOp: "store", stencilClearValue: 0 } });
        for (const { input, p, s } of ready) {
          const m = input.manifest;
          pass.setPipeline(p);
          s.groups.forEach((g, i) => pass.setBindGroup(i, g));
          pass.setStencilReference(m.stencil & 255);
          pass.setScissorRect(...scaledScissor(m.scissor));
          pass.setIndexBuffer(s.buffers["indices.bin"], "uint32", s.offsets["indices.bin"], input.assets["indices.bin"].length);
          pass.drawIndexed(m.indices);
          stats.draws++;
        }
        pass.end();
        if (scale === 1) e.copyTextureToTexture({ texture: target }, { texture: context2.getCurrentTexture() }, [1280, 720]);
        else {
          upscaleGroup ??= device2.createBindGroup({ layout: upscalePipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: target.createView() }, { binding: 1, resource: upscaleSampler }] });
          const blit = e.beginRenderPass({ colorAttachments: [{ view: context2.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 1] }] });
          blit.setPipeline(upscalePipeline);
          blit.setBindGroup(0, upscaleGroup);
          blit.draw(3);
          blit.end();
        }
        try {
          device2.queue.submit([e.finish()]);
        } catch (error) {
          stats.gpuErrors = (stats.gpuErrors || 0) + 1;
          stats.lastGpuError = String(error?.message || error || "GPU submission failed");
          for (const t of textures.values()) t.destroy();
          textures.clear();
          cacheInputs = null;
          cacheReady = null;
          stats.residentTextureBytes = 0;
          stats.frames++;
          return { accepted: 0, rejected: { "GPU submission failed": ready.length }, pipelineMs, resourceMs, replayMs: performance.now() - replayAt, gpuWaitMs: 0, ...stats };
        }
      }
      const replayMs = performance.now() - replayAt, waitAt = performance.now();
      await device2.queue.onSubmittedWorkDone();
      stats.frames++;
      for (const [key, g] of [...textures].sort((a, b) => a[1].used - b[1].used)) if (g.used !== frame && (frame - g.used > 120 && !cfg.keepTextures || (stats.residentTextureBytes || 0) > cfg.gpuTextureBytes)) {
        g.destroy();
        textures.delete(key);
        stats.residentTextureBytes -= g.byteSize;
        stats.textureEvictions = (stats.textureEvictions || 0) + 1;
      }
      stats.textureBudgetBytes = cfg.gpuTextureBytes;
      stats.textureOverBudgetBytes = Math.max(0, (stats.residentTextureBytes || 0) - cfg.gpuTextureBytes);
      return { accepted: ready.length, rejected, pipelineMs, resourceMs, replayMs, gpuWaitMs: performance.now() - waitAt, ...stats };
    } };
  }

  // tools/r5-native60/temporal.mjs
  var BOARD = "80708BD1B82638B0";
  var GEMS = /* @__PURE__ */ new Set(["582ABCF5FF619A55", "19815E13AC0DCC92"]);
  var TAILS = /* @__PURE__ */ new Set(["10CA3B730086027C", "035C1CB9583C0C7E"]);
  var ANIM = /* @__PURE__ */ new Set(["19815E13AC0DCC92", "27643FEB20B8CBBD", "C6F0B6F9BA5A2B12"]);
  var ROAD = /* @__PURE__ */ new Set([BOARD, ...GEMS, ...TAILS, ...ANIM, "87D4CAE67E72C501", "94B97981B512BDA2", "B43CF443883B8351"]);
  var view = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);
  var lookup = (xs, ys, x) => {
    let lo = 0, hi = xs.length - 1;
    if (x <= xs[0]) hi = 1;
    else if (x >= xs[hi]) lo = hi - 1;
    else {
      while (hi - lo > 1) {
        const m = lo + hi >> 1;
        if (xs[m] <= x) lo = m;
        else hi = m;
      }
    }
    return ys[lo] + (ys[hi] - ys[lo]) * (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
  };
  function boardTable(input) {
    const m = input.manifest.motion;
    if (!m || m.stride !== 5) return null;
    const d = view(input.assets["memory.bin"]), rows = /* @__PURE__ */ new Map();
    for (let i = 0; i < m.count; i++) {
      const o = i * 20, x = d.getFloat32(o, false), y2 = d.getFloat32(o + 4, false), v2 = d.getFloat32(o + 16, false);
      if (!Number.isFinite(x) || !Number.isFinite(y2) || !Number.isFinite(v2)) return null;
      let r = rows.get(y2);
      if (!r) rows.set(y2, r = { v: v2, left: x, right: x });
      r.left = Math.min(r.left, x);
      r.right = Math.max(r.right, x);
    }
    const y = [...rows.keys()].sort((a, b) => a - b);
    if (y.length < 4) return null;
    const v = y.map((y2) => rows.get(y2).v), w = y.map((y2) => rows.get(y2).right - rows.get(y2).left);
    if (v.some((n, i) => i && n <= v[i - 1]) || w.some((n) => n <= 0)) return null;
    return { y, v, w };
  }
  function createTemporalFrame(inputs, shaders2, { previous = null, intervalMs = 0, sceneMotion: sceneMotion2 = false } = {}) {
    const dirty = /* @__PURE__ */ new Map(), working = inputs.map((i) => ({ ...i, assets: { ...i.assets } }));
    const board2 = inputs.find((i) => i.manifest.vs === BOARD), table = board2 && boardTable(board2);
    const slots = (id) => new Map(shaders2[id].constants.map((c, i) => [c, i * 16]));
    const maps = /* @__PURE__ */ new Map(), map = (id) => {
      if (!maps.has(id)) maps.set(id, slots(id));
      return maps.get(id);
    };
    const constant = (i, c, component = 0) => {
      const at = map(i.manifest.vs).get(c);
      return at === void 0 ? 0 : view(i.assets["float-vs.bin"]).getFloat32(at + component * 4, true);
    };
    const speed = board2 ? -constant(board2, 4) : 0;
    const prior = /* @__PURE__ */ new Map(), occurrences = /* @__PURE__ */ new Map();
    for (const i of previous || []) {
      const key = i.manifest.identity || i.manifest.vs + "/" + i.manifest.ps, n = occurrences.get(key) || 0;
      occurrences.set(key, n + 1);
      prior.set(key + "/" + n, i);
    }
    occurrences.clear();
    const plans = [];
    for (let index = 0; index < inputs.length; index++) {
      const i = inputs[index], vs = i.manifest.vs, key = i.manifest.identity || vs + "/" + i.manifest.ps, n = occurrences.get(key) || 0;
      occurrences.set(key, n + 1);
      const p = prior.get(key + "/" + n), names = [];
      if ((GEMS.has(vs) || TAILS.has(vs)) && i.manifest.motion && table) names.push("memory.bin");
      if (vs === BOARD || ANIM.has(vs)) names.push("float-vs.bin");
      if (TAILS.has(vs)) names.push("float-ps.bin");
      const scene = sceneMotion2 && !ROAD.has(vs) && !i.manifest.video && p && intervalMs >= 8 && intervalMs <= 250 && p.assets["float-vs.bin"].length === i.assets["float-vs.bin"].length;
      if (scene) names.push("float-vs.bin");
      if (!names.length) continue;
      const uniq = [...new Set(names)];
      for (const name of uniq) working[index].assets[name] = i.assets[name].slice();
      plans.push({ index, input: i, previous: p, scene, names: uniq });
    }
    let lastDt = 0;
    const move = (y, dv) => {
      const y2 = lookup(table.v, table.y, lookup(table.y, table.v, y) + dv);
      return [y2, lookup(table.y, table.w, y2) / lookup(table.y, table.w, y)];
    };
    function animate(dt) {
      if (!Number.isFinite(dt) || dt < 0 || dt > 0.2) throw Error("Temporal delta outside 0..200ms");
      dirty.clear();
      if (dt === 0 && lastDt === 0) return dirty;
      for (const plan of plans) {
        const { index, input: i, names } = plan, w = working[index], vs = i.manifest.vs;
        for (const name of names) w.assets[name].set(i.assets[name]);
        dirty.set(index, names);
        if (!dt) continue;
        if (vs === BOARD || ANIM.has(vs)) {
          const o = map(vs).get(155), d = view(w.assets["float-vs.bin"]);
          if (o !== void 0) {
            if (vs === BOARD) d.setFloat32(o + 12, d.getFloat32(o + 12, true) + dt, true);
            if (ANIM.has(vs)) d.setFloat32(o, d.getFloat32(o, true) + dt, true);
          }
        }
        const motion = i.manifest.motion;
        if (GEMS.has(vs) && motion && table) {
          const src = view(i.assets["memory.bin"]), dst = view(w.assets["memory.bin"]), step = motion.stride * 4;
          let bottom = -Infinity;
          for (let k = 0; k < motion.count; k++) bottom = Math.max(bottom, src.getFloat32(k * step + 4, false));
          const [yb, scale] = move(bottom, speed * dt);
          for (let k = 0; k < motion.count; k++) {
            const o = k * step, x = src.getFloat32(o, false), y = src.getFloat32(o + 4, false);
            dst.setFloat32(o, 640 + (x - 640) * scale, false);
            dst.setFloat32(o + 4, yb - (bottom - y) * scale, false);
          }
        }
        if (TAILS.has(vs) && motion && table) {
          const src = view(i.assets["memory.bin"]), dst = view(w.assets["memory.bin"]), step = motion.stride * 4;
          const cc = (r, k) => constant(i, r, k);
          const k254 = cc(254, 0), k254z = cc(254, 2), k255x = cc(255, 0), k255y = cc(255, 1), glow = vs === "035C1CB9583C0C7E";
          for (let k = 0; k < motion.count; k++) {
            const o = k * step, px = src.getFloat32(o, false), py = src.getFloat32(o + 4, false), kk = src.getFloat32(o + 20, false) * k254, idx = Math.trunc(kk), sub = Math.trunc(k254z * (kk - idx));
            const sel = (j) => sub === 0 ? cc(128 + j, 0) : sub + k255y === 0 ? cc(128 + j, 2) : sub + k255x === 0 ? cc(128 + j, 3) : cc(128 + j, 1);
            const row = 4 + idx, wave = (sel(3) * cc(row, 3) + sel(2) * cc(row, 2) + sel(0) * cc(row, 0) + sel(1) * cc(row, 1)) * (glow ? cc(1, 2) : 1);
            const oldY = py + cc(0, 1), [newY, scale] = move(oldY, speed * dt), newPy = newY - cc(0, 1);
            const oldX = cc(0, 0) + wave * px + cc(0, 2) * py * cc(0, 3), newX = 640 + (oldX - 640) * scale;
            if (Number.isFinite(wave) && Math.abs(wave) > 1e-8) dst.setFloat32(o, (newX - cc(0, 0) - cc(0, 2) * newPy * cc(0, 3)) / wave, false);
            dst.setFloat32(o + 4, newPy, false);
          }
          const pc = shaders2[i.manifest.ps].constants.indexOf(1) * 16;
          if (pc >= 0) {
            const d = view(w.assets["float-ps.bin"]), top = d.getFloat32(pc + 8, true), bot = d.getFloat32(pc + 12, true);
            if (top > 305.5) d.setFloat32(pc + 8, move(top, speed * dt)[0], true);
            if (bot < 600) d.setFloat32(pc + 12, move(bot, speed * dt)[0], true);
          }
        }
        if (plan.scene) {
          const a = view(plan.previous.assets["float-vs.bin"]), b = view(i.assets["float-vs.bin"]), d = view(w.assets["float-vs.bin"]), factor = Math.min(1, dt * 1e3 / intervalMs);
          for (const [row, o] of map(vs)) {
            if (row >= 154) continue;
            for (let k = 0; k < 4; k++) {
              const p = o + k * 4, x = a.getFloat32(p, true), y = b.getFloat32(p, true), delta = y - x;
              if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(y) > 1e5 || Math.abs(delta) > Math.max(1, Math.abs(y) * 0.25)) continue;
              if (Number.isInteger(x) && Number.isInteger(y) && delta) continue;
              d.setFloat32(p, y + delta * factor, true);
            }
          }
        }
      }
      lastDt = dt;
      return dirty;
    }
    return { inputs: working, animate, table, speed, timeMs: board2 ? constant(board2, 155, 3) * 1e3 : null, planCount: plans.length, scenePlanCount: plans.filter((p) => p.scene).length };
  }

  // tools/r5-native60/cadence.mjs
  function nextDeadline(deadline, completed, period = 1e3 / 60) {
    const next = deadline + period;
    return completed - next > period ? completed : next;
  }

  // tools/iphone-probe/bc-rgba.mjs
  var formats = { "bc1-rgba-unorm": 8, "bc2-rgba-unorm": 16, "bc3-rgba-unorm": 16, "bc5-rg-unorm": 16 };
  function rgb565(v, p, at) {
    const r = v >>> 11, g = v >>> 5 & 63, b = v & 31;
    p[at] = r << 3 | r >>> 2;
    p[at + 1] = g << 2 | g >>> 4;
    p[at + 2] = b << 3 | b >>> 2;
    p[at + 3] = 255;
  }
  function alphaPalette(src, off, p) {
    p[0] = src[off];
    p[1] = src[off + 1];
    if (p[0] > p[1]) {
      for (let i = 1; i <= 6; i++) p[i + 1] = Math.round(((7 - i) * p[0] + i * p[1]) / 7);
    } else {
      for (let i = 1; i <= 4; i++) p[i + 1] = Math.round(((5 - i) * p[0] + i * p[1]) / 5);
      p[6] = 0;
      p[7] = 255;
    }
  }
  function alphaIndex(src, off, i) {
    const bit = i * 3, k = off + 2 + (bit >>> 3);
    return (src[k] | src[k + 1] << 8) >>> (bit & 7) & 7;
  }
  function decodeBCTexture(t) {
    const srgb = t.format.endsWith("-srgb"), format = srgb ? t.format.replace(/-srgb$/, "") : t.format, blockBytes = formats[format];
    if (!blockBytes) {
      if (t.format.startsWith("bc")) throw Error("Formato BC no soportado: " + t.format);
      return t;
    }
    const w = t.width, h = t.height, src = t.data;
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 8192 || h > 8192 || !(src instanceof Uint8Array)) throw Error("Textura BC inv\xE1lida.");
    const nx = Math.ceil(w / 4), ny = Math.ceil(h / 4), stride = t.bytesPerRow;
    if (!Number.isSafeInteger(stride) || stride < nx * blockBytes || src.length < (ny - 1) * stride + nx * blockBytes) throw Error("Datos BC incompletos.");
    if (w * h * 4 > 64 * 1048576) throw Error("Textura RGBA supera el l\xEDmite de conversi\xF3n individual.");
    const out = new Uint8Array(w * h * 4), colors = new Uint8Array(16), a = new Uint8Array(8), g = new Uint8Array(8);
    for (let by = 0; by < ny; by++) for (let bx = 0; bx < nx; bx++) {
      const off = by * stride + bx * blockBytes;
      let indices = 0;
      if (format === "bc5-rg-unorm") {
        alphaPalette(src, off, a);
        alphaPalette(src, off + 8, g);
      } else {
        const co = off + (format === "bc1-rgba-unorm" ? 0 : 8), c0 = src[co] | src[co + 1] << 8, c1 = src[co + 2] | src[co + 3] << 8;
        rgb565(c0, colors, 0);
        rgb565(c1, colors, 4);
        if (format === "bc1-rgba-unorm" && c0 <= c1) {
          for (let c = 0; c < 3; c++) colors[8 + c] = Math.round((colors[c] + colors[4 + c]) / 2);
          colors[11] = 255;
          colors.fill(0, 12, 16);
        } else {
          for (let c = 0; c < 3; c++) {
            colors[8 + c] = Math.round((2 * colors[c] + colors[4 + c]) / 3);
            colors[12 + c] = Math.round((colors[c] + 2 * colors[4 + c]) / 3);
          }
          colors[11] = colors[15] = 255;
        }
        indices = (src[co + 4] | src[co + 5] << 8 | src[co + 6] << 16 | src[co + 7] << 24) >>> 0;
        if (format === "bc3-rgba-unorm") alphaPalette(src, off, a);
      }
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const px = bx * 4 + x, py = by * 4 + y;
        if (px >= w || py >= h) continue;
        const i = y * 4 + x, o = (py * w + px) * 4;
        if (format === "bc5-rg-unorm") {
          out[o] = a[alphaIndex(src, off, i)];
          out[o + 1] = g[alphaIndex(src, off + 8, i)];
          out[o + 2] = 0;
          out[o + 3] = 255;
        } else {
          const c = (indices >>> i * 2 & 3) * 4;
          out[o] = colors[c];
          out[o + 1] = colors[c + 1];
          out[o + 2] = colors[c + 2];
          out[o + 3] = format === "bc2-rgba-unorm" ? (src[off + (i >>> 1)] >> (i & 1) * 4 & 15) * 17 : format === "bc3-rgba-unorm" ? a[alphaIndex(src, off, i)] : colors[c + 3];
        }
      }
    }
    return { ...t, format: srgb ? "rgba8unorm-srgb" : "rgba8unorm", data: out, bytesPerRow: w * 4, rowsPerImage: h };
  }

  // tools/r5-scene-mobile/src/texture-policy.mjs
  function sceneTexture(t, bc) {
    const options = globalThis.__r5Options || {};
    let u = t;
    const factor = options.textureScale === 0.5 ? 2 : 1;
    const reduce = !!t.scene && factor > 1 && !t.video && Math.max(t.width, t.height) >= 256 && (!bc || !t.format.startsWith("bc"));
    if (!bc || reduce) {
      if ((t.layers || 1) > 1 && t.format.startsWith("bc")) {
        const layers2 = t.layers, n = t.rowsPerImage * t.bytesPerRow, decoded = [];
        for (let i = 0; i < layers2; i++) decoded.push(decodeBCTexture({ ...t, layers: 1, data: t.data.subarray(i * n, (i + 1) * n) }));
        const data2 = new Uint8Array(decoded[0].data.length * layers2);
        decoded.forEach((d, i) => data2.set(d.data, i * d.data.length));
        u = { ...decoded[0], data: data2, layers: layers2, cube: t.cube };
      } else u = decodeBCTexture(t);
    }
    if (!reduce) return u;
    if (!["rgba8unorm", "rgba8unorm-srgb", "r8unorm"].includes(u.format)) throw Error("Scene texture reduction format " + u.format);
    const channels = u.format === "r8unorm" ? 1 : 4, width = Math.max(1, Math.floor(u.width / 2)), height = Math.max(1, Math.floor(u.height / 2)), layers = u.layers || 1, data = new Uint8Array(width * height * channels * layers);
    for (let layer = 0; layer < layers; layer++) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < channels; c++) {
      let sum = 0, n = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const sx = x * 2 + dx, sy = y * 2 + dy;
        if (sx < u.width && sy < u.height) {
          sum += u.data[layer * u.rowsPerImage * u.bytesPerRow + sy * u.bytesPerRow + sx * channels + c];
          n++;
        }
      }
      data[((layer * height + y) * width + x) * channels + c] = Math.round(sum / n);
    }
    return { ...u, width, height, bytesPerRow: width * channels, rowsPerImage: height, data };
  }

  // tools/r5-native60/control.mjs
  var C = Object.freeze({
    LATCH: 0,
    // GPU→página: 1 = hay un bitmap en camino (un cuadro en vuelo)
    PRESENTED: 1,
    // página: cuadros presentados
    LEVEL: 2,
    // página→todos: estado del gobernador 0 normal, 1 protegido, 2 mínimo
    CPU: 3,
    // página→consumidor/GPU: nivel de recorte de CPU (captura, conversiones)
    GPU: 4,
    // página→GPU: nivel de recorte de GPU (escala 1280×720 / 960×540 / 640×360)
    MEM: 5,
    // página→GPU: nivel de recorte de memoria (presupuestos de texturas)
    POLICY_SEQ: 6,
    // página: se incrementa en cada cambio de política
    ACTIVE: 7,
    // página: 1 = el gobernador actúa; 0 = sólo observa (las perillas quedan en 0)
    SWAPS: 8,
    // consumidor: cuadros del juego (swaps) recibidos = ritmo de la simulación visible
    SNAPSHOTS: 9,
    // consumidor: snapshots preparados y enviados al worker GPU
    GOV_SKIPPED: 10,
    // consumidor: swaps salteados por el gobernador ANTES de leer memoria del juego
    PREP_US: 11,
    // consumidor: costo del último snapshot (lectura+preparación+copia), µs
    PREP_MAX_US: 12,
    // consumidor: máximo desde la última lectura de la página (la página lo pone en 0)
    BUSY_DROPS: 13,
    // consumidor: swaps descartados porque el worker GPU seguía ocupado con el anterior
    GPU_US: 14,
    // GPU: espera de la GPU por cuadro (onSubmittedWorkDone), promedio móvil, µs
    GPU_MAX_US: 15,
    // GPU: máximo desde la última lectura de la página
    TEX_GPU_KIB: 16,
    // GPU: texturas residentes en la GPU, KiB
    TEX_CPU_KIB: 17,
    // GPU: copias de texturas en el worker, KiB
    SCALE_PCT: 18,
    // GPU: escala de render aplicada ×100
    RENDERED: 19,
    // GPU: cuadros dibujados
    GPU_LOST: 20,
    // GPU: 1 = dispositivo perdido o error fatal
    SCENE_DEFERRED: 21,
    // GPU: dibujos de escena omitidos por no convertir texturas nuevas bajo presión
    ROAD_ONLY: 22,
    // consumidor: 1 = el último snapshot fue sólo pista/notas/colas/HUD
    BUF_KIB: 23,
    // GPU: buffers (arenas) en la GPU, KiB
    VERSION: 24,
    // consumidor: CONTROL_VERSION cuando el SAB tiene este formato
    WORKER_US: 25,
    // GPU: costo total del cuadro en el worker (CPU del worker + espera GPU), promedio móvil, µs
    STAGE: 26,
    // página→GPU: 0 sin dato, 1 cargas/menús, 2 canción en juego (señales gh3stage). Claude 2026-10-13, precarga
    PRELOADED: 27,
    // GPU: pipelines precompilados fuera del juego (recordados de sesiones anteriores)
    PRELOAD_PENDING: 28,
    // GPU: pipelines recordados que faltan precompilar
    SONG_BUILDS: 29
    // GPU: pipelines que hubo que compilar con la canción en juego (lo que la precarga quiere llevar a 0)
  });
  function ewmaStore(i32, index, valueUs, alpha = 0.2) {
    const prev = Atomics.load(i32, index), v = Math.max(0, Math.min(2e9, Math.round(valueUs)));
    Atomics.store(i32, index, prev ? Math.round(prev + (v - prev) * alpha) : v);
  }
  function maxStore(i32, index, valueUs) {
    const v = Math.max(0, Math.min(2e9, Math.round(valueUs)));
    if (v > Atomics.load(i32, index)) Atomics.store(i32, index, v);
  }

  // tools/r5-native60/governor-policy.mjs
  var POLICY = Object.freeze({
    cpu: [
      // Normal: captura cada swap que encuentre libre al worker GPU (como antes).
      { minCaptureMs: 0, roadOnly: false, deferSceneUploads: false },
      // Protegido: como máximo un snapshot cada 25 ms (≈ 1 de cada 2 swaps a 60 Hz) y sin convertir/subir texturas
      // nuevas de escena (no esenciales). La decisión se toma ANTES de leer memoria del juego.
      { minCaptureMs: 25, roadOnly: false, deferSceneUploads: true },
      // Mínimo: sólo pista/notas/colas/HUD (el mismo filtro de sombreadores que la calidad «colas»).
      { minCaptureMs: 25, roadOnly: true, deferSceneUploads: true }
    ],
    gpu: [
      { scale: 1 },
      // 1280×720
      { scale: 0.75 },
      // 960×540 (56,25 % de píxeles)
      { scale: 0.5 }
      // 640×360 (25 %)
    ],
    mem: [
      // Presupuestos de texturas INACTIVAS (las activas del cuadro nunca se expulsan): GPU residente y copias en el worker.
      { gpuTextureBytes: 64 << 20, cpuTextureBytes: 96 << 20, deferSceneUploads: false },
      { gpuTextureBytes: 40 << 20, cpuTextureBytes: 48 << 20, deferSceneUploads: false },
      { gpuTextureBytes: 24 << 20, cpuTextureBytes: 24 << 20, deferSceneUploads: true }
    ]
  });
  function knob(i32, index) {
    if (!i32 || i32.length <= C.VERSION || Atomics.load(i32, C.VERSION) < 1) return 0;
    const v = Atomics.load(i32, index);
    return v >= 2 ? 2 : v === 1 ? 1 : 0;
  }
  function rendererConfig(cpuLevel, gpuLevel, memLevel) {
    const cpu = POLICY.cpu[cpuLevel] || POLICY.cpu[0], gpu = POLICY.gpu[gpuLevel] || POLICY.gpu[0], mem = POLICY.mem[memLevel] || POLICY.mem[0];
    return { scale: gpu.scale, gpuTextureBytes: mem.gpuTextureBytes, cpuTextureBytes: mem.cpuTextureBytes, deferSceneUploads: cpu.deferSceneUploads || mem.deferSceneUploads };
  }

  // tools/r5-native60/preload.mjs
  var pipelineDesc = (m) => ({ vs: m.vs, ps: m.ps, blend: m.blend, raster: m.raster, depth: m.depth, stencil: m.stencil, writeMask: m.writeMask });
  var descKey = (d) => JSON.stringify([d.vs, d.ps, d.blend, d.raster & 7, d.depth, d.stencil >>> 8, d.writeMask]);
  function idbStore(name = "gh3-native60", key = "pipelines") {
    const open = () => new Promise((resolve, reject) => {
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const run = (mode, fn) => open().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction("kv", mode), r = fn(tx.objectStore("kv"));
      tx.oncomplete = () => {
        db.close();
        resolve(r.result);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    }));
    return {
      load: () => typeof indexedDB === "undefined" ? Promise.resolve([]) : run("readonly", (s) => s.get(key)).then((v) => Array.isArray(v) ? v : [], () => []),
      save: (list) => typeof indexedDB === "undefined" ? Promise.resolve() : run("readwrite", (s) => s.put(list, key)).catch(() => {
      })
    };
  }
  function createPreloader({ renderer: renderer2, store, board: board2 = null, maxInFlight = 2, maxEntries = 512, saveDelayMs = 2e3, now = () => Date.now() }) {
    const entries = /* @__PURE__ */ new Map();
    const seen = /* @__PURE__ */ new Set();
    let queue = [], inFlight = 0, loaded = false, dirty = false, saveAt = 0, lastStage = 0;
    const stats = { recorded: 0, preloaded: 0, failed: 0, songBuilds: 0, skippedBusy: 0 };
    const stage = () => board2 ? Atomics.load(board2, C.STAGE) : 0, calm = () => !board2 || Atomics.load(board2, C.LEVEL) === 0;
    const publish = () => {
      if (!board2) return;
      Atomics.store(board2, C.PRELOADED, stats.preloaded);
      Atomics.store(board2, C.PRELOAD_PENDING, queue.length + inFlight);
      Atomics.store(board2, C.SONG_BUILDS, stats.songBuilds);
    };
    const order = () => [...entries.values()].sort((a, b) => b.s - a.s || b.n - a.n || b.t - a.t);
    const ready = store.load().then((list) => {
      for (const e of list) if (e?.d?.vs && e?.d?.ps) {
        const k = descKey(e.d);
        if (!entries.has(k)) entries.set(k, { d: pipelineDesc(e.d), n: e.n | 0, s: e.s ? 1 : 0, t: e.t || 0 });
      }
      queue = order().map((e) => e.d).filter((d) => !renderer2.has(d));
      loaded = true;
      publish();
    }, () => {
      loaded = true;
    });
    function record(m, preload = false) {
      const d = pipelineDesc(m), k = descKey(d), inSong = stage() === 2;
      if (preload) stats.preloaded++;
      else if (inSong) stats.songBuilds++;
      let e = entries.get(k);
      if (!e) entries.set(k, e = { d, n: 0, s: 0, t: 0 });
      if (!preload) {
        if (!seen.has(k)) {
          seen.add(k);
          e.n++;
        }
        if (inSong) e.s = 1;
        e.t = now();
        dirty = true;
        stats.recorded++;
      }
      publish();
    }
    function pump() {
      const s = stage();
      if (lastStage === 2 && s !== 2) saveAt = 0;
      lastStage = s;
      if (!loaded || s !== 1) return;
      if (dirty && now() >= saveAt) {
        dirty = false;
        saveAt = now() + saveDelayMs;
        let list = order();
        if (list.length > maxEntries) {
          list = list.slice(0, maxEntries);
          entries.clear();
          for (const e of list) entries.set(descKey(e.d), e);
        }
        store.save(list);
      }
      if (!calm()) {
        if (queue.length) stats.skippedBusy++;
        return;
      }
      while (inFlight < maxInFlight && queue.length) {
        const d = queue.shift();
        if (renderer2.has(d)) continue;
        inFlight++;
        renderer2.prebuild(d).then((ok) => {
          if (!ok) {
            stats.failed++;
            entries.delete(descKey(d));
            dirty = true;
          }
        }, () => {
          stats.failed++;
        }).finally(() => {
          inFlight--;
          publish();
        });
      }
      publish();
    }
    return { record, pump, ready, stats, get pending() {
      return queue.length + inFlight;
    }, get size() {
      return entries.size;
    } };
  }

  // tools/r5-native60/gpu-worker.mjs
  var preloader = null;
  var renderer;
  var canvas;
  var context;
  var device;
  var port;
  var latch;
  var transport;
  var shaders;
  var sceneMotion = false;
  var queued = null;
  var current = null;
  var temporal = null;
  var known = /* @__PURE__ */ new Map();
  var running = false;
  var timer;
  var nextAt = 0;
  var lastReport = 0;
  var sourceSerial = 0;
  var state = { rendered: 0, snapshots: 0, stale: 0, coalesced: 0, textureCPUBytes: 0, targetHz: 60, maxGPUFramesInFlight: 1, directPort: true, originalShaders: true };
  var board = () => latch && latch.length > C.WORKER_US ? latch : null;
  var policyKey = -1;
  var policy = rendererConfig(0, 0, 0);
  function applyPolicy() {
    const b = board(), cpu = knob(b, C.CPU), gpu = knob(b, C.GPU), mem = knob(b, C.MEM), key = cpu | gpu << 2 | mem << 4;
    if (key !== policyKey) {
      policyKey = key;
      policy = rendererConfig(cpu, gpu, mem);
      state.policy = { cpu, gpu, mem };
    }
    if (key !== state.appliedKey || renderer.stats.scale !== policy.scale) {
      renderer.configure(policy);
      state.appliedKey = key;
    }
  }
  function stop(error) {
    clearTimeout(timer);
    if (transport) Atomics.store(transport, 0, 0);
    const b = board();
    if (b) Atomics.store(b, C.GPU_LOST, 1);
    postMessage({ type: "error", error: error?.stack || String(error) });
  }
  onmessage = async ({ data: m }) => {
    try {
      if (m.type === "init") {
        shaders = m.shaders;
        sceneMotion = m.sceneMotion;
        port = m.port;
        latch = new Int32Array(m.presentation);
        transport = new Int32Array(m.transport);
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw Error("No WebGPU adapter");
        const bc = adapter.features.has("texture-compression-bc");
        state.compression = ["texture-compression-bc", "texture-compression-etc2", "texture-compression-astc"].filter((f) => adapter.features.has(f));
        device = await adapter.requestDevice({ requiredFeatures: bc ? ["texture-compression-bc"] : [] });
        device.addEventListener("uncapturederror", (e) => stop(e.error));
        device.lost.then((e) => stop(Error("GPU lost: " + e.message)));
        renderer = await createLiveSongRenderer(device, shaders, { prepareTexture: (t) => sceneTexture(t, bc), onPipeline: (m2, pre) => preloader?.record(m2, pre) });
        preloader = createPreloader({ renderer, store: idbStore(), board: latch.length > C.SONG_BUILDS ? latch : null });
        setInterval(() => preloader.pump(), 100);
        canvas = new OffscreenCanvas(1280, 720);
        context = canvas.getContext("webgpu");
        context.configure({ device, format: "rgba8unorm", usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT, alphaMode: "opaque" });
        port.onmessage = () => {
        };
        port.start();
        postMessage({ type: "ready" });
        return;
      }
      if (m.type !== "snapshot") return;
      if (!m.inputs.length) {
        state.emptySnapshots = (state.emptySnapshots || 0) + 1;
        Atomics.store(transport, 0, 0);
        return;
      }
      for (const input of m.inputs) for (const t of input.textures) {
        const s = t.texture;
        if (s.data) known.set(s.key, { texture: s, last: sourceSerial });
        else {
          const k = known.get(s.key);
          if (!k || k.texture.revision !== s.revision) throw Error("Missing texture revision " + s.key);
          t.texture = k.texture;
          k.last = sourceSerial;
        }
      }
      if (queued) state.coalesced++;
      queued = m;
      sourceSerial++;
      m.serial = sourceSerial;
      const serial = sourceSerial;
      renderer.prewarm(m.inputs).then(() => {
        if (queued?.serial === serial) queued.pipelineReady = true;
      }).catch(stop);
      Atomics.store(transport, 0, 0);
      if (!running && !timer) schedule();
    } catch (e) {
      stop(e);
    }
  };
  function schedule() {
    const now = performance.now();
    if (nextAt < now - 50) nextAt = now;
    timer = setTimeout(tick, Math.max(0, nextAt - now));
  }
  async function tick() {
    timer = null;
    if (running) return;
    running = true;
    try {
      let fresh = false;
      if (queued?.pipelineReady) {
        const previous = current;
        current = queued;
        queued = null;
        fresh = true;
        state.snapshots++;
        const interval = previous ? current.at - previous.at : 0;
        const prepareAt = performance.now();
        temporal = createTemporalFrame(current.inputs, shaders, { previous: previous?.inputs, intervalMs: interval, sceneMotion });
        state.lastMotionPrepareMs = performance.now() - prepareAt;
        const active = new Set(current.inputs.flatMap((i) => i.textures.map((t) => t.texture.key))), retired = [];
        let bytes = 0;
        for (const k of known.values()) bytes += k.texture.data?.byteLength || 0;
        for (const [key, k] of [...known].sort((a, b) => a[1].last - b[1].last)) if (!active.has(key) && (sourceSerial - k.last > 120 || bytes > policy.cpuTextureBytes)) {
          bytes -= k.texture.data?.byteLength || 0;
          known.delete(key);
          retired.push(key);
        }
        state.textureCPUBytes = bytes;
        if (retired.length) postMessage({ type: "retired", keys: retired });
      }
      state.pipelinePending = !!queued && !queued.pipelineReady;
      if (current) {
        const now = performance.timeOrigin + performance.now(), age = now - current.at;
        if (age < 500) {
          const dt = fresh ? 0 : Math.max(0, Math.min(100, age)) / 1e3;
          const animateAt = performance.now(), dirty = temporal.animate(dt);
          state.lastAnimateMs = performance.now() - animateAt;
          applyPolicy();
          const frameAt = performance.now(), gpu = await renderer.render(temporal.inputs, context, { reuse: !fresh, dirty });
          const b = board();
          if (b) {
            ewmaStore(b, C.GPU_US, gpu.gpuWaitMs * 1e3);
            maxStore(b, C.GPU_MAX_US, gpu.gpuWaitMs * 1e3);
            ewmaStore(b, C.WORKER_US, (performance.now() - frameAt) * 1e3);
            Atomics.add(b, C.RENDERED, 1);
            Atomics.store(b, C.TEX_GPU_KIB, (gpu.residentTextureBytes || 0) >> 10);
            Atomics.store(b, C.TEX_CPU_KIB, state.textureCPUBytes >> 10);
            Atomics.store(b, C.BUF_KIB, (gpu.bufferBytes || 0) >> 10);
            Atomics.store(b, C.SCALE_PCT, Math.round((gpu.scale || 1) * 100));
            Atomics.store(b, C.SCENE_DEFERRED, gpu.sceneDeferred || 0);
          }
          state.rendered++;
          state.deltaMs = dt * 1e3;
          state.sourceAgeMs = age;
          state.motionPlans = temporal.planCount;
          state.scenePlans = temporal.scenePlanCount;
          if (gpu.accepted && Atomics.compareExchange(latch, 0, 0, 1) === 0) {
            const bitmap = canvas.transferToImageBitmap();
            port.postMessage({ type: "frame", bitmap, info: { seq: current.info.seq, accepted: gpu.accepted }, latch: latch.buffer }, [bitmap]);
          }
          if (performance.now() - lastReport > 1e3) {
            lastReport = performance.now();
            postMessage({ type: "stats", gpu, temporal: { ...state }, info: current.info });
          }
        } else state.stale++;
      }
    } catch (e) {
      stop(e);
      running = false;
      return;
    }
    running = false;
    nextAt = nextDeadline(nextAt, performance.now());
    if (current || queued) schedule();
  }
})();
