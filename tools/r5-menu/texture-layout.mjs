// Tiling adapted from ReXGlue/Xenia GetTiledOffset2D (BSD, LICENSE.rexglue.txt).
// Produces host blocks; does not apply fetch swizzles/signs/exponents or resolve
// dependencies. Those must be handled by the renderer before approving a draw.
const formats={2:{block:1,bytes:1,gpu:'r8unorm'},6:{block:1,bytes:4,gpu:'rgba8unorm'},18:{block:4,bytes:8,gpu:'bc1-rgba-unorm'},19:{block:4,bytes:16,gpu:'bc2-rgba-unorm'},20:{block:4,bytes:16,gpu:'bc3-rgba-unorm'},49:{block:4,bytes:16,gpu:'bc5-rg-unorm'}};
const align=(n,a)=>Math.ceil(n/a)*a;
export function tiledOffset2D(x,y,pitch,logBytes){
  pitch=align(pitch,32);
  const macro=((x>>5)+(y>>5)*(pitch>>5))<<(logBytes+7);
  const micro=((x&7)+((y&14)<<2))<<logBytes;
  const offset=macro+((micro&~15)<<1)+(micro&15)+((y&1)<<4);
  return ((offset&~511)<<3)+((y&16)<<7)+((offset&448)<<2)+(((((y&8)>>2)+(x>>3))&3)<<6)+(offset&63);
}
export function prepareTextureBase(t,source,{allowUnknown=false}={}){
  const f=formats[t.format];
  if(!f)throw Error('Texture layout: unsupported format '+t.format);
  const cube=t.dimension===3&&t.depth===5&&t.width===t.height;
  if(!(source instanceof Uint8Array)||(!cube&&(t.dimension!==1||t.depth!==0))||t.raw[1]&(1<<10)||t.status)throw Error('Texture layout: unsupported dimension/status');
  if(!allowUnknown&&t.baseDependency>1)throw Error('Texture layout: unresolved GPU dependency');
  if(![0,1,2,3].includes(t.endian)||![0,1].includes(t.tiled))throw Error('Texture layout: endian/tiling');
  const width=t.width+1,height=t.height+1;
  if(width<1||height<1||width>8192||height>8192||t.pitch<width||source.length!==t.baseBytes)throw Error('Texture layout: dimensions/payload');
  const nx=Math.ceil(width/f.block),ny=Math.ceil(height/f.block);
  let pitch=align(Math.ceil(t.pitch/f.block),32);
  if(!t.tiled)pitch=align(pitch*f.bytes,256)/f.bytes;
  let ox=0,oy=0;
  // Packed base mip uses the same placement as TextureInfo::GetPackedTileOffset(0).
  if(t.packedMips&&Math.min(Math.ceil(Math.log2(width)),Math.ceil(Math.log2(height)))<=4){
    if(Math.ceil(Math.log2(width))>Math.ceil(Math.log2(height)))oy=16/f.block;else ox=16/f.block;
  }
  const layers=cube?6:1,faceStride=pitch*align(ny,32)*f.bytes;
  const output=new Uint8Array(nx*ny*f.bytes*layers),log=Math.log2(f.bytes);
  // Endian changes are relative to the guest address, not the tight row origin.
  const xor=[0,1,3,2][t.endian];
  let requiredBytes=0;
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    const p=t.tiled?tiledOffset2D(x+ox,y+oy,pitch,log):((y+oy)*pitch+x+ox)*f.bytes;
    requiredBytes=Math.max(requiredBytes,p+f.bytes);
  }
  requiredBytes+=(layers-1)*faceStride;
  if(source.length<requiredBytes){
    const error=Error(`Texture layout: missing guest bytes (${source.length} captured, ${requiredBytes} required)`);
    error.code='missing-bytes';error.requiredBytes=requiredBytes;throw error;
  }
  for(let layer=0;layer<layers;layer++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    const offset=layer*faceStride+(t.tiled?tiledOffset2D(x+ox,y+oy,pitch,log):((y+oy)*pitch+x+ox)*f.bytes);
    const dest=(layer*ny*nx+y*nx+x)*f.bytes;
    for(let i=0;i<f.bytes;i++){
      const p=(offset+i)^xor;
      if(p<0||p>=source.length)throw Error(`Texture layout: source bounds at ${p}`);
      output[dest+i]=source[p];
    }
  }
  return {width,height,layers,cube,format:f.gpu,blockWidth:f.block,blockBytes:f.bytes,bytesPerRow:nx*f.bytes,rowsPerImage:ny,data:output,mipsPending:t.mipMax>0,dependency:t.baseDependency};
}
