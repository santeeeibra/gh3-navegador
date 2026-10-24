export const CATEGORIES = ['general', 'performance', 'audio', 'controls', 'loading', 'graphics', 'suggestion', 'other'];
const ORIGINS = new Set(['https://lasvegasherogame.com', 'https://gh3-privado-sante11.vercel.app', 'http://127.0.0.1:5460', 'http://localhost:5460']);
const cleanText = value => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim() : null;

export function validateFeedback(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const message = cleanText(body.message ?? ''), nickname = cleanText(body.nickname ?? '');
  if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5 || !CATEGORIES.includes(body.category)) return null;
  if (message === null || nickname === null || message.length > 2000 || nickname.length > 40) return null;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.request_id || '')) return null;
  return { request_id: body.request_id, rating: body.rating, category: body.category, message, nickname,
    device: ['phone', 'tablet', 'desktop'].includes(body.device) ? body.device : 'unknown',
    browser: ['Edge', 'Firefox', 'Opera', 'Brave', 'Chrome', 'Safari', 'Other'].includes(body.browser) ? body.browser : 'Other' };
}

export function createFeedbackHandler({ store, bucket }) {
  return async req => {
    const origin = req.headers.get('origin') || '';
    const headers = { 'access-control-allow-origin': ORIGINS.has(origin) ? origin : 'null', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type, apikey, authorization', vary: 'Origin', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
    const reply = (status, body) => Response.json(body, { status, headers });
    if (!ORIGINS.has(origin)) return reply(403, { error: 'origin' });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return reply(405, { error: 'method' });
    const declaredSize = Number(req.headers.get('content-length'));
    if (declaredSize > 12000) return reply(413, { error: 'size' });
    let body;
    try {
      // Enforce the limit while reading, including requests without Content-Length.
      const reader = req.body?.getReader(); if (!reader) return reply(400, { error: 'body' });
      const chunks = []; let size = 0;
      for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 12000) { await reader.cancel(); return reply(413, { error: 'size' }); } chunks.push(value); }
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch { return reply(400, { error: 'json' }); }
    if (typeof body?.website === 'string' && body.website.trim()) return reply(200, { ok: true });
    const data = validateFeedback(body); if (!data) return reply(400, { error: 'invalid' });
    try {
      const result = await store(data, await bucket(req));
      if (result === 'limited') return reply(429, { error: 'rate_limit' });
      if (!['stored', 'duplicate'].includes(result)) throw new Error('store_shape');
      return reply(200, { ok: true });
    } catch { return reply(503, { error: 'unavailable' }); }
  };
}
