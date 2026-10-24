import {safeMetadata} from '../shared/telemetry.js';
const allowedOrigins = new Set([
  "https://lasvegasherogame.com",
  "https://gh3-privado-sante11.vercel.app",
]);
const allowedEvents = new Set([
  "page_view", "play_clicked", "assets_ready", "game_started",
  "song_started", "session_ended", "load_error", "cache_fallback",
  "runtime_error", "load_cancelled", "performance_sample", "heartbeat",
]);
const allowedSources = new Set(["direct", "x", "google", "facebook", "instagram", "whatsapp", "tiktok", "youtube", "email", "other"]);
const allowedDevices = new Set(["phone", "tablet", "desktop", "unknown"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cors(origin: string) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "vary": "Origin",
  };
}
function response(status: number, origin: string, body = "") {
  return new Response(status === 204 ? null : body, {
    status,
    headers: { ...cors(origin), "content-type": "application/json", "cache-control": "no-store" },
  });
}
function metadataFor(event: string, value: unknown): Record<string, string | number | boolean> {
  const out:Record<string,string|number|boolean>=safeMetadata(value);
  const input=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
  if(typeof input.attempt_id==='string'&&uuid.test(input.attempt_id))out.attempt_id=input.attempt_id;
  if(event==='cache_fallback')out.reason='unsupported';
  // JSONB overhead is bounded by the allowlist; keep UTF-8 serialized size conservative.
  if(new TextEncoder().encode(JSON.stringify(out)).length>1400){delete out.cause;delete out.message;}
  return out;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  if (!allowedOrigins.has(origin)) return response(403, "null", '{"error":"origin"}');
  if (req.method === "OPTIONS") return response(204, origin);
  if (req.method !== "POST") return response(405, origin, '{"error":"method"}');
  const raw = await req.text();
  if (raw.length > 4096) return response(413, origin, '{"error":"size"}');
  let input: Record<string, unknown>;
  try { input = JSON.parse(raw); } catch { return response(400, origin, '{"error":"json"}'); }
  if(!input||typeof input!=='object'||Array.isArray(input))return response(400,origin,'{"error":"json"}');
  const event = String(input.event || "");
  const sessionId = String(input.session_id || "");
  const source = allowedSources.has(String(input.source)) ? String(input.source) : "other";
  const device = allowedDevices.has(String(input.device)) ? String(input.device) : "unknown";
  if (!allowedEvents.has(event) || !uuid.test(sessionId)) return response(400, origin, '{"error":"event"}');

  const base = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const headers = { apikey: key, authorization: `Bearer ${key}` };
  // Claude 2026-10-22: el latido no es un evento: actualiza la fila de la visita en gh3_live_sessions (tabla chica).
  if (event === "heartbeat") {
    const m = input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? input.metadata as Record<string, unknown> : {};
    const stage = ["menu", "loading", "playing", "idle"].includes(String(m.stage)) ? String(m.stage) : "idle";
    const live = await fetch(`${base}/rest/v1/gh3_live_sessions?on_conflict=session_id`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ session_id: sessionId, seen_at: new Date().toISOString(), stage, tester: safeMetadata(m).tester ?? null, device }),
    });
    return live.ok ? response(204, origin) : response(503, origin, '{"error":"store"}');
  }
  const since = new Date(Date.now() - 60_000).toISOString();
  const query = `${base}/rest/v1/gh3_analytics_events?select=id&session_id=eq.${encodeURIComponent(sessionId)}&occurred_at=gte.${encodeURIComponent(since)}&limit=21`;
  const recent = await fetch(query, { headers });
  if (!recent.ok) return response(503, origin, '{"error":"store"}');
  const rows = await recent.json();
  if (Array.isArray(rows) && rows.length >= 20) return response(429, origin, '{"error":"rate"}');

  const inserted = await fetch(`${base}/rest/v1/gh3_analytics_events`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({
      event_name: event,
      session_id: sessionId,
      source,
      device,
      metadata: metadataFor(event, input.metadata),
    }),
  });
  if (!inserted.ok) return response(503, origin, '{"error":"store"}');
  return response(204, origin);
});
