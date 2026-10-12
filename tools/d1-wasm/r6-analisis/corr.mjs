import fs from 'fs';
const b=fs.readFileSync(process.argv[2]); const d=new Int16Array(b.buffer,b.byteOffset+44,(b.length-44)>>1);
const tb=fs.readFileSync(process.argv[2]+'.t'); const T=new Uint32Array(tb.buffer,tb.byteOffset,tb.length>>2);
const F=Math.min(Math.floor(d.length/512),T.length); const sd=(i,c)=>d[i*2+c]-2*d[(i-1)*2+c]+d[(i-2)*2+c];
const rows=[];
for(let f=1;f<F;f++){ let ref=0,cnt=0; for(let i=f*256+2;i<f*256+256;i++){ if(i%256===128||i%256===129)continue; ref+=Math.abs(sd(i,0))+Math.abs(sd(i,1));cnt+=2;} ref/=cnt; if(ref<5)continue;
 const v=Math.max(Math.abs(sd(f*256+128,0)),Math.abs(sd(f*256+128,1)),Math.abs(sd(f*256+129,0)),Math.abs(sd(f*256+129,1)));
 rows.push({click:v>5*ref, dt:T[f], dtPrev:T[f-1], dtNext:T[f+1]??0});}
const q=(a,p)=>{a=[...a].sort((x,y)=>x-y);return a[Math.floor(p*(a.length-1))];};
for(const k of [true,false]){const r=rows.filter(x=>x.click===k); console.log(k?'CLIC  ':'normal','n',r.length,'dt p50/p90',q(r.map(x=>x.dt),.5),q(r.map(x=>x.dt),.9),'| prev p50',q(r.map(x=>x.dtPrev),.5),'| next p50',q(r.map(x=>x.dtNext),.5));}
const bins=[0,1000,3000,6000,10000,20000,50000,1e9]; for(let i=0;i<bins.length-1;i++){const r=rows.filter(x=>x.dt>=bins[i]&&x.dt<bins[i+1]); if(r.length)console.log(`dt ${bins[i]}-${bins[i+1]}us n=${r.length} clic=${(100*r.filter(x=>x.click).length/r.length).toFixed(1)}%`);}
