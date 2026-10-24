// Claude 2026-10-16: arma las fuentes de la copia C1 v2 (artifacts/sincronia-rea/c1id) a partir del candidato de
// Codex (artifacts/sincronia-rea/pulsacion) sin tocar sus archivos: sólo copia y reemplaza con anclas únicas.
// Uso: node tools/c1-strum/prepare.mjs   (después: bash tools/c1-strum/build.sh)
import fs from 'node:fs';
import {build} from 'esbuild';
const T = 'artifacts/sincronia-rea/c1id', P = 'artifacts/sincronia-rea/pulsacion';
const rep = (s, a, b) => { if (s.split(a).length !== 2) throw Error('Ancla no única: ' + a.slice(0, 80)); return s.replace(a, b); };
fs.mkdirSync(T + '/src', {recursive: true});

// 1) Código recompilado: mismos puntos de inserción de Codex, otra sonda (lee la entrega de C1).
let code = fs.readFileSync(P + '/src/gh3_recomp.2.cpp', 'utf8').replaceAll('\r\n', '\n');
code = rep(code, '#include "press_probe.h"', '#include "press_probe_c1.h"');
fs.writeFileSync(T + '/src/gh3_recomp.2.cpp', code);

// 2) Robot: además del de Codex, --tarde N = el "manejador" llega N ms tarde: cola y estado en vivo se escriben
//    juntos N ms después, pero la cola conserva la hora real del rasgueo (como event.timeStamp del DOM).
let robot = fs.readFileSync('tools/sincronia/robot-press.mjs', 'utf8');
robot = rep(robot, 'deliveryDelayMs=0,wrongIndex=-1,lateIndex=-1,lateMs=160, armed', 'deliveryDelayMs=0,lateHandlerMs=0,wrongIndex=-1,lateIndex=-1,lateMs=160, armed');
robot = rep(robot, '{omitir = null, estrella = 0, lead = 0, deliveryDelayMs=0,', '{omitir = null, estrella = 0, lead = 0, deliveryDelayMs=0, lateHandlerMs=0,');
robot = rep(robot, '({notes, omitir, estrella, lead, deliveryDelayMs,wrongIndex', '({notes, omitir, estrella, lead, deliveryDelayMs,lateHandlerMs,wrongIndex');
robot = rep(robot, '({notes, omitir, estrella, lead,deliveryDelayMs,wrongIndex,lateIndex,lateMs} = d)', '({notes, omitir, estrella, lead,deliveryDelayMs,lateHandlerMs,wrongIndex,lateIndex,lateMs} = d)');
robot = rep(robot, "{type: 'init', notes, omitir, estrella, lead,deliveryDelayMs,", "{type: 'init', notes, omitir, estrella, lead,deliveryDelayMs,lateHandlerMs,");
robot = rep(robot, '{notes: chart.notes, omitir, estrella, lead,deliveryDelayMs,', '{notes: chart.notes, omitir, estrella, lead,deliveryDelayMs,lateHandlerMs,');
robot = rep(robot, 'if(tap&DOWN && writePress){', 'if(tap&DOWN && writePress && lateHandlerMs>0){const press=st.presses.at(-1);pending.push({due:pnow+lateHandlerMs,b,tr,tap,late:performance.timeOrigin+pnow,press});last=key;}\n          else if(tap&DOWN && writePress){');
robot = rep(robot, 'pending.push({due:pnow+deliveryDelayMs,b,tr,tap,queueId});last=key;', 'if(!(tap&DOWN && writePress && lateHandlerMs>0)){pending.push({due:pnow+deliveryDelayMs,b,tr,tap,queueId});last=key;}');
robot = rep(robot, 'while(pending.length&&pending[0].due<=pnow){const d=pending.shift();', `while(pending.length&&pending[0].due<=pnow){const d=pending.shift();
          if(d.late){const w=performance.timeOrigin+performance.now();d.queueId=writePress({eventAt:d.late,writtenAt:w,buttons:d.b,triggers:d.tr,source:8,flags:1,seq:Atomics.load(L,0)+1});if(d.press)Object.assign(d.press,{queueId:d.queueId,queuedAt:w,eventAt:d.late});}`);
// --doble N: cada rasgueo se repite N ms después (rasgueos rápidos que el latch de C1 fusiona).
robot = robot.replaceAll('lateHandlerMs,wrongIndex', 'lateHandlerMs,dobleMs,wrongIndex').replaceAll('lateHandlerMs=0,wrongIndex', 'lateHandlerMs=0,dobleMs=0,wrongIndex').replaceAll('lateHandlerMs=0, wrongIndex', 'lateHandlerMs=0, dobleMs=0, wrongIndex');
robot = rep(robot, 'tap = DOWN; strumUntil = pnow + 30; st.strums++;', 'tap = DOWN; strumUntil = pnow + 30; st.strums++; if (dobleMs > 0) st.second = pnow + dobleMs;');
robot = rep(robot, 'if (estrella && raw > estrella', 'if (st.second && pnow >= st.second) { st.second = 0; tap |= DOWN; st.dobles = (st.dobles || 0) + 1; }\n        if (estrella && raw > estrella');
// --sincola: el robot no escribe la cola (prueba de rasgueos sin evento: deben pasar igual).
robot = rep(robot, "if (d.type === 'pressQueue' && M && !writePress)", "if (d.type === 'pressQueue' && M && !writePress && !self.sinCola)");
robot = rep(robot, "if (d.type === 'arm') armed = true;", "if (d.type === 'sinCola') self.sinCola = true;\n        if (d.type === 'arm') armed = true;");
robot = rep(robot, "bw.postMessage({type: 'init',", "if (new URLSearchParams(location.search).has('sincola')) bw.postMessage({type: 'sinCola'});\n    bw.postMessage({type: 'init',");
fs.writeFileSync('tools/c1-strum/robot-c1.mjs', '// GENERADO por tools/c1-strum/prepare.mjs desde tools/sincronia/robot-press.mjs (Codex). No editar.\n' + robot);

let runner = fs.readFileSync('tools/sincronia/run-press.mjs', 'utf8');
runner = rep(runner, "from './robot-press.mjs'", "from './robot-c1.mjs'");
runner = rep(runner, "from './robot-visual-probe.mjs'", "from '../sincronia/robot-visual-probe.mjs'");
runner = rep(runner, "deliveryDelayMs:Number(opt('entrega',0)),", "deliveryDelayMs:Number(opt('entrega',0)),lateHandlerMs:Number(opt('tarde',0)),dobleMs:Number(opt('doble',0)),");
runner = rep(runner, "owner: 'Codex (sincronía local)'", "owner: 'Claude (C1 ID de rasgueo)'");
runner = rep(runner, "'manual=1&diag=1&prueba=codex'", "'manual=1&diag=1&prueba=claude'");
// --toques: en la canción (con --movil) toca un color (rasgueo automático) y la zona RASGUEO con pares muy seguidos.
runner = rep(runner, "res.pasos.push({ms: t(), paso: 'canción en marcha'}); await shot('inicio-cancion');", `res.pasos.push({ms: t(), paso: 'canción en marcha'}); await shot('inicio-cancion');
    if (opt('toques', false)) { const cdp = await g.page.context().newCDPSession(g.page);
      const centro = async sel => { const b = await g.page.locator(sel).first().boundingBox(); return b && {x: b.x + b.width / 2, y: b.y + b.height / 2}; };
      const dedos = async (type, pts) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: pts.map((q, id) => ({...q, id}))});
      const verde = await centro('[data-role="fret"][data-fret="0"]'); res.toques = {verde, hechos: []};
      // 1) rasgueo automático: mantener el color 100 ms (dispara a los 30 ms).
      for (let k = 0; k < 5 && verde; k++) { await dedos('touchStart', [verde]); await nap(100); await dedos('touchEnd', []); res.toques.hechos.push({tipo: 'color', at: Date.now()}); await nap(400); }
      // 2) modo manual: mantener verde y tocar RASGUEO dos veces a 30 ms (el segundo se demora para separarlo).
      await g.page.evaluate(() => window.gh3Touch?.setSettings?.({auto: 0})); await nap(300);
      const rasgueo = await centro('[data-role="strum"]'); res.toques.rasgueo = rasgueo;
      for (let k = 0; k < 5 && verde && rasgueo; k++) { await dedos('touchStart', [verde]); await nap(40);
        await dedos('touchStart', [verde, rasgueo]); await nap(15); await dedos('touchEnd', [verde]); await nap(30);
        await dedos('touchStart', [verde, rasgueo]); await nap(15); await dedos('touchEnd', [verde]); await nap(60); await dedos('touchEnd', []);
        res.toques.hechos.push({tipo: 'par', at: Date.now()}); await nap(400); }
      await g.page.evaluate(() => window.gh3Touch?.setSettings?.({auto: 1}));
      write(); }`);
fs.writeFileSync('tools/c1-strum/run-c1.mjs', '// GENERADO por tools/c1-strum/prepare.mjs desde tools/sincronia/run-press.mjs (Codex). No editar.\n' + runner);

// 3) Página: escritor de la cola v2 + gh3-input.js con hora de Gamepad y enganche en menús.
await build({entryPoints: ['tools/c1-strum/c1-strum-page.mjs'], bundle: true, format: 'iife', outfile: T + '/c1-strum-page.js', logLevel: 'warning'});
let input = fs.readFileSync(P + '/demo/gh3-input.js', 'utf8');
input = rep(input, 'n.pad=t.id,', 'n.pad=t.id,l.padTs=t.timestamp,');
input = rep(input, 'l.attach=(e,t)=>{', 'l.attach=(e,t)=>{window.c1StrumAttach?.(e,t);');
fs.writeFileSync(T + '/gh3-input.js', input);
let html = fs.readFileSync(P + '/demo/index.html', 'utf8');
html = rep(html, '<script src="press-page.js"></script>', '<script src="c1-strum-page.js"></script>');
fs.writeFileSync(T + '/index.html', html);
console.log(T);
