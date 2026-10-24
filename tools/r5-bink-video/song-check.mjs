// Reuse the authorized song runner in a generated local copy, with our isolated
// demo as its only build root. The shared runner and Claude's builds are untouched.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const root='artifacts/r5-bink-video',source=path.resolve('tools/local-loader/demand-game-check.mjs');
let code=fs.readFileSync(source,'utf8');
code=code.replaceAll("from 'playwright'",`from '${pathToFileURL(path.resolve('node_modules/playwright/index.mjs')).href}'`)
 .replace(/from '(\.\.?\/[^']+)'/g,(_,p)=>`from '${pathToFileURL(path.resolve(path.dirname(source),p)).href}'`)
 .replace("path.resolve('artifacts/unified-game')","path.resolve('artifacts/r5-bink-video')");
fs.copyFileSync('artifacts/unified-game/build-result.json',root+'/build-result.json');
fs.writeFileSync(root+'/song-check.mjs',code);await import(pathToFileURL(path.resolve(root+'/song-check.mjs')).href);
