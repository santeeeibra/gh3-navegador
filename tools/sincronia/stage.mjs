import fs from 'node:fs';
import path from 'node:path';
import {createGameClock} from './game-clock.mjs';
const src = path.resolve('artifacts/d1-wasm/lagtest/demo');
const dst = path.resolve('artifacts/sincronia-ritmo/demo');
if (fs.existsSync(dst)) throw Error('La copia ya existe; no sobrescribir pruebas.');
fs.mkdirSync(dst, {recursive: true});
fs.cpSync(src, dst, {recursive: true});
let text = fs.readFileSync(path.join(dst, 'autopista60.js'), 'utf8');
const start = text.indexOf('  const gclk = '), end = text.indexOf('  function visualTime(', start);
if (start < 0 || end < 0) throw Error('No se encontró el bloque de reloj esperado.');
const old = text.slice(start, end);
text = text.slice(0, start) + old + `
  const adaptiveClock = (${createGameClock.toString()})();
  if (Q.get('a60reloj') === 'ritmo') st.clockMode = 'ritmo';
  function adaptiveTime(p) {
    let c = null; try { c = window.gh3Song?.clock?.(); } catch {}
    const T = adaptiveClock.read(c, p);
    st.gameClock = {...adaptiveClock.stats};
    st.audioOk = T !== null;
    st.visualTimeMs = T;
    // Match the former game-clock experiment: game time without audio offset.
    const heard = heardSample(p);
    if (heard !== null && anc.med !== null) st.audioTimeMs = anc.med + heard / 48;
    return T;
  }
` + text.slice(end);
text = text.replace("    if (st.clockMode === 'juego') return gameTime(p);", "    if (st.clockMode === 'ritmo') return adaptiveTime(p);\n    if (st.clockMode === 'juego') return gameTime(p);");
fs.writeFileSync(path.join(dst, 'autopista60.js'), text);
// Local fork of the existing robot: preserve Claude's tools and tag our runs.
let runner = fs.readFileSync('tools/accesos/acceso.mjs', 'utf8')
  .replaceAll("from './", "from '../accesos/")
  .replace("query: 'manual=1&diag=1'", "query: 'manual=1&diag=1&prueba=codex'")
  .replace("owner: manual ? 'Santi (acceso manual, Claude)' : 'Claude (accesos rápidos)'", "owner: 'Codex (sincronía local)'")
  .replace('capaAdelantoMs: h?.offsetMs ?? null,', 'capaAdelantoMs: h?.offsetMs ?? null, clockMode: h?.clockMode, gameClock: h?.gameClock, capaGaps: h?.shownGaps, capaHolds: h?.holds, capaOutOfRange: h?.outOfRange,');
fs.writeFileSync('tools/sincronia/robot.mjs', runner);
console.log(JSON.stringify({src, dst, mode: '?a60reloj=ritmo', defaults: 'unchanged'}));
