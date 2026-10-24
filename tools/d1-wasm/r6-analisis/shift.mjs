import fs from 'fs';
const b=fs.readFileSync(process.argv[2]); const d=new Int16Array(b.buffer,b.byteOffset+44,(b.length-44)>>1);
const n=d.length/2, P=+process.argv[3]||128;
// For boundary at phase P (between P-1 and P), find lag k: does B start look like A continued by k samples?
// Use local linear prediction: expected d[P] ~ d[P-1]+slope. Regress J=d[P]-d[P-1] on slope s=d[P-1]-d[P-2].
let sx=0,sy=0,sxx=0,sxy=0,syy=0,m=0; let sx2=0,sxy2=0,syy2=0,sxx2=0,sy2=0;
for(let f=1;f*256+256<n;f++)for(let c=0;c<2;c++){
 const g=i=>d[(f*256+i)*2+c];
 const J=g(P)-g(P-1), s=g(P-1)-g(P-2); sx+=s;sy+=J;sxx+=s*s;sxy+=s*J;syy+=J*J;m++;
 const J2=g(P+60)-g(P+59), s2=g(P+59)-g(P+58); sxx2+=s2*s2;sxy2+=s2*J2;syy2+=J2*J2;}
const r=sxy/Math.sqrt(sxx*syy), beta=sxy/sxx; const r2=sxy2/Math.sqrt(sxx2*syy2), b2=sxy2/sxx2;
console.log('boundary: corr',r.toFixed(3),'slope ratio',beta.toFixed(3),'rmsJ',Math.sqrt(syy/m).toFixed(1));
console.log('control : corr',r2.toFixed(3),'slope ratio',b2.toFixed(3),'rmsJ',Math.sqrt(syy2/m).toFixed(1));
