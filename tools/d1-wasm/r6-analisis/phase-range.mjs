import fs from 'fs';
const b=fs.readFileSync(process.argv[2]); const all=new Int16Array(b.buffer,b.byteOffset+44,(b.length-44)>>1);
const s0=+process.argv[3]*48000, s1=+process.argv[4]*48000; const d=all.subarray(s0*2,Math.min(s1*2,all.length)); const n=d.length/2, M=256;
const acc=new Float64Array(M),cnt=new Float64Array(M);
for(let i=2;i<n;i++)for(let c=0;c<2;c++){const v=d[i*2+c]-2*d[(i-1)*2+c]+d[(i-2)*2+c];acc[(i+s0)%M]+=v*v;cnt[(i+s0)%M]++;}
const r=[...acc].map((a,i)=>Math.sqrt(a/cnt[i])); const med=[...r].sort((a,b)=>a-b)[M>>1];
console.log(process.argv[3]+'-'+process.argv[4]+'s','fase128',(r[128]/med).toFixed(2),'fase129',(r[129]/med).toFixed(2),'max otra',Math.max(...r.filter((_,i)=>i!==128&&i!==129))/med|0 ? (Math.max(...r.filter((_,i)=>i!==128&&i!==129))/med).toFixed(2):'');
