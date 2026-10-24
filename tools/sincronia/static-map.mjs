// Read-only, conservative scan of generated PPC instruction comments.
// Constant addresses are candidates, not a substitute for decompilation/runtime proof.
import fs from 'node:fs';
const root = 'artifacts/xex-adapt/paso-b/gh3-variant/generated/variant-dd2ca1ab';
const hits = [];
for (const file of fs.readdirSync(root).filter(f => /^gh3_recomp.*\.cpp$/.test(f))) {
  const lines = fs.readFileSync(`${root}/${file}`, 'utf8').split('\n');
  let fn = null, regs = new Map();
  for (let i=0; i<lines.length; i++) {
    const f = lines[i].match(/DEFINE_REX_FUNC\(([^)]+)\)/);
    if(f) { fn=f[1]; regs=new Map(); }
    const m=lines[i].match(/^\s*\/\/ (\w+)\s+(.*)$/); if(!m) continue;
    const [,op,args]=m, a=args.split(',').map(s=>s.trim());
    const mem=args.match(/(-?\d+)\((r\d+)\)/);
    if(mem && regs.has(mem[2])) {
      const addr=(regs.get(mem[2])+Number(mem[1]))>>>0;
      if(addr>=0x829B5600 && addr<0x829B5900) hits.push({fn,file,line:i+1,op,args,addr:'0x'+addr.toString(16).toUpperCase()});
    }
    const r=a[0];
    if(op==='lis') regs.set(r,(Number(a[1])*65536)>>>0);
    else if(op==='li') regs.set(r,Number(a[1])>>>0);
    else if(op==='mr') { if(regs.has(a[1])) regs.set(r,regs.get(a[1])); else regs.delete(r); }
    else if(['addi','addis','ori','oris'].includes(op)) {
      const v=a[1]==='r0'&&op.startsWith('addi')?0:regs.get(a[1]);
      if(v===undefined) regs.delete(r);
      else regs.set(r, (op.startsWith('add') ? v+Number(a[2])*(op==='addis'?65536:1) : v|(Number(a[2])*(op==='oris'?65536:1)))>>>0);
    } else if(op==='bl'||op==='bctrl') { for(let n=0;n<=12;n++) regs.delete('r'+n); }
    else if(/^b/.test(op)||/^cmp/.test(op)||/^st/.test(op)||op==='mtlr'||op==='mtctr'||op==='nop') {}
    else if(/^r\d+$/.test(r)) regs.delete(r);
  }
}
fs.mkdirSync('artifacts/sincronia-rea/static',{recursive:true});
fs.writeFileSync('artifacts/sincronia-rea/static/address-candidates.json',JSON.stringify(hits,null,2));
console.log(JSON.stringify({hits:hits.length, exact:hits.filter(h=>h.addr==='0x829B57B0'),functions:[...new Set(hits.map(h=>h.fn))]}));
