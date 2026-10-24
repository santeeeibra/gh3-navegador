// Experimental visual clock. Input/output in game ms; p is performance.now().
// No audio or input changes. Fit the staircase clock instead of assuming 1:1.
export function createGameClock() {
  let pts = [], lastC = null, lastP = null, movedAt = 0, value = null;
  const stats = {rate: 0, resets: 0, paused: false, errorMs: 0};
  function reset() { pts = []; lastC = lastP = value = null; stats.rate = 0; stats.paused = false; stats.resets++; }
  function read(c, p) {
    if (!Number.isFinite(c) || c <= 0 || !Number.isFinite(p)) { reset(); return null; }
    if (lastP !== null && (p <= lastP || p - lastP > 1000 || c < lastC - 50 || c - lastC > Math.max(250, (p - lastP) * 2))) reset();
    if (lastC === null || c !== lastC) movedAt = p;
    const dt = lastP === null ? 0 : p - lastP;
    lastC = c; lastP = p;
    pts.push({p, c});
    while (pts.length > 2 && p - pts[0].p > 750) pts.shift();
    stats.paused = p - movedAt >= 180;
    // Centre times at the newest reading to avoid large timestamps in the fit.
    let sx = 0, sy = 0, xx = 0, xy = 0;
    for (const q of pts) { const x = q.p - p; sx += x; sy += q.c; xx += x*x; xy += x*q.c; }
    const n = pts.length, den = xx - sx*sx/n;
    let rate = den > 0 && p - pts[0].p >= 150 ? (xy - sx*sy/n)/den : 0;
    rate = Math.max(0, Math.min(2, rate));
    if (stats.paused) rate = 0;
    stats.rate = rate;
    // Never project more than 80 real ms beyond the observed clock.
    const target = Math.min(c + rate*80, sy/n - rate*sx/n);
    if (value === null) value = c;
    else if (!stats.paused) {
      const step = rate*dt, predicted = value + step;
      // Phase correction cannot reverse playback or stop it while rate > 0.
      value = Math.max(value, predicted + Math.max(-step*0.25, Math.min(step*0.25, target-predicted)));
    }
    stats.errorMs = value-c;
    return value;
  }
  return {read, reset, stats};
}
