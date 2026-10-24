import fs from 'fs';
const b=fs.readFileSync(process.argv[2]); const d=new Int16Array(b.buffer,b.byteOffset+44,(b.length-44)>>1);
const n=d.length/2, F=Math.floor(n/256); const sd=(i,c)=>d[i*2+c]-2*d[(i-1)*2+c]+d[(i-2)*2+c];
let hits=0,tot=0; const perSec={};
for(let f=1;f<F;f++){ let ref=0,cnt=0; for(let i=f*256+2;i<f*256+256;i++){ if(i%256===128||i%256===129)continue; for(let c=0;c<2;c++){ref+=Math.abs(sd(i,c));cnt++;}}
 ref/=cnt; if(ref<5)continue; tot++; const v=Math.max(Math.abs(sd(f*256+128,0)),Math.abs(sd(f*256+128,1)),Math.abs(sd(f*256+129,0)),Math.abs(sd(f*256+129,1)));
 const s=Math.floor(f*256/48000); perSec[s]??=[0,0]; perSec[s][1]++; if(v>5*ref){hits++;perSec[s][0]++;}}
console.log('frames con señal',tot,'con clic>5x',hits,(100*hits/tot).toFixed(1)+'%');
console.log(Object.entries(perSec).filter(([s,v])=>v[1]>20).map(([s,v])=>s+':'+Math.round(100*v[0]/v[1])).join(' '));
