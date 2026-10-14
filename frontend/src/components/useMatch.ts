"use client";

import { useEffect, useState } from "react";
import { getMatches } from "@/lib/client-api";
import { useUser } from "./useSession";

// Cards on one screen ask for their match together: collect ids for a tick and fetch them in one request.
const cache = new Map<string, number | null>();
const waiting = new Map<string, Set<() => void>>();
let timer: ReturnType<typeof setTimeout> | undefined;

if (typeof window !== "undefined") {
  const reset = () => cache.clear();
  window.addEventListener("cineora-auth", reset);
  window.addEventListener("cineora-profile", reset);
}

function flush() {
  timer = undefined;
  const batch = [...waiting.entries()];
  waiting.clear();
  const ids = batch.map(([id]) => id);
  getMatches(ids)
    .then((res) => ids.forEach((id) => cache.set(id, res[id] ?? null)))
    .catch(() => ids.forEach((id) => cache.set(id, null)))
    .finally(() => batch.forEach(([, cbs]) => cbs.forEach((cb) => cb())));
}

/** "NN% match" for a title (slug) under the active profile, or null while loading / when unavailable / signed out. */
export function useMatch(slug: string, enabled = true): number | null {
  const user = useUser();
  const [, bump] = useState(0);
  useEffect(() => {
    if (!user || !enabled || cache.has(slug)) return;
    const cb = () => bump((n) => n + 1);
    const set = waiting.get(slug) ?? new Set();
    set.add(cb);
    waiting.set(slug, set);
    timer ??= setTimeout(flush, 30);
  }, [user, enabled, slug]);
  return user && enabled ? (cache.get(slug) ?? null) : null;
}
