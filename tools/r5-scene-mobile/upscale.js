 const options=globalThis.__r5Options||{},scale=[0.5,0.75].includes(options.renderScale)?options.renderScale:1;
 const renderWidth=Math.round(1280*scale),renderHeight=Math.round(720*scale);
 let upscalePipeline,upscaleGroup;
 if(scale!==1){
  const module=device.createShaderModule({label:'scene-upscale',code:`
   @group(0) @binding(0) var image:texture_2d<f32>;
   @group(0) @binding(1) var filtering:sampler;
   struct V { @builtin(position) p:vec4<f32>, @location(0) uv:vec2<f32> }
   @vertex fn vs(@builtin(vertex_index) i:u32)->V {let p=array<vec2<f32>,3>(vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.))[i];return V(vec4(p,0.,1.),vec2((p.x+1.)*.5,(1.-p.y)*.5));}
   @fragment fn fs(v:V)->@location(0) vec4<f32>{return textureSampleLevel(image,filtering,v.uv,0.);}`});
  upscalePipeline=await device.createRenderPipelineAsync({label:'scene-upscale',layout:'auto',vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format:'rgba8unorm'}]},primitive:{topology:'triangle-list'}});
 }
 const scaledScissor=s=>{const x=Math.floor(s[0]*scale),y=Math.floor(s[1]*scale);return [x,y,Math.min(renderWidth,Math.ceil((s[0]+s[2])*scale))-x,Math.min(renderHeight,Math.ceil((s[1]+s[3])*scale))-y];};
