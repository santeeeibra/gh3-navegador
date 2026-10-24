// Claude 2026-10-24: arma lo necesario para los avisos push. Las claves quedan SOLO en artifacts/analytics (fuera de Git).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const out = path.resolve('artifacts/analytics');
fs.mkdirSync(out, { recursive: true });
const envFile = path.join(out, 'push-secrets.env');
const b64u = buf => Buffer.from(buf).toString('base64url');

let env = {};
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2]; }
}
if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  env.VAPID_PUBLIC_KEY = b64u(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]));
  env.VAPID_PRIVATE_KEY = jwk.d;
}
env.VAPID_SUBJECT = env.VAPID_SUBJECT || 'https://lasvegasherogame.com';
env.PUSH_CRON_KEY = env.PUSH_CRON_KEY || b64u(crypto.randomBytes(32));
fs.writeFileSync(envFile, Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');

const sql = fs.readFileSync('tools/analytics/supabase/push-schema.sql', 'utf8').replaceAll('__CRON_KEY__', env.PUSH_CRON_KEY);
fs.writeFileSync(path.join(out, 'push-schema-LISTO.sql'), sql);

const dest = 'tools/analytics/deploy-supabase/supabase/functions/gh3-push';
fs.mkdirSync(dest, { recursive: true });
fs.copyFileSync('tools/analytics/supabase/gh3-push/index.ts', path.join(dest, 'index.ts'));
console.log('Listo: artifacts/analytics/push-secrets.env, push-schema-LISTO.sql y función copiada a deploy-supabase.');
