import fs from 'fs';
const b=fs.readFileSync(process.argv[2]); const d=new Int16Array(b.buffer,b.byteOffset+44,(b.length-44)>>1);
const n=d.length/2, sr=48000; let clip=0,jumps=0,nz=0; const secs=[];
for(let s=0;s<Math.floor(n/sr);s++){let sum=0,pk=0,cl=0,j=0,diff=0;
 for(let i=s*sr;i<(s+1)*sr;i++){for(let c=0;c<2;c++){const v=d[i*2+c];sum+=v*v;pk=Math.max(pk,Math.abs(v));if(Math.abs(v)>=32700)cl++;
  if(i>0){const dd=Math.abs(v-d[(i-1)*2+c]);diff+=dd*dd;if(dd>16000)j++;}}}
 const rms=Math.sqrt(sum/(2*sr)), drms=Math.sqrt(diff/(2*sr));
 secs.push([s,rms|0,pk,cl,j,(drms/(rms||1)).toFixed(2)]);clip+=cl;jumps+=j;}
console.log('frames',n,'secs',n/sr,'clip',clip,'jumps',jumps);
console.log('s rms peak clip jumps hf/rms'); for(const r of secs) if(r[1]>50) console.log(r.join(' '));
