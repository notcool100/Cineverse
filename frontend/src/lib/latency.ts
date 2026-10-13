import type { ProviderInfo } from "./sources";

const CACHE_KEY = "cineora.latency";
const CACHE_MS = 10 * 60_000;
const TIMEOUT_MS = 3000;
/** Probing every provider would be wasteful; only the first few enabled ones compete. */
const MAX_PROBES = 8;

type Cache = { at: number; ms: Record<string, number> };

const readCache = (): Cache | null => {
  try {
    const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? "null") as Cache | null;
    return c && Date.now() - c.at < CACHE_MS ? c : null;
  } catch {
    return null;
  }
};

/** Time to first response from an origin. no-cors gives an opaque response, which is all we need for timing. */
async function ping(origin: string): Promise<number | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    // The first request pays DNS + TLS; the second reuses the connection and shows the real round-trip.
    const t0 = performance.now();
    await fetch(origin, { mode: "no-cors", cache: "no-store", credentials: "omit", signal: ctl.signal });
    const cold = performance.now() - t0;
    const t1 = performance.now();
    await fetch(origin, { mode: "no-cors", cache: "no-store", credentials: "omit", signal: ctl.signal });
    return Math.round(Math.min(cold, performance.now() - t1));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Latency in ms per provider slug; unreachable providers are omitted. Results are cached for the session. */
export async function probeProviders(providers: ProviderInfo[]): Promise<Record<string, number>> {
  const cached = readCache();
  if (cached) return cached.ms;
  const targets = providers.filter((p) => p.state === "enabled" && p.origin).slice(0, MAX_PROBES);
  const results = await Promise.all(targets.map(async (p) => [p.slug, await ping(p.origin!)] as const));
  const ms = Object.fromEntries(results.filter((r): r is readonly [string, number] => r[1] !== null));
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), ms } satisfies Cache));
  } catch {}
  return ms;
}
