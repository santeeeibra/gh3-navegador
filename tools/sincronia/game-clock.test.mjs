import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameClock} from './game-clock.mjs';
test('slow staircase advances smoothly at measured speed without accumulating drift', () => {
  const clock = createGameClock(); let prev, holds = 0, err = 0;
  for (let p = 0; p < 10000; p += 1000/60) {
    const c = 1000 + Math.floor(p/40)*40*0.4, v = clock.read(c, p);
    if (p > 2000) { if (v === prev) holds++; err = Math.max(err, Math.abs(v-c)); assert.ok(v >= prev); }
    prev = v;
  }
  assert.equal(holds, 0); assert.ok(err < 25, String(err)); assert.ok(Math.abs(clock.stats.rate-0.4)<0.03);
});
test('pause holds and restart resets without retaining old song time', () => {
  const clock = createGameClock();
  for (let p = 0; p <= 2000; p += 20) clock.read(1000+p*0.4, p);
  let value; for (let p = 2020; p <= 2500; p += 20) { const v = clock.read(1800, p); if (p >= 2220) { if (value !== undefined) assert.equal(v, value); value = v; } }
  assert.equal(clock.stats.paused, true); assert.equal(clock.read(100,2520),100);
  assert.equal(clock.read(NaN,2540),null); assert.equal(clock.read(0,2560),null);
});
test('adapts when game speed changes, with bounded error', () => {
  const clock = createGameClock(); let prev = 0;
  for (let p = 0; p <= 10000; p += 20) {
    const c = 1000 + (p < 4000 ? p*0.4 : 1600+(p-4000)*0.85), v = clock.read(c,p);
    assert.ok(v >= prev); prev = v;
    if (p > 6000) assert.ok(Math.abs(v-c)<20, String(v-c));
  }
  assert.ok(Math.abs(clock.stats.rate-0.85)<0.01);
});
