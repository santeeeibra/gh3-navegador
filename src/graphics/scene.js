// Escena propia de prueba. No reproduce geometria, texturas ni shaders de GH3.
// Contrato de vertices: clip XYZW (Z entre 0 y W), color RGB, UV: 9 floats.
export function cubeVertices(seconds,aspect=1){
 const c=Math.cos(seconds*.5),s=Math.sin(seconds*.5),cx=Math.cos(.35),sx=Math.sin(.35);
 const faces=[
  [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],[.25,.9,.72]],
  [[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1],[.85,.45,.3]],
  [[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1],[.35,.55,.95]],
  [[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1],[.8,.3,.7]],
  [[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1],[.95,.8,.3]],
  [[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1],[.4,.75,.95]],
 ];
 const out=[];const uv=[[0,1],[1,1],[1,0],[0,0]],f=1.7,near=.1,far=20;
 for(const face of faces)for(const i of [0,1,2,0,2,3]){
  let [x,y,z]=face[i];let rx=x*c+z*s,rz=-x*s+z*c;let ry=y*cx-rz*sx;rz=y*sx+rz*cx;
  const distance=4.5-rz;
  out.push(rx*f/aspect,ry*f,far/(far-near)*distance-near*far/(far-near),distance,...face[4],...uv[i]);
 }
 return new Float32Array(out);
}
export function checkerTexture(size=128){
 const data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=(y*size+x)*4,v=((x>>3)^(y>>3))&1?235:100;data.set([v,v,v,255],i);}
 return {width:size,height:size,data};
}
export function validateRGBA8({width,height,data}){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||!(data instanceof Uint8Array)||data.length!==width*height*4)throw Error('Textura RGBA8 invalida');
}
export function textureMipmaps(texture){
 validateRGBA8(texture);let {width,height,data}=texture;
 const levels=[{width,height,data}];
 while(width>1||height>1){
  const nw=Math.max(1,width>>1),nh=Math.max(1,height>>1),next=new Uint8Array(nw*nh*4);
  for(let y=0;y<nh;y++)for(let x=0;x<nw;x++)for(let ch=0;ch<4;ch++){
   let total=0,count=0;const x0=Math.floor(x*width/nw),x1=Math.floor((x+1)*width/nw),y0=Math.floor(y*height/nh),y1=Math.floor((y+1)*height/nh);
   for(let sy=y0;sy<y1;sy++)for(let sx=x0;sx<x1;sx++){total+=data[(sy*width+sx)*4+ch];count++;}
   next[(y*nw+x)*4+ch]=Math.round(total/count);
  }
  width=nw;height=nh;data=next;levels.push({width,height,data});
 }
 return levels;
}
