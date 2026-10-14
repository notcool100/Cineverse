// Per-device recent searches. Pure list helpers plus guarded localStorage access; no imports so it is unit-testable.
const KEY = "cineora.recentSearches";
export const MAX_RECENT = 8;

/** Puts `q` first, drops case-insensitive duplicates and trims the list to MAX_RECENT. Blank or 1-char queries are ignored. */
export function pushRecent(list: string[], q: string): string[] {
  const t = q.trim().replace(/\s+/g, " ").slice(0, 100);
  if (t.length < 2) return list;
  return [t, ...list.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENT);
}

export function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function saveRecent(list: string[]) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
  } catch {}
}
