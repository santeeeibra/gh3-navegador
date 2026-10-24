// Claude 2026-10-14: sirve una copia de la página del juego en http://127.0.0.1:<puerto>/gh3/ con el mismo servidor
// de las pruebas (partes por demanda, COOP/COEP). Uso: node tools/ui3/serve.mjs [carpeta] [puerto] [latenciaMs] [KBps]
import fs from 'node:fs';import path from 'node:path';
import {createDemandServer} from '../local-loader/demand-server.mjs';
const root=path.resolve(process.argv[2]||'artifacts/d1-wasm/ui3/demo'),port=Number(process.argv[3]||5450);
const staticNames=fs.readdirSync(root).filter(n=>fs.statSync(path.join(root,n)).isFile());
const server=createDemandServer({root,staticNames,latencyMs:Number(process.argv[4]||0),bandwidthKBps:Number(process.argv[5]||0),onChunk:()=>{}});
server.listen(port,'127.0.0.1',()=>console.log(`http://127.0.0.1:${port}/gh3/`));
