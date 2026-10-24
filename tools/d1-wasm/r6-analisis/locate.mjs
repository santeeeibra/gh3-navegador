import fs from 'fs';
const rd=p=>{const b=fs.readFileSync(p);return new Int16Array(b.buffer,b.byteOffset+44,(b.length-44)>>1);};
const env=(d)=>{const n=Math.floor(d.length/2/480),e=new Float64Array(n);for(let k=0;k<n;k++){let s=0;for(let i=k*480;i<(k+1)*480;i++){const v=(d[i*2]+d[i*2+1])/2;s+=v*v;}e[k]=Math.log(1+Math.sqrt(s/480));}return e;};
const A=env(rd(process.argv[2])), B=env(rd(process.argv[3])); const t0=+process.argv[4]*100, L=+process.argv[5]*100;
const q=A.slice(t0,t0+L); const mq=q.reduce((a,b)=>a+b)/L; let best=[-2,0];
for(let o=0;o+L<=B.length;o++){let sab=0,saa=0,sbb=0,mb=0;for(let i=0;i<L;i++)mb+=B[o+i];mb/=L;for(let i=0;i<L;i++){const a=q[i]-mq,b=B[o+i]-mb;sab+=a*b;saa+=a*a;sbb+=b*b;}const r=sab/Math.sqrt(saa*sbb||1);if(r>best[0])best=[r,o];}
console.log('nativo',process.argv[4],'s -> web',(best[1]/100).toFixed(2),'s corr',best[0].toFixed(3));
