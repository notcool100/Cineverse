/** Pure helpers for the admin analytics dashboard. */

/** UTC day key used by the Redis view counters, e.g. "20261014". */
export const dayKey = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

/** The last `days` UTC dates (oldest first) as YYYY-MM-DD, ending at `now`'s date. */
export function lastDays(days: number, now = new Date()): string[] {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: days }, (_, i) => new Date(end - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

/** Puts sparse per-day counts onto a continuous axis; missing days count as 0. */
export function fillDays(days: string[], counts: Map<string, number>): { date: string; value: number }[] {
  return days.map((date) => ({ date, value: counts.get(date) ?? 0 }));
}

/** Sum of every title's view count inside one day's Redis hash (values arrive as strings). */
export function sumHash(h: Record<string, string>): number {
  let n = 0;
  for (const v of Object.values(h)) n += Number(v) || 0;
  return n;
}

/** Ranks titles by weighted activity: watching 3, saving 2, viewing 1. */
export function rankTitles(rows: { id: string; views?: number; watches?: number; saves?: number }[], limit: number) {
  return rows
    .map((r) => ({ ...r, views: r.views ?? 0, watches: r.watches ?? 0, saves: r.saves ?? 0 }))
    .map((r) => ({ ...r, score: r.views + 3 * r.watches + 2 * r.saves }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
