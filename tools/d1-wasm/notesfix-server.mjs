// Claude 2026-10-11: sirve la copia artifacts/d1-wasm/notesfix/demo (notas de poder estelar visibles) con el servidor del cargador de Codex, sin modificarlo.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLoaderServer} from '../local-loader/server.mjs';
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'));
const out=path.resolve('artifacts/local-loader'),config=JSON.parse(fs.readFileSync(path.join(out,'server-config.json')));
const catalog=JSON.parse(fs.readFileSync(path.join(out,'catalog.json'))),assets=JSON.parse(fs.readFileSync(path.join(out,'assets.json')));
// El servidor de Codex manda ETag = hash de SU archivo original: un Edge que ya tenía esa versión preguntaba
// If-None-Match, recibía 304 y seguía usando el renderer viejo (sin notas estrella). Hash real de esta copia.
const root=path.resolve('artifacts/d1-wasm/notesfix/demo');
for(const name of Object.keys(assets.static))assets.static[name]={...assets.static[name],hash:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')};
const port=Number(process.argv[2]||5440);
createLoaderServer({root,game:config.game,catalog,assets}).listen(port,'127.0.0.1',()=>console.log(`GH3 (notas estrella, copia Claude): http://127.0.0.1:${port}/`));
