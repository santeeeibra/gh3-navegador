import fs from 'fs';
const b=fs.readFileSync(process.argv[2]); const d=new Int16Array(b.buffer,b.byteOffset+44,(b.length-44)>>1);
const n=d.length/2; const M=+process.argv[3]||512;
const acc=new Float64Array(M), cnt=new Float64Array(M);
for(let i=2;i<n;i++){ // second difference highlights clicks
 for(let c=0;c<2;c++){const v=d[i*2+c]-2*d[(i-1)*2+c]+d[(i-2)*2+c];acc[i%M]+=v*v;cnt[i%M]++;}}
const r=[...acc].map((a,i)=>Math.sqrt(a/cnt[i])); const med=[...r].sort((a,b)=>a-b)[M>>1];
const top=r.map((v,i)=>[i,v/med]).sort((a,b)=>b[1]-a[1]).slice(0,8);
console.log('M',M,'median',med.toFixed(1),'top',top.map(([i,v])=>i+':'+v.toFixed(2)).join(' '));
