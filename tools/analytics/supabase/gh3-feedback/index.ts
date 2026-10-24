import { createFeedbackHandler } from './handler.js';

function configuration() {
  let key = '';
  try { key = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || ''; } catch { /* legacy key */ }
  key ||= Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const base = Deno.env.get('SUPABASE_URL') || '';
  if (!key || !base) throw new Error('missing_configuration');
  return { key, base };
}

Deno.serve(createFeedbackHandler({
  async bucket(req: Request) {
    const { key } = configuration();
    // Gateway-provided network address, never stored or returned as plain text.
    const address = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
    const day = new Date().toISOString().slice(0, 10);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${key}:${day}:${address}`));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  },
  async store(data: Record<string, unknown>, bucket: string) {
    const { key, base } = configuration();
    const headers: Record<string, string> = { apikey: key, 'content-type': 'application/json' };
    if (!key.startsWith('sb_secret_')) headers.authorization = `Bearer ${key}`;
    const response = await fetch(`${base}/rest/v1/rpc/gh3_submit_feedback`, {
      method: 'POST', headers, body: JSON.stringify({ p_data: data, p_bucket: bucket }),
    });
    if (!response.ok) throw new Error('store_unavailable');
    return await response.json();
  },
}));
