(() => {
  // Explicit API allocation accounting, NOT physical driver memory or wasm RAM.
  globalThis.__sceneMemory = {textureBytes:0,bufferBytes:0,peakBytes:0,textures:0,buffers:0,features:[]};
  if(typeof GPUDevice!=='undefined'){
   const stats=globalThis.__sceneMemory, sizes={r8unorm:[1,1],rgba8unorm:[1,4],'depth24plus-stencil8':[1,4],depth32float:[1,4],'bc1-rgba-unorm':[4,8],'bc2-rgba-unorm':[4,16],'bc3-rgba-unorm':[4,16],'bc5-rg-unorm':[4,16]};
   for(const kind of ['Texture','Buffer']){
    const name='create'+kind,original=GPUDevice.prototype[name];
    GPUDevice.prototype[name]=function(desc){
     const obj=original.call(this,desc);stats.features=[...this.features];let bytes=desc.size;
     if(kind==='Texture'){
      const a=Array.isArray(desc.size)?desc.size:[desc.size.width,desc.size.height||1,desc.size.depthOrArrayLayers||1],fmt=sizes[desc.format];bytes=0;
      if(fmt)for(let mip=0;mip<(desc.mipLevelCount||1);mip++)bytes+=Math.ceil(Math.max(1,a[0]>>mip)/fmt[0])*Math.ceil(Math.max(1,a[1]>>mip)/fmt[0])*(a[2]||1)*fmt[1]*(desc.sampleCount||1);
     }
     const key=kind==='Texture'?'textureBytes':'bufferBytes',count=kind==='Texture'?'textures':'buffers';stats[key]+=bytes;stats[count]++;stats.peakBytes=Math.max(stats.peakBytes,stats.textureBytes+stats.bufferBytes);
     const destroy=obj.destroy.bind(obj);let alive=true;obj.destroy=()=>{if(alive){stats[key]-=bytes;stats[count]--;alive=false;}return destroy();};return obj;
    };
   }
  }

  // tools/r5-live-song/arena-renderer.mjs
  var factors = { 0: "zero", 1: "one", 4: "src", 5: "one-minus-src", 6: "src-alpha", 7: "one-minus-src-alpha", 8: "dst", 9: "one-minus-dst", 10: "dst-alpha", 11: "one-minus-dst-alpha", 12: "constant", 13: "one-minus-constant", 14: "src-alpha-saturated" };
  var ops = ["add", "subtract", "min", "max", "reverse-subtract"];
  var compares = ["never", "less", "equal", "less-equal", "greater", "not-equal", "greater-equal", "always"];
  var stencilOps = ["keep", "zero", "replace", "increment-clamp", "decrement-clamp", "invert", "increment-wrap", "decrement-wrap"];
  async function createLiveSongRenderer(device, shaders, { prepareTexture = (t) => t } = {}) {
  const modules = {}, bindings = {}, pipelines = /* @__PURE__ */ new Map(), slots = [], arenas = {}, textures = /* @__PURE__ */ new Map(), samplers = /* @__PURE__ */ new Map();
  let frame = 0, generation = 0;
  const stats = { frames: 0, draws: 0, pipelineBuilds: 0, bufferBuilds: 0, textureUploads: 0, readbacks: 0, rejectedPipelines: {} };
  function useShader(id) {
    if (modules[id]) return;
    const s = shaders[id];
    if (!s) throw Error("Shader missing " + id);
    stats.shaderBuilds = (stats.shaderBuilds || 0) + 1;
    modules[id] = device.createShaderModule({ label: id, code: s.code });
    bindings[id] = [...s.code.matchAll(/@group\((\d+)\)\s*@binding\((\d+)\)\s*var(?:<[^>]*>)?\s+(\w+)\s*:\s*([^;]+);/g)].filter((m) => s.code.split(m[3]).length > 2).map((m) => ({ group: +m[1], binding: +m[2], name: m[3], type: m[4] }));
  }
  const options = globalThis.__r5Options || {}, scale = [0.5, 0.75].includes(options.renderScale) ? options.renderScale : 1;
  const renderWidth = Math.round(1280 * scale), renderHeight = Math.round(720 * scale);
  let upscalePipeline, upscaleGroup;
  if (scale !== 1) {
    const module = device.createShaderModule({ label: "scene-upscale", code: `
   @group(0) @binding(0) var image:texture_2d<f32>;
   @group(0) @binding(1) var filtering:sampler;
   struct V { @builtin(position) p:vec4<f32>, @location(0) uv:vec2<f32> }
   @vertex fn vs(@builtin(vertex_index) i:u32)->V {let p=array<vec2<f32>,3>(vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.))[i];return V(vec4(p,0.,1.),vec2((p.x+1.)*.5,(1.-p.y)*.5));}
   @fragment fn fs(v:V)->@location(0) vec4<f32>{return textureSampleLevel(image,filtering,v.uv,0.);}` });
    upscalePipeline = await device.createRenderPipelineAsync({ label: "scene-upscale", layout: "auto", vertex: { module, entryPoint: "vs" }, fragment: { module, entryPoint: "fs", targets: [{ format: "rgba8unorm" }] }, primitive: { topology: "triangle-list" } });
  }
  const scaledScissor = (s) => {
    const x = Math.floor(s[0] * scale), y = Math.floor(s[1] * scale);
    return [x, y, Math.min(renderWidth, Math.ceil((s[0] + s[2]) * scale)) - x, Math.min(renderHeight, Math.ceil((s[1] + s[3]) * scale)) - y];
  };
  const target = device.createTexture({ size: [renderWidth, renderHeight], format: "rgba8unorm", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING }), depth = device.createTexture({ size: [renderWidth, renderHeight], format: "depth24plus-stencil8", usage: GPUTextureUsage.RENDER_ATTACHMENT });
  function pipeline(m) {
    useShader(m.vs);
    useShader(m.ps);
    const key = JSON.stringify([m.vs, m.ps, m.blend, m.raster & 7, m.depth, m.stencil >>> 8, m.writeMask]);
    if (pipelines.has(key)) return pipelines.get(key);
    const promise = (async () => {
      const b = m.blend, d = m.depth, st = m.stencil, blend = { color: { srcFactor: factors[b & 31], dstFactor: factors[b >>> 8 & 31], operation: ops[b >>> 5 & 7] }, alpha: { srcFactor: factors[b >>> 16 & 31], dstFactor: factors[b >>> 24 & 31], operation: ops[b >>> 21 & 7] } };
      if (Object.values(blend.color).includes(void 0) || Object.values(blend.alpha).includes(void 0)) throw Error("Blend unsupported");
      for (const part of [blend.color, blend.alpha]) if (part.operation === "min" || part.operation === "max") part.srcFactor = part.dstFactor = "one";
      const front = d & 1 ? { compare: compares[d >>> 8 & 7], failOp: stencilOps[d >>> 11 & 7], passOp: stencilOps[d >>> 14 & 7], depthFailOp: stencilOps[d >>> 17 & 7] } : { compare: "always" };
      const p = await device.createRenderPipelineAsync({ label: m.vs + "/" + m.ps, layout: "auto", vertex: { module: modules[m.vs], entryPoint: "main" }, fragment: { module: modules[m.ps], entryPoint: "main", targets: [{ format: "rgba8unorm", blend, writeMask: m.writeMask }] }, primitive: { topology: "triangle-list", frontFace: m.raster & 4 ? "cw" : "ccw", cullMode: (m.raster & 3) === 2 ? "back" : (m.raster & 3) === 1 ? "front" : "none" }, depthStencil: { format: "depth24plus-stencil8", depthWriteEnabled: !!(d & 4), depthCompare: d & 2 ? compares[d >>> 4 & 7] : "always", stencilFront: front, stencilBack: front, stencilReadMask: st >>> 8 & 255, stencilWriteMask: st >>> 16 & 255 } });
      p.cacheId = ++stats.pipelineBuilds;
      return p;
    })().catch((e) => {
      stats.rejectedPipelines[key] = e.message;
      return null;
    });
    pipelines.set(key, promise);
    return promise;
  }
  function texture(t) {
    let gpu = textures.get(t.key);
    if (!gpu) {
      const u = prepareTexture(t);
      gpu = device.createTexture({ size: [u.width, u.height, u.layers || 1], format: u.format, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
      device.queue.writeTexture({ texture: gpu }, u.data, { bytesPerRow: u.bytesPerRow, rowsPerImage: u.rowsPerImage }, [u.width, u.height, u.layers || 1]);
      gpu.view = gpu.createView({ dimension: u.cube ? "cube" : "2d-array" });
      textures.set(t.key, gpu);
      gpu.cacheId = ++stats.textureUploads;
      gpu.revision = t.revision;
      gpu.byteSize = u.data.byteLength;
      stats.residentTextureBytes = (stats.residentTextureBytes || 0) + gpu.byteSize;
    } else if ((t.video || t.revision !== gpu.revision) && gpu.used !== frame) {
      const u = prepareTexture(t);
      device.queue.writeTexture({ texture: gpu }, u.data, { bytesPerRow: u.bytesPerRow, rowsPerImage: u.rowsPerImage }, [u.width, u.height, u.layers || 1]);
    }
    gpu.revision = t.revision;
    gpu.used = frame;
    return gpu;
  }
  function prepareArenas(inputs) {
    let changed = false;
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
      for (const [name, size] of Object.entries(extents)) if (!arenas[name] || arenas[name].size < size) {
        arenas[name]?.destroy();
        arenas[name] = device.createBuffer({ size: Math.max(256, 2 ** Math.ceil(Math.log2(size))), usage: GPUBufferUsage.COPY_DST | (name === "memory.bin" ? GPUBufferUsage.STORAGE : name === "indices.bin" ? GPUBufferUsage.INDEX : GPUBufferUsage.UNIFORM) });
        stats.bufferBuilds++;
      }
      for (const slot2 of slots) slot2.buffers = arenas;
    }
    const packed = {};
    for (const [name, buffer] of Object.entries(arenas)) packed[name] = new Uint8Array(buffer.size);
    for (const [i, input] of inputs.entries()) for (const [name, bytes] of Object.entries(input.assets)) packed[name].set(bytes, slots[i].offsets[name]);
    for (const [name, bytes] of Object.entries(packed)) device.queue.writeBuffer(arenas[name], 0, bytes);
  }
  function slot(i, input, p) {
    const s = slots[i];
    const groupKey = JSON.stringify([generation, p.cacheId, input.textures.map((t) => [t.slot, texture(t.texture).cacheId, t.sampler])]);
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
          if (!samplers.has(k)) samplers.set(k, device.createSampler({ magFilter: q.mag ? "linear" : "nearest", minFilter: q.min ? "linear" : "nearest", mipmapFilter: q.mip ? "linear" : "nearest", addressModeU: a[q.clampX], addressModeV: a[q.clampY], lodMaxClamp: 0 }));
          resource = samplers.get(k);
        } else if (b.type.startsWith("texture_2d_array") || b.type.startsWith("texture_cube")) resource = texture(t.texture).view;
        else throw Error("Unsupported binding " + b.name);
      }
      if (!groups.has(b.group)) groups.set(b.group, []);
      groups.get(b.group).push({ binding: b.binding, resource });
    }
    s.groups = Array.from({ length: Math.max(...groups.keys()) + 1 }, (_, g) => device.createBindGroup({ layout: p.getBindGroupLayout(g), entries: groups.get(g) || [] }));
    s.groupKey = groupKey;
    return s;
  }
  return { stats, async render(inputs, context) {
    frame++;
    const t0 = performance.now(), ps = await Promise.all(inputs.map((i) => pipeline(i.manifest))), pipelineMs = performance.now() - t0, resourcesAt = performance.now(), ready = [], rejected = {};
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
    const resourceMs = performance.now() - resourcesAt, replayAt = performance.now();
    if (ready.length) {
      const e = device.createCommandEncoder(), pass = e.beginRenderPass({ colorAttachments: [{ view: target.createView(), clearValue: [0, 0, 0, 1], loadOp: "clear", storeOp: "store" }], depthStencilAttachment: { view: depth.createView(), depthLoadOp: "clear", depthStoreOp: "store", depthClearValue: 1, stencilLoadOp: "clear", stencilStoreOp: "store", stencilClearValue: 0 } });
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
      if (scale === 1) e.copyTextureToTexture({ texture: target }, { texture: context.getCurrentTexture() }, [1280, 720]);
      else {
        upscaleGroup ??= device.createBindGroup({ layout: upscalePipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: target.createView() }, { binding: 1, resource: device.createSampler({ minFilter: "linear", magFilter: "linear" }) }] });
        const blit = e.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 1] }] });
        blit.setPipeline(upscalePipeline);
        blit.setBindGroup(0, upscaleGroup);
        blit.draw(3);
        blit.end();
      }
      try {
        device.queue.submit([e.finish()]);
      } catch (error) {
        stats.gpuErrors = (stats.gpuErrors || 0) + 1;
        stats.lastGpuError = String(error?.message || error || "GPU submission failed");
        for (const t of textures.values()) t.destroy();
        textures.clear();
        stats.residentTextureBytes = 0;
        stats.frames++;
        return { accepted: 0, rejected: { "GPU submission failed": ready.length }, pipelineMs, resourceMs, replayMs: performance.now() - replayAt, gpuWaitMs: 0, ...stats };
      }
    }
    const replayMs = performance.now() - replayAt, waitAt = performance.now();
    await device.queue.onSubmittedWorkDone();
    stats.frames++;
    for (const [key, g] of [...textures].sort((a, b) => a[1].used - b[1].used)) if (g.used !== frame && (frame - g.used > 120 || (stats.residentTextureBytes || 0) > 67108864)) {
      g.destroy();
      textures.delete(key);
      stats.residentTextureBytes -= g.byteSize;
      stats.textureEvictions = (stats.textureEvictions || 0) + 1;
    }
    stats.textureBudgetBytes = 67108864;
    stats.textureOverBudgetBytes = Math.max(0, (stats.residentTextureBytes || 0) - 67108864);
    return { accepted: ready.length, rejected, pipelineMs, resourceMs, replayMs, gpuWaitMs: performance.now() - waitAt, ...stats };
  } };
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

  // tools/iphone-probe/mobile-gpu-worker.mjs
  var renderer;
  var canvas;
  var context;
  var busy;
  var pending;
  var known = /* @__PURE__ */ new Map();
  var conversion = { mode: "rgba8-no-bc", textures: 0, sourceBytes: 0, rgbaBytes: 0, totalMs: 0 };
  onmessage = async ({ data: m }) => {
    try {
      if (m.type === "init") {
        busy = new Int32Array(m.busy);
        pending = new Int32Array(m.presentation);
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw Error("WebGPU sin adaptador.");
        const device = await adapter.requestDevice();
        device.addEventListener("uncapturederror", (e) => postMessage({ type: "error", error: e.error.message }));
        device.lost.then((e) => {
          if (e.reason !== "destroyed") postMessage({ type: "error", error: "GPU lost: " + e.message });
        });
        if (device.features.has("texture-compression-bc")) throw Error("La prueba m\xF3vil debe usar un dispositivo sin BC.");
        renderer = await createLiveSongRenderer(device, m.shaders, { prepareTexture: (t) => {
          const start2 = performance.now(), u = decodeBCTexture(t);
          if (u !== t) {
            conversion.textures++;
            conversion.sourceBytes += t.data.byteLength;
            conversion.rgbaBytes += u.data.byteLength;
            conversion.totalMs += performance.now() - start2;
          }
          return u;
        } });
        canvas = new OffscreenCanvas(1280, 720);
        context = canvas.getContext("webgpu");
        context.configure({ device, format: "rgba8unorm", usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT, alphaMode: "opaque" });
        postMessage({ type: "ready", conversion: { ...conversion } });
        return;
      }
      const start = performance.now();
      for (const input of m.inputs) for (const t of input.textures) {
        if (t.texture.data) known.set(t.texture.key, t.texture);
        else {
          const original = known.get(t.texture.key);
          if (!original) throw Error("Unknown texture key");
          t.texture = original;
        }
      }
      const gpu = { ...await renderer.render(m.inputs, context), conversion: { ...conversion } };
      let bitmap = null;
      if (gpu.accepted && Atomics.compareExchange(pending, 0, 0, 1) === 0) bitmap = canvas.transferToImageBitmap();
      const result = { type: "frame", gpu: {...gpu, gpuMemory:globalThis.__sceneMemory}, info: m.info, pairs: m.pairs, skips: m.skips, approximatedMips: m.approximatedMips, timing: { ...m.timing, pipelineMs: gpu.pipelineMs, resourceMs: gpu.resourceMs, replayMs: gpu.replayMs, gpuWaitMs: gpu.gpuWaitMs, workerMs: performance.now() - start, totalMs: performance.timeOrigin + performance.now() - m.startedAt }, bitmap };
      Atomics.store(busy, 0, 0);
      postMessage(result, bitmap ? [bitmap] : []);
    } catch (e) {
      if (busy) Atomics.store(busy, 0, 0);
      postMessage({ type: "error", error: e.stack || e.message });
    }
  };
})();
