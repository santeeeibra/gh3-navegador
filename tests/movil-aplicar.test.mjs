// apply-web.mjs sobre una demo FALSA en una carpeta temporal: copia, respalda lo que reemplaza y no borra nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const run = (...a) => execFileSync(process.execPath, ['tools/r5-native60/apply-web.mjs', ...a], {encoding: 'utf8'});

test('aplica la página sobre la demo con respaldo y sin borrar archivos del juego', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gh3-demo-')), demo = path.join(tmp, 'demo');
  fs.mkdirSync(demo);
  fs.writeFileSync(path.join(demo, 'gh3-web.js'), "Module['r5NativePort']=()=>{};");
  fs.writeFileSync(path.join(demo, 'index.html'), 'viejo');
  fs.writeFileSync(path.join(demo, 'gh3-web.wasm'), 'binario del juego');
  const out = JSON.parse(run('--demo', demo));
  assert.ok(out.aplicados.includes('index.html') && out.aplicados.includes('gh3-governor.js') && out.aplicados.includes('gh3-touch-prueba.js'));
  assert.equal(fs.readFileSync(path.join(demo, 'index.html'), 'utf8'), fs.readFileSync('web/gh3-native60/index.html', 'utf8'));
  assert.equal(fs.readFileSync(path.join(out.respaldo, 'index.html'), 'utf8'), 'viejo');
  assert.equal(fs.readFileSync(path.join(demo, 'gh3-web.wasm'), 'utf8'), 'binario del juego');
  assert.deepEqual(JSON.parse(run('--demo', demo)).aplicados, [], 'segunda vez: nada que cambiar');
  fs.rmSync(tmp, {recursive: true, force: true});
});

test('se niega si la demo no tiene el runtime con r5NativePort', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gh3-demo-'));
  fs.writeFileSync(path.join(tmp, 'gh3-web.js'), 'sin enlace');
  assert.throws(() => run('--demo', tmp, '--simular'));
  fs.rmSync(tmp, {recursive: true, force: true});
});
