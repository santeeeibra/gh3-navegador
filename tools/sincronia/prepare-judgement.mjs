import fs from 'node:fs';
const out='artifacts/sincronia-rea/judgement';
fs.mkdirSync(out+'/src',{recursive:true});
let code=fs.readFileSync('artifacts/xex-adapt/paso-b/gh3-variant/generated/variant-dd2ca1ab/gh3_recomp.2.cpp','utf8');
code='#include "judgement_probe.h"\n'+code;
for(const [fn,kind] of [['sub_8211EAC0',1],['sub_8211F1E8',2]]) {
  const marker=`DEFINE_REX_FUNC(${fn}) {\n\tREX_FUNC_PROLOGUE();`;
  code=code.replaceAll('\r\n','\n');
  if(!code.includes(marker))throw Error('No está '+fn);
  code=code.replace(marker,marker+`\n\tsync_judgement(${kind}, ctx.r3.u32, ctx.r4.u32, ctx.f1.f64);`);
}
fs.writeFileSync(out+'/src/gh3_recomp.2.cpp',code);
// Reuse the active link recipe, replacing just the instrumented game object.
let link=fs.readFileSync('tools/optim/armar-recorte2.sh','utf8');
link=link.replace('  [[ "$o" ==', '  if [[ "$o" == */gh3_recomp.2.o ]]; then o="$T/obj/gh3_recomp.2.o"; fi\n  [[ "$o" ==');
link=link.replace('"$T/rt/core_threading_posix.o"','"$A/recorte2/rt/core_threading_posix.o"');
link=link.replace('"$A"/pila-1m/demo/*','"$A"/lagtest/demo/*');
const mergeStart=link.indexOf('\nnode -e "');
if(mergeStart<0)throw Error('No se encontró el final del enlace activo.');
link=link.slice(0,mergeStart)+'\necho "Enlace preparado para merge verificado de JS"\n';
// Keep cwd correct for this new script, at the same depth under tools/.
fs.writeFileSync('tools/sincronia/link-judgement.sh',link);
console.log(out);
