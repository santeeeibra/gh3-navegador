import fs from 'fs';
const b=fs.readFileSync(process.argv[2]); const d=new Int16Array(b.buffer,b.byteOffset+44,(b.length-44)>>1);
const n=d.length/2, F=Math.floor(n/256); const sd=(i,c)=>d[i*2+c]-2*d[(i-1)*2+c]+d[(i-2)*2+c];
let shown=0;
for(let f=2000;f<F&&shown<5;f++){ let ref=0,cnt=0; for(let i=f*256+2;i<f*256+256;i++){ if(i%256===128||i%256===129)continue; ref+=Math.abs(sd(i,0));cnt++;} ref/=cnt; if(ref<20)continue;
 const v=Math.abs(sd(f*256+128,0)); if(v>8*ref){shown++; const L=[];for(let i=f*256+116;i<f*256+140;i++)L.push(d[i*2]); console.log('frame',f,'L 116..139:',L.join(' '));}}
