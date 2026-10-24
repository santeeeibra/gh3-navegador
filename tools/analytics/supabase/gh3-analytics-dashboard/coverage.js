// Cuando hay más filas que el tope, el panel muestra lo más reciente y avisa desde cuándo cubre.
export const MAX_PAGES = 50;
export const PAGE_SIZE = 1000;

export function coverage(rows, days, truncated, nowMs = Date.now()) {
  const requestedFrom = new Date(nowMs - days * 86_400_000).toISOString();
  if (!truncated) return { truncated: false, covered_from: requestedFrom };
  let oldest = Infinity;
  for (const row of rows) {
    const t = Date.parse(row.occurred_at);
    if (Number.isFinite(t) && t < oldest) oldest = t;
  }
  return { truncated: true, covered_from: Number.isFinite(oldest) ? new Date(oldest).toISOString() : requestedFrom };
}
