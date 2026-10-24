import fs from 'node:fs/promises';
import path from 'node:path';
import {stageGeoFunction,stageVisitContext} from './stage-visit-context.mjs';

const outputRoot = path.resolve(process.argv[2] || 'artifacts/privado/deploy-app/.vercel/output');
const configPath = path.join(outputRoot, 'config.json');
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
config.routes = (config.routes || []).filter(route => !String(route.src || '').startsWith('^/estadisticas'));
const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src https://nvlwlmyuqorxaupcdbdb.supabase.co; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};
config.routes.unshift(
  { src: '^/estadisticas$', status: 307, headers: { Location: '/estadisticas/' } },
  { src: '^/estadisticas(?:/(.*))$', headers, continue: true },
);
await fs.writeFile(configPath, JSON.stringify(config, null, 2));
await stageGeoFunction(outputRoot);
await stageVisitContext(path.join(outputRoot,'static/gh3'));
console.log(`Rutas privadas de estadísticas agregadas a ${configPath}`);
