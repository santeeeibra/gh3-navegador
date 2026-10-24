// Quién llama a una función (por nombre) en los cpu-*.cpuprofile: suma el tiempo propio por padre.
import fs from 'node:fs';import path from 'node:path';
const [dir,fn,top='12']=process.argv.slice(2);const out=new Map();
for(const f of fs.readdirSync(dir).filter(x=>x.endsWith('.cpuprofile'))){
  const p=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));const byId=new Map(p.nodes.map(n=>[n.id,n]));const par=new Map();
  for(const n of p.nodes)for(const c of n.children||[])par.set(c,n.id);
  const self=new Map();p.samples.forEach((id,i)=>self.set(id,(self.get(id)||0)+(p.timeDeltas[i]||0)));
  for(const n of p.nodes){if(n.callFrame.functionName!==fn)continue;const t=(self.get(n.id)||0)/1000;
    const a=byId.get(par.get(n.id)),b=byId.get(par.get(a?.id)),k=(a?.callFrame.functionName||'?')+' < '+(b?.callFrame.functionName||'?');out.set(k,(out.get(k)||0)+t);}
}
[...out].sort((a,b)=>b[1]-a[1]).slice(0,+top).forEach(([k,v])=>console.log(Math.round(v)+' ms  '+k.slice(0,150)));
