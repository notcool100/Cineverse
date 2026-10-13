// Pure helpers that merge a title's own sources with the server's embed-provider registry.
// No imports on purpose: this file is unit-tested with `node --test`.

export type ProviderState = "enabled" | "disabled" | "unconfigured";

export interface ProviderInfo {
  slug: string;
  label: string;
  noAds: boolean;
  order: number;
  state: ProviderState;
  types: ("movie" | "tv")[];
  /** Provider's https origin, probed from the browser to rank by latency. */
  origin?: string;
}

export interface PickerEntry {
  id: string;
  kind: string;
  label: string;
  priority: number;
  /** Set for registry providers; the token comes from /playback/embed-token instead of a stored Source. */
  providerSlug?: string;
  state: ProviderState;
  /** Measured round-trip to the provider in ms, when probed successfully. */
  latencyMs?: number;
}

const PROVIDER_PRIORITY_BASE = 1000;

export function buildEntries(
  sources: { id: string; kind: string; label: string; priority: number }[],
  providers: ProviderInfo[],
  titleType: "MOVIE" | "SERIES" = "MOVIE",
  latency: Record<string, number> = {},
): PickerEntry[] {
  const own = sources.map((s): PickerEntry => ({ ...s, state: "enabled" }));
  const need = titleType === "SERIES" ? "tv" : "movie";
  // Probed providers first (fastest to slowest); unprobed or unreachable ones keep registry order after them.
  const rank = (p: ProviderInfo) => latency[p.slug] ?? Infinity;
  const reg = [...providers]
    .sort((a, b) => (rank(a) === rank(b) ? a.order - b.order : rank(a) - rank(b)))
    .map(
      (p): PickerEntry => ({
        id: `provider:${p.slug}`,
        kind: "EMBED_PROVIDER",
        label: p.label,
        priority: PROVIDER_PRIORITY_BASE + p.order,
        providerSlug: p.slug,
        latencyMs: latency[p.slug],
        // A configured provider that lacks a template for this content type can't play it.
        state: p.state === "enabled" && !p.types.includes(need) ? "disabled" : p.state,
      }),
    );
  return [...own.sort((a, b) => a.priority - b.priority), ...reg];
}

export const isPlayable = (e: PickerEntry | undefined) => e?.state === "enabled";

/** Index of the next playable entry after `from`, or -1. Used for failure/timeout fallback and manual skip. */
export function nextPlayable(entries: PickerEntry[], from: number): number {
  for (let i = from + 1; i < entries.length; i++) if (isPlayable(entries[i])) return i;
  return -1;
}

/** Starting entry: explicit id, then remembered label, then the first playable one. */
export function initialIndex(entries: PickerEntry[], initialId?: string, pref?: string | null): number {
  const ok = (i: number) => i >= 0 && isPlayable(entries[i]);
  const byId = entries.findIndex((e) => e.id === initialId);
  if (ok(byId)) return byId;
  const byPref = pref ? entries.findIndex((e) => e.label === pref) : -1;
  if (ok(byPref)) return byPref;
  return Math.max(0, entries.findIndex(isPlayable));
}
