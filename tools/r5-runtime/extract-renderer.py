from pathlib import Path
root=Path.cwd(); path=root/'tools/r5-replay/replay.js';s=path.read_text();start=s.index('  const shaders=');end=s.index('  const reference=');body=s[start:end]
body=body.replace('const raw=await get(name);','const raw=assets[name];').replace("await get('texture-'+t.texture+'.bin')","assets['texture-'+t.texture+'.bin']")
body=body.replace('device.queue.writeBuffer(v,0,raw);return v;','ownedBuffers.push(v);device.queue.writeBuffer(v,0,raw);return v;').replace('textures[t.texture]=texture.createView','ownedTextures.push(texture);textures[t.texture]=texture.createView')
body=body.replace('  async function draw(){',"  let drawing=false;\n  async function draw(){\n    if(drawing)throw Error('Draw already in flight');drawing=true;\n    let read;\n    try {").replace('    const read=device.createBuffer','    read=device.createBuffer').replace('    read.unmap();read.destroy();return rgba;\n  }','    read.unmap();return rgba;\n    } finally {read?.destroy();drawing=false;}\n  }')
header='''// First validated intro case only; no CP or guest-address translation here.
// No fetch, document, canvas or window: usable on the CP worker GPU device.
export async function createIntroRenderer(device, input) {
  const m=structuredClone(input.manifest), assets={};
  const expected={'system-gpu.bin':528,'float-pixel.bin':80,'fetch.bin':768,'memory.bin':80};
  if(m.width!==1280||m.height!==720||m.textures?.length!==4)throw Error('Unsupported intro dimensions/resources');
  const slots=new Set();
  for(const t of m.textures){
    if(!Number.isInteger(t.texture)||t.texture<0||t.texture>3||slots.has(t.texture))throw Error('Invalid texture slots');
    slots.add(t.texture);const chroma=t.texture===1||t.texture===2;
    if(t.width!==(chroma?640:1280)||t.height!==(chroma?360:720)||t.format!==2||t.endian!==0)throw Error('Unsupported intro plane');
    expected['texture-'+t.texture+'.bin']=t.width*t.height;
  }
  // Own copies synchronously before the first await; no retained guest views.
  for(const [name,size] of Object.entries(expected)){
    const raw=input.assets[name];
    if(!(raw instanceof Uint8Array)||raw.byteLength!==size)throw Error('Invalid resource size: '+name);
    assets[name]=raw.slice();
  }
  if(assets['texture-3.bin'].some(v=>v!==255))throw Error('Translucent intro needs previous framebuffer');
  const vsCode=input.vertexWGSL,fsCode=input.fragmentWGSL;
  if(typeof vsCode!=='string'||typeof fsCode!=='string')throw Error('Missing shader source');
  const ownedBuffers=[],ownedTextures=[];let disposed=false;
  try {
'''
tail='''  ownedTextures.push(target);
  function dispose(){if(disposed)return;disposed=true;for(const b of ownedBuffers)b.destroy();for(const t of ownedTextures)t.destroy();}
  return {messages,blend:{color,alpha},primitive:{cullMode,frontFace:rs&4?'cw':'ccw'},
    async draw(){if(disposed)throw Error('Renderer disposed');return draw();},
    writePixelConstants(raw){if(disposed)throw Error('Renderer disposed');if(!(raw instanceof Uint8Array)||raw.byteLength!==80)throw Error('Invalid pixel constants');device.queue.writeBuffer(floats,0,raw);},dispose};
  } catch(error){for(const b of ownedBuffers)b.destroy();for(const t of ownedTextures)t.destroy();throw error;}
}
'''
(root/'tools/r5-runtime/intro-renderer.mjs').write_text(header+body+tail)
new=s[:start]+'''  const names=['system-gpu.bin','float-pixel.bin','fetch.bin','memory.bin',...m.textures.map(t=>'texture-'+t.texture+'.bin')];
  const assets=Object.fromEntries(await Promise.all(names.map(async name=>[name,await get(name)])));
  const renderer=await createIntroRenderer(device,{manifest:m,assets,vertexWGSL:vsCode,fragmentWGSL:fsCode});
  const {messages,blend,primitive}=renderer;
  try {
'''+s[end:]
new=new.replace('await draw()','await renderer.draw()').replace('device.queue.writeBuffer(floats,0,changed)','renderer.writePixelConstants(changed)').replace('device.queue.writeBuffer(floats,0,original)','renderer.writePixelConstants(original)')
new=new.replace("messages,blend:{color,alpha},primitive:{cullMode,frontFace:rs&4?'cw':'ccw'}",'messages,blend,primitive').replace('  device.destroy();return result;\n}','  return result;\n  } finally {renderer.dispose();device.destroy();}\n}')
path.write_text("import {createIntroRenderer} from '/intro-renderer.mjs';\n"+new)
p=root/'tools/r5-replay/run.mjs';r=p.read_text();r=r.replace(" if(req.url==='/replay.js')"," if(req.url==='/intro-renderer.mjs'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(resolve(root,'tools/r5-runtime/intro-renderer.mjs')));return;}\n if(req.url==='/replay.js')");p.write_text(r)
