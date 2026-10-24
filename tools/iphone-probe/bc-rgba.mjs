// Decode already linearized BC blocks, not Xbox tiled/endian data.
// Reference: Microsoft Learn, Block Compression (Direct3D 10).
const formats={'bc1-rgba-unorm':8,'bc2-rgba-unorm':16,'bc3-rgba-unorm':16,'bc5-rg-unorm':16};
function rgb565(v,p,at){const r=v>>>11,g=(v>>>5)&63,b=v&31;p[at]=(r<<3)|(r>>>2);p[at+1]=(g<<2)|(g>>>4);p[at+2]=(b<<3)|(b>>>2);p[at+3]=255;}
function alphaPalette(src,off,p){p[0]=src[off];p[1]=src[off+1];if(p[0]>p[1]){for(let i=1;i<=6;i++)p[i+1]=Math.round(((7-i)*p[0]+i*p[1])/7);}else{for(let i=1;i<=4;i++)p[i+1]=Math.round(((5-i)*p[0]+i*p[1])/5);p[6]=0;p[7]=255;}}
function alphaIndex(src,off,i){const bit=i*3,k=off+2+(bit>>>3);return ((src[k]|(src[k+1]<<8))>>>(bit&7))&7;}
export function decodeBCTexture(t){
 const srgb=t.format.endsWith('-srgb'),format=srgb?t.format.replace(/-srgb$/,''):t.format,blockBytes=formats[format];
 if(!blockBytes){if(t.format.startsWith('bc'))throw Error('Formato BC no soportado: '+t.format);return t;}
 const w=t.width,h=t.height,src=t.data;
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>8192||h>8192||!(src instanceof Uint8Array))throw Error('Textura BC inválida.');
 const nx=Math.ceil(w/4),ny=Math.ceil(h/4),stride=t.bytesPerRow;
 if(!Number.isSafeInteger(stride)||stride<nx*blockBytes||src.length<(ny-1)*stride+nx*blockBytes)throw Error('Datos BC incompletos.');
 if(w*h*4>64*1048576)throw Error('Textura RGBA supera el límite de conversión individual.');
 const out=new Uint8Array(w*h*4),colors=new Uint8Array(16),a=new Uint8Array(8),g=new Uint8Array(8);
 for(let by=0;by<ny;by++)for(let bx=0;bx<nx;bx++){
  const off=by*stride+bx*blockBytes;let indices=0;
  if(format==='bc5-rg-unorm'){alphaPalette(src,off,a);alphaPalette(src,off+8,g);}
  else{
   const co=off+(format==='bc1-rgba-unorm'?0:8),c0=src[co]|src[co+1]<<8,c1=src[co+2]|src[co+3]<<8;
   rgb565(c0,colors,0);rgb565(c1,colors,4);
   if(format==='bc1-rgba-unorm'&&c0<=c1){for(let c=0;c<3;c++)colors[8+c]=Math.round((colors[c]+colors[4+c])/2);colors[11]=255;colors.fill(0,12,16);}
   else{for(let c=0;c<3;c++){colors[8+c]=Math.round((2*colors[c]+colors[4+c])/3);colors[12+c]=Math.round((colors[c]+2*colors[4+c])/3);}colors[11]=colors[15]=255;}
   indices=(src[co+4]|src[co+5]<<8|src[co+6]<<16|src[co+7]<<24)>>>0;
   if(format==='bc3-rgba-unorm')alphaPalette(src,off,a);
  }
  for(let y=0;y<4;y++)for(let x=0;x<4;x++){
   const px=bx*4+x,py=by*4+y;if(px>=w||py>=h)continue;
   const i=y*4+x,o=(py*w+px)*4;
   if(format==='bc5-rg-unorm'){out[o]=a[alphaIndex(src,off,i)];out[o+1]=g[alphaIndex(src,off+8,i)];out[o+2]=0;out[o+3]=255;}
   else{const c=((indices>>>(i*2))&3)*4;out[o]=colors[c];out[o+1]=colors[c+1];out[o+2]=colors[c+2];out[o+3]=format==='bc2-rgba-unorm'?((src[off+(i>>>1)]>>((i&1)*4))&15)*17:format==='bc3-rgba-unorm'?a[alphaIndex(src,off,i)]:colors[c+3];}
  }
 }
 return {...t,format:srgb?'rgba8unorm-srgb':'rgba8unorm',data:out,bytesPerRow:w*4,rowsPerImage:h};
}
