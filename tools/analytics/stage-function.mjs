// Arma la carpeta que pide el CLI de Supabase (supabase/functions/<nombre>) a partir de supabase/.
// Uso: node tools/analytics/stage-function.mjs   y luego desplegar con --workdir tools/analytics/deploy-supabase
import {cpSync,rmSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(here,'deploy-supabase','supabase','functions');
rmSync(path.join(here,'deploy-supabase'),{recursive:true,force:true});
mkdirSync(out,{recursive:true});
for(const name of ['gh3-analytics-dashboard','gh3-analytics','shared'])cpSync(path.join(here,'supabase',name),path.join(out,name),{recursive:true});
console.log('Listo:',out);
