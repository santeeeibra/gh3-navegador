export function buildFeedback(rows, days, nowMs = Date.now()) {
  const since = nowMs - days * 86400000;
  const clean = rows.filter(row => Number.isInteger(row.rating) && row.rating >= 1 && row.rating <= 5 && Number.isFinite(Date.parse(row.created_at)) && Date.parse(row.created_at) >= since && Date.parse(row.created_at) <= nowMs);
  const categories = new Map();
  for (const row of clean) categories.set(row.category, (categories.get(row.category) || 0) + 1);
  return {
    total: clean.length,
    average: clean.length ? Math.round(clean.reduce((sum, row) => sum + row.rating, 0) / clean.length * 100) / 100 : null,
    ratings: [5, 4, 3, 2, 1].map(rating => ({ rating, count: clean.filter(row => row.rating === rating).length })),
    categories: [...categories].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
    recent: clean.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 100).map(row => ({
      created_at: row.created_at, rating: row.rating, category: String(row.category).slice(0, 24),
      message: String(row.message || '').slice(0, 2000), nickname: String(row.nickname || '').slice(0, 40),
      device: String(row.device || 'unknown').slice(0, 16), browser: String(row.browser || 'Other').slice(0, 16),
    })),
  };
}
