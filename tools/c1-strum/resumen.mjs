// Claude 2026-10-16: resumen corto de una corrida (sirve sin sondas de diagnóstico). Uso: node tools/c1-strum/resumen.mjs <carpeta>
import fs from 'node:fs';
const d = 'artifacts/gh3-liviano/accesos/' + process.argv[2];
const r = JSON.parse(fs.readFileSync(d + '/resultado.json')), m = r.muestras.at(-1) || {};
const p = fs.existsSync(d + '/sync-probe.json') ? JSON.parse(fs.readFileSync(d + '/sync-probe.json')) : {};
console.log(JSON.stringify({ok: r.ok, error: r.error || null, erroresPagina: r.erroresPagina?.length, pasos: r.pasos.map(x => x.paso).join(' > '),
  senales: {...r.senales, robot: undefined}, robot: m.robot && {strums: m.robot.strums, omitidas: m.robot.omitidas, clockMax: m.robot.clockMax},
  modo: p.press?.mode, cola: p.press?.queueStats}, null, 1));
