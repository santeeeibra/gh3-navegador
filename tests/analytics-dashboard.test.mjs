import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildDashboard } from '../tools/analytics/supabase/gh3-analytics-dashboard/aggregate.js';

const now = Date.parse('2026-10-14T18:00:00Z');
const row = (event_name, session_id, minutes, extra = {}) => ({
  event_name, session_id, occurred_at: new Date(now - minutes * 60_000).toISOString(),
  source: 'direct', device: 'desktop', metadata: {}, ...extra,
});

test('dashboard aggregation counts unique sessions and keeps identities out', () => {
  const rows = [
    row('page_view', 'a', 4), row('page_view', 'a', 3), row('play_clicked', 'a', 2), row('game_started', 'a', 1),
    row('page_view', 'b', 60, {source:'x', device:'phone'}), row('load_error', 'b', 59, {metadata:{phase:'engine'}}),
    row('song_started', 'a', 1, {metadata:{song:'slow_ride'}}), row('session_ended', 'a', 0, {metadata:{seconds:125}}),
  ];
  const result = buildDashboard(rows, 7, now);
  assert.equal(result.totals.sessions, 2);
  assert.equal(result.totals.visits, 2);
  assert.equal(result.totals.active_5m, 1);
  assert.equal(result.totals.average_session_seconds, 125);
  assert.deepEqual(result.songs, [{song:'slow_ride',starts:1}]);
  assert.equal(result.funnel[0].sessions, 2);
  assert.equal(result.funnel[1].sessions, 1);
  assert.equal(JSON.stringify(result).includes('session_id'), false);
  assert.equal(JSON.stringify(result).includes('"a"'), false);
});

test('private panel has noindex, password gate and no embedded admin token', () => {
  const html = fs.readFileSync('tools/analytics/dashboard/index.html', 'utf8');
  const js = fs.readFileSync('tools/analytics/dashboard/dashboard.js', 'utf8');
  assert.match(html, /noindex,nofollow,noarchive/);
  assert.match(html, /type="password"/);
  assert.match(js, /sessionStorage/);
  assert.doesNotMatch(html + js, /cb0f100b87625a3f3639c64463bfc2b9591281c823a55c656cf585b890022c2e/);
  assert.doesNotMatch(html + js, /session_id/);
});

test('dashboard endpoint requires a bearer token and only returns aggregates', () => {
  const source = fs.readFileSync('tools/analytics/supabase/gh3-analytics-dashboard/index.ts', 'utf8');
  assert.match(source, /authorization/);
  assert.match(source, /sha256\(token\)/);
  assert.match(source, /select=occurred_at,event_name,session_id,source,device,metadata/);
  assert.match(source, /buildDashboard/);
  assert.doesNotMatch(source, /select=\*/);
});
