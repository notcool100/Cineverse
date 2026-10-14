// Helpers for the viewing-activity page. No imports so they are unit-testable.

export interface ActivityRow {
  titleId: string;
  episodeId: string;
  positionSec: number;
  durationSec: number;
  updatedAt: string;
}

/** "S2E5" -> { season: 2, episode: 5 }; movies use the empty string. */
export function parseEpisodeKey(key: string): { season: number; episode: number } | null {
  const m = /^S(\d+)E(\d+)$/.exec(key);
  return m ? { season: Number(m[1]), episode: Number(m[2]) } : null;
}

/** Fraction watched (0..1), or null when the player couldn't report a duration (embedded servers). */
export function watchedFraction(r: Pick<ActivityRow, "positionSec" | "durationSec">): number | null {
  return r.durationSec > 0 ? Math.min(1, r.positionSec / r.durationSec) : null;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Today", "Yesterday", or a long date, in the viewer's local time. */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const diff = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", ...(d.getFullYear() !== now.getFullYear() && { year: "numeric" }) });
}

/** Keeps the incoming (newest-first) order and groups consecutive rows by local day. */
export function groupByDay<T extends { updatedAt: string }>(rows: T[], now = new Date()): { label: string; rows: T[] }[] {
  const out: { label: string; rows: T[] }[] = [];
  for (const r of rows) {
    const label = dayLabel(r.updatedAt, now);
    const last = out[out.length - 1];
    if (last?.label === label) last.rows.push(r);
    else out.push({ label, rows: [r] });
  }
  return out;
}
