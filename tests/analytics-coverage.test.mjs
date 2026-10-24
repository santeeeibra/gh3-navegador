import test from 'node:test';
import assert from 'node:assert/strict';
import { coverage } from '../tools/analytics/supabase/gh3-analytics-dashboard/coverage.js';

const now = Date.parse('2026-10-21T12:00:00Z');

test('sin recorte: cubre todo el período pedido', () => {
  const c = coverage([], 7, false, now);
  assert.equal(c.truncated, false);
  assert.equal(c.covered_from, new Date(now - 7 * 86_400_000).toISOString());
});

test('con recorte: cubre desde el evento más antiguo leído', () => {
  const rows = [{ occurred_at: '2026-10-21T10:00:00Z' }, { occurred_at: '2026-10-20T08:30:00Z' }, { occurred_at: 'basura' }];
  const c = coverage(rows, 30, true, now);
  assert.equal(c.truncated, true);
  assert.equal(c.covered_from, '2026-10-20T08:30:00.000Z');
});

test('con recorte y sin filas válidas: cae al período pedido', () => {
  assert.equal(coverage([], 7, true, now).covered_from, new Date(now - 7 * 86_400_000).toISOString());
});
