import {ACTORS} from './audience.js';
export function safeText(value, max = 240) {
  return String(value ?? '').slice(0, 3000)
    .replace(/https?:\/\/[^\s<>"']+/gi, raw => {try{return new URL(raw).pathname;}catch{return '[recurso]';}})
    .replace(/((?:\/?[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+\.(?:js|wasm|json|bik|xen))[?#][^\s<>"']*/gi,'$1')
    .replace(/\bBearer\s+[^\s,;]+/gi,'[credencial oculta]')
    .replace(/\b(?:Bearer\s+)?eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[oculto]')
    .replace(/\b(?:authorization|token|password|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,'[credencial oculta]')
    .replace(/\b(?:sb_secret_|sb_publishable_)[A-Za-z0-9_-]+/g,'[oculto]')
    .replace(/\b[A-Z]:[\\/][^\s<>"']+/gi,'[ruta local]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[correo oculto]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'[dirección oculta]')
    .replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
}

export function safeResource(value) {
  try {
    const url = new URL(String(value), 'https://local.invalid');
    if (!/^https?:$/.test(url.protocol)) return '';
    const path=url.pathname;
    // Only public game resources; no local file names or unrelated URLs.
    return /^\/(?:gh3\/)?(?:chunks\/[a-f0-9]{64}|[a-zA-Z0-9_./-]+\.(?:js|wasm|json|bik|xen))$/.test(path) ? path.slice(0,220) : '';
  } catch { return ''; }
}

export function safeMetadata(input) {
  const m=input && typeof input==='object' && !Array.isArray(input) ? input : {}, out={};
  for (const key of ['phase','error_name','message','cause','browser','version','song','severity']) {
    if (typeof m[key]==='string') out[key]=safeText(m[key],key==='message'||key==='cause'?240:64);
  }
  const resource=safeResource(m.resource);if(resource)out.resource=resource;
  for(const [key,max] of Object.entries({status:599,cores:256,memory_gb:1024,game_pct:1000,clock_pct:1000,fps:1000,audio_underruns_delta:1e9,audio_skips_delta:1e9,interval_seconds:86400,seconds:86400})) {
    const value=m[key];if(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=max)out[key]=value;
  }
  if(typeof m.played==='boolean')out.played=m.played;
  if(ACTORS.includes(m.tester)||m.tester==='unknown')out.tester=m.tester;
  if(typeof m.geo_country==='string'&&/^[A-Z]{2}$/.test(m.geo_country)){
    out.geo_country=m.geo_country;
    for(const field of ['geo_region','geo_city'])if(typeof m[field]==='string')out[field]=safeText(m[field],80);
  }
  return out;
}

