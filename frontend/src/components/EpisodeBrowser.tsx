"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Episode } from "@/lib/types";
import { getTitleHistory, markSeasonWatched, type EpisodeProgress } from "@/lib/client-api";
import { useUser } from "./useSession";

interface Props {
  titleId: string;
  episodes: Episode[];
  /** Highlighted episode (watch page). */
  current?: { season: number; number: number };
  /** Extra query string kept on episode links, e.g. `&source=abc`. */
  linkSuffix?: string;
}

const key = (s: number, n: number) => `S${s}E${n}`;

/** Season dropdown plus episode rows with stills, watched checkmarks and a mark-season-watched toggle. */
export function EpisodeBrowser({ titleId, episodes, current, linkSuffix = "" }: Props) {
  const user = useUser();
  const seasons = useMemo(() => [...new Set(episodes.map((e) => e.season))].sort((a, b) => a - b), [episodes]);
  const [season, setSeason] = useState(current?.season ?? seasons[0]);
  const [progress, setProgress] = useState<Map<string, EpisodeProgress>>(new Map());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let live = true;
    getTitleHistory(titleId)
      .then((rows) => live && setProgress(new Map(rows.map((r) => [r.episodeId, r]))))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [user, titleId]);

  const list = episodes.filter((e) => e.season === season).sort((a, b) => a.number - b.number);
  const finished = (e: Episode) => {
    const p = progress.get(key(e.season, e.number));
    return !!p && p.durationSec > 0 && p.positionSec / p.durationSec >= 0.95;
  };
  const allWatched = list.length > 0 && list.every(finished);

  async function toggleSeason() {
    if (!user || busy) return;
    const watched = !allWatched;
    const before = progress;
    setBusy(true);
    setProgress((m) => {
      const next = new Map(m);
      for (const e of list) {
        if (watched) next.set(key(e.season, e.number), { episodeId: key(e.season, e.number), positionSec: 1, durationSec: 1 });
        else next.delete(key(e.season, e.number));
      }
      return next;
    });
    try {
      await markSeasonWatched(titleId, season, watched);
    } catch {
      setProgress(before);
    } finally {
      setBusy(false);
    }
  }

  if (seasons.length === 0) return null;
  return (
    <section aria-label="Episodes" className="mt-6">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="season-select">Season</label>
        <select
          id="season-select"
          value={season}
          onChange={(e) => setSeason(Number(e.target.value))}
          className="rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-sm font-medium"
        >
          {seasons.map((s) => (
            <option key={s} value={s} className="text-black">
              {s === 0 ? "Specials" : `Season ${s}`}
            </option>
          ))}
        </select>
        <span className="text-xs text-white/50">{list.length} episodes</span>
        {user && (
          <button onClick={toggleSeason} disabled={busy} className="ml-auto rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20 disabled:opacity-50">
            {allWatched ? "Mark season as unwatched" : "Mark season as watched"}
          </button>
        )}
      </div>
      <ul className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
        {list.map((e) => {
          const p = progress.get(key(e.season, e.number));
          const done = finished(e);
          const frac = p && p.durationSec > 1 && !done ? Math.min(1, p.positionSec / p.durationSec) : null;
          const active = current?.season === e.season && current.number === e.number;
          return (
            <li key={e.number}>
              <Link
                href={`/watch/${titleId}?season=${e.season}&episode=${e.number}${linkSuffix}`}
                aria-current={active ? "true" : undefined}
                className={`flex gap-3 rounded-xl border p-2 transition hover:bg-white/10 ${active ? "border-white/40 bg-white/10" : "border-white/10"}`}
              >
                <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-white/5 sm:w-40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {e.still && <img src={e.still} alt="" loading="lazy" className="size-full object-cover" />}
                  {frac !== null && (
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
                      <div className="h-full bg-accent" style={{ width: `${Math.max(3, frac * 100)}%` }} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 py-0.5">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <span className="text-white/50">{e.number}</span>
                    <span className="truncate">{e.name ?? `Episode ${e.number}`}</span>
                    {done && (
                      <span aria-label="Watched" title="Watched" className="ml-auto grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[11px]">
                        ✓
                      </span>
                    )}
                  </p>
                  {e.runtimeMin ? <p className="text-xs text-white/50">{e.runtimeMin} min</p> : null}
                  {e.overview && <p className="mt-1 line-clamp-2 text-xs text-white/65">{e.overview}</p>}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
