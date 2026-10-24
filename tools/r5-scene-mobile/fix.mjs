import fs from 'node:fs';import {transform} from 'esbuild';
const root='artifacts/r5-scene-mobile',src='tools/r5-scene-mobile/src';fs.mkdirSync(src,{recursive:true});
let adapter=fs.readFileSync('tools/r5-live-song/live-prepare.mjs','utf8').replaceAll("'../r5-menu/","'../../r5-menu/").replace("'./bink.mjs'","'../../r5-live-song/bink.mjs'");
adapter=adapter.replace("if(!d.issued||d.unsupported)","if(!video && (r[0x2000]&0x3fff)!==1280)throw Error('Offscreen surface (COPY/EDRAM pending)');\n if(!d.issued||d.unsupported)")
 .replace("if(prepared.cube)throw Error('Cube texture');",'')
 .replace('if(video){\n   // Xenos','{\n   // Xenos')
 .replace("}else u(224+t.slot*4,t.raw[3]>>>1&0xfff);",'}');
// Xenos mip filter 2 is BaseMap (base level), not an unsupported filter.
adapter=adapter.replace('sampler.mip>1','sampler.mip>2').replace('if(t.mipMax)approximatedMips++;','if(sampler.mip===2)sampler.mip=0;\n  if(t.mipMax)approximatedMips++;');
adapter=adapter.replace('for(const t of d.textures){','for(const t of d.textures){\n  if(ps.shadowless&&(t.slot===14||t.slot===15))continue;');
// A descriptor/allocation has one slot; revision changes update that slot.
// Keep immutable host copies, rather than retaining one GPU texture per change.
adapter=adapter.replace("key:key+':'+(++revision)", 'key,revision:++revision');
adapter=adapter.replace("textures.push({slot:t.slot,texture,sampler});", "textures.push({slot:t.slot,texture:{...texture,scene:!video&&!['B43CF443883B8351','87D4CAE67E72C501','582ABCF5FF619A55','80708BD1B82638B0','94B97981B512BDA2','19815E13AC0DCC92'].includes(vs.id)},sampler});");
fs.writeFileSync(src+'/prepare.mjs',adapter);
let renderer=fs.readFileSync(process.env.SCENE_ARENA!=='0'?'tools/r5-live-song/arena-renderer.mjs':'tools/r5-live-song/live-renderer.mjs','utf8');
if(process.env.SCENE_ARENA!=='0')renderer=renderer.replace('Math.max(256,2**Math.ceil(Math.log2(Math.max(1,bytes.length))))','Math.max(256,Math.ceil(bytes.length/256)*256)');
const shaderAt=renderer.indexOf(' for(const [id,s] of Object.entries(shaders))'),shaderEnd=renderer.indexOf('\n',shaderAt+1);
if(shaderAt<0||shaderEnd<0)throw Error('Shader module initialization anchor');
let shaderBody=renderer.slice(shaderAt,shaderEnd).replace(' for(const [id,s] of Object.entries(shaders)){',' function useShader(id){if(modules[id])return;const s=shaders[id];if(!s)throw Error("Shader missing "+id);stats.shaderBuilds=(stats.shaderBuilds||0)+1;');
renderer=renderer.slice(0,shaderAt)+shaderBody+renderer.slice(shaderEnd);
renderer=renderer.replace(' function pipeline(m){',' function pipeline(m){\n  useShader(m.vs);useShader(m.ps);');
renderer=renderer.replace(" const target=",fs.readFileSync('tools/r5-scene-mobile/upscale.js','utf8')+"\n const target=")
 .replaceAll('size:[1280,720]','size:[renderWidth,renderHeight]')
 .replace('GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC','GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC|GPUTextureUsage.TEXTURE_BINDING')
 .replace('pass.setScissorRect(...m.scissor)','pass.setScissorRect(...scaledScissor(m.scissor))')
 .replace("e.copyTextureToTexture({texture:target},{texture:context.getCurrentTexture()},[1280,720]);",`if(scale===1)e.copyTextureToTexture({texture:target},{texture:context.getCurrentTexture()},[1280,720]);else{
    upscaleGroup??=device.createBindGroup({layout:upscalePipeline.getBindGroupLayout(0),entries:[{binding:0,resource:target.createView()},{binding:1,resource:device.createSampler({minFilter:'linear',magFilter:'linear'})}]});
    const blit=e.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),loadOp:'clear',storeOp:'store',clearValue:[0,0,0,1]}]});blit.setPipeline(upscalePipeline);blit.setBindGroup(0,upscaleGroup);blit.draw(3);blit.end();
   }`);
renderer=renderer.replace('size:[u.width,u.height]','size:[u.width,u.height,u.layers||1]')
 .replaceAll('[u.width,u.height]);','[u.width,u.height,u.layers||1]);')
 .replace("gpu.view=gpu.createView({dimension:'2d-array'})","gpu.view=gpu.createView({dimension:u.cube?'cube':'2d-array'})")
 .replace("b.type.startsWith('texture_2d_array')","(b.type.startsWith('texture_2d_array')||b.type.startsWith('texture_cube'))");
renderer=renderer.replace('stats.textureUploads;', 'stats.textureUploads;');
renderer=renderer.replace('gpu.cacheId=++stats.textureUploads;', 'gpu.cacheId=++stats.textureUploads;gpu.revision=t.revision;gpu.byteSize=u.data.byteLength;stats.residentTextureBytes=(stats.residentTextureBytes||0)+gpu.byteSize;')
 .replace('else if(t.video&&gpu.used!==frame)', 'else if((t.video||t.revision!==gpu.revision)&&gpu.used!==frame)')
 .replace('gpu.used=frame;return gpu;', 'gpu.revision=t.revision;gpu.used=frame;return gpu;');
// Only retire resources after the GPU completed the frame. Never evict active
// textures to meet a cap; report an oversize active set instead.
const budget=64*1024*1024;
renderer=renderer.replace("for(const [key,g] of textures)if(frame-g.used>120){g.destroy();textures.delete(key);}",`for(const [key,g] of [...textures].sort((a,b)=>a[1].used-b[1].used))if(g.used!==frame&&(frame-g.used>120||(stats.residentTextureBytes||0)>${budget})){g.destroy();textures.delete(key);stats.residentTextureBytes-=g.byteSize;stats.textureEvictions=(stats.textureEvictions||0)+1;}
  stats.textureBudgetBytes=${budget};stats.textureOverBudgetBytes=Math.max(0,(stats.residentTextureBytes||0)-${budget});`);
// Recover a command-encoding/submit exception visibly in diagnostics, rather
// than leaving the lightweight consumer's busy latch stuck on iOS.
renderer=renderer.replace('device.queue.submit([e.finish()]);',`try{device.queue.submit([e.finish()]);}catch(error){stats.gpuErrors=(stats.gpuErrors||0)+1;stats.lastGpuError=String(error?.message||error||'GPU submission failed');for(const t of textures.values())t.destroy();textures.clear();stats.residentTextureBytes=0;stats.frames++;return {accepted:0,rejected:{'GPU submission failed':ready.length},pipelineMs,resourceMs,replayMs:performance.now()-replayAt,gpuWaitMs:0,...stats};}`);
fs.writeFileSync(src+'/renderer.mjs',renderer);
const patch=(text,name,fn)=>{const at=text.indexOf(name),next=text.indexOf('\n  // tools/',at);if(at<0||next<0)throw Error('Function anchor '+name);return text.slice(0,at)+fn+'\n'+text.slice(next);};
let a=adapter.slice(adapter.indexOf('export function prepareLiveSongDraw')).replace('export function','function').replaceAll(/\bhex\(/g,'hex2(').replace('isBinkDraw(d)','((d.vs===0x57F6448DAC5BEB74n&&d.ps===0xAB008EF1D1A8CB6Dn)||(d.vs===0xCAC1FD2246E486B4n&&d.ps===0x5E18383DE868947Fn))');
a=(await transform(a,{target:'es2022'})).code;
for(const name of ['r5snap-song-scene.js','r5snap-song-render.js','r5snap-song-colas.js']){
 let s=fs.readFileSync(root+'/baseline/'+name,'utf8');s=patch(s,'function prepareLiveSongDraw(',a);
 s=s.replace('globalThis.__sceneMemory =','globalThis.__r5Options ??= {renderScale:1,textureScale:/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)?0.5:1,forceRGBA:false};\n  globalThis.__sceneMemory =');
 s=s.replace('key: key + ":" + ++revision','key, revision: ++revision');
 const shaders=JSON.parse(fs.readFileSync(root+'/shaders.json')),at=s.indexOf('var define_SONG_SHADERS_default = '),end=s.indexOf(';\n',at);
 s=s.slice(0,at)+'var define_SONG_SHADERS_default = '+JSON.stringify(shaders)+s.slice(end);
 if(name==='r5snap-song-scene.js'){
  const r=(await transform(renderer.slice(renderer.indexOf('export async function')).replace('export async function','async function'),{target:'es2022'})).code;
  s=patch(s,'async function createLiveSongRenderer(',r);
  s=s.replace('renderer = await createLiveSongRenderer(device, shaders, { prepareTexture: bc ? (t) => t : decodeBCTexture });','renderer = await createLiveSongRenderer(device, shaders, { prepareTexture: t=>sceneTexture(t,bc) });');
  s=s.replace('state.ready = true;', 'state.adapterFeatures=[...adapter.features]; state.maxGPUFramesInFlight=1; state.graphicsOptions=globalThis.__r5Options; state.shadows="PCF maps 14/15 omitted in ten explicit material variants"; state.ready = true;');
  s=s.replace('  // tools/iphone-probe/bc-rgba.mjs',fs.readFileSync('tools/r5-scene-mobile/texture-policy.js','utf8')+'\n  // tools/iphone-probe/bc-rgba.mjs');
 }
 if(name!=='r5snap-song-scene.js')s=s.replace('new Set();\n  var state =','new Map();\n  var state =').replace('var sentTextures = /* @__PURE__ */ new Set();','var sentTextures = /* @__PURE__ */ new Map();').replace('key: src.key, video: src.video,','key: src.key, revision:src.revision, video: src.video,').replace('if (src.video || !sentTextures.has(src.key))','if (src.video || sentTextures.get(src.key)!==src.revision)').replace('sentTextures.add(src.key);','sentTextures.set(src.key,src.revision);');
 fs.writeFileSync(root+'/demo/'+name,s);
}
// The lightweight modes share the same arena renderer in their dedicated GPU
// worker. Keep their decoder, message protocol, audio and runtime untouched.
let gpu=fs.readFileSync(root+'/baseline/r5snap-song-gpu.js','utf8');
gpu=patch(gpu,'async function createLiveSongRenderer(',(await transform(renderer.slice(renderer.indexOf('export async function')).replace('export async function','async function'),{target:'es2022'})).code);
fs.writeFileSync(root+'/demo/r5snap-song-gpu.js',gpu);
let diagnostic=fs.readFileSync(root+'/demo/r5snap-song-scene.js','utf8');const end=diagnostic.lastIndexOf('})();');fs.writeFileSync(root+'/demo/r5snap-scene-diagnostic.js',diagnostic.slice(0,end)+fs.readFileSync('tools/r5-scene-mobile/diagnostic.js','utf8')+diagnostic.slice(end));
console.log('Own demo: offscreen routing + packed texture swizzles + cube materials. Baseline unchanged.');
