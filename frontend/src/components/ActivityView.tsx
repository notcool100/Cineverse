"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { clearHistory, getActivity, removeFromHistory, type ActivityItem } from "@/lib/client-api";
import { groupByDay, parseEpisodeKey, watchedFraction } from "@/lib/activity";
import { imageUrl } from "@/lib/image-url";
import { EmptyState } from "./EmptyState";
import { RowSkeleton } from "./Skeleton";
import { useUser } from "./useSession";

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** Viewing activity for the active profile: grouped by day, with remove-one and clear-all. */
export function ActivityView() {
  const user = useUser();
  const [rows, setRows] = useState<ActivityItem[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const first = useCallback(
    () =>
      getActivity()
        .then((r) => (setRows(r.items), setNext(r.next)))
        .catch(() => (setRows([]), setErr("Couldn't load your activity."))),
    [],
  );
  useEffect(() => {
    if (user) void first();
  }, [user, first]);

  if (!user)
    return (
      <p className="text-white/60">
        <Link href="/login?next=/activity" className="text-accent underline">Sign in</Link> to see what you&apos;ve watched.
      </p>
    );

  async function more() {
    if (!next) return;
    setBusy(true);
    try {
      const r = await getActivity(next);
      setRows((x) => [...(x ?? []), ...r.items]);
      setNext(r.next);
    } catch {
      setErr("Couldn't load more.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(it: ActivityItem) {
    const before = rows;
    setRows((x) => x && x.filter((r) => !(r.titleId === it.titleId && r.episodeId === it.episodeId)));
    try {
      await removeFromHistory(it.titleId, it.episodeId);
    } catch {
      setRows(before);
      setErr("Couldn't remove that entry.");
    }
  }

  async function clearAll() {
    if (!confirm("Clear all viewing activity for this profile? This also empties Continue watching.")) return;
    const before = rows;
    setRows([]);
    setNext(null);
    try {
      await clearHistory();
    } catch {
      setRows(before);
      setErr("Couldn't clear your history.");
    }
  }

  if (!rows) return <RowSkeleton count={4} />;
  if (rows.length === 0)
    return (
      <EmptyState art="search" title="Nothing watched yet" actions={[{ label: "Find something to watch", href: "/", primary: true }]}>
        {err ?? "Titles you play will show up here."}
      </EmptyState>
    );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <p aria-live="polite" className="text-sm text-red-300">{err}</p>
        <button onClick={clearAll} className="rounded-full border border-white/20 px-4 py-1.5 text-sm hover:bg-white/10">Clear all activity</button>
      </div>
      {groupByDay(rows).map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/45">{g.label}</h2>
          <ul className="space-y-2">
            {g.rows.map((r) => {
              const ep = parseEpisodeKey(r.episodeId);
              const pct = watchedFraction(r);
              const href = `/watch/${r.titleId}${ep ? `?season=${ep.season}&episode=${ep.episode}` : ""}`;
              return (
                <li key={`${r.titleId}|${r.episodeId}`} className="glass-soft flex items-center gap-4 rounded-2xl p-3">
                  <Link href={`/title/${r.titleId}`} className="shrink-0">
                    {r.title.posterPath ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl(r.title.posterPath, "w185")} alt="" className="h-20 w-14 rounded-lg object-cover" />
                    ) : (
                      <span className="block h-20 w-14 rounded-lg bg-white/10" />
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/title/${r.titleId}`} className="block truncate font-semibold hover:underline">{r.title.name}</Link>
                    <p className="text-sm text-white/55">
                      {ep ? `Season ${ep.season} · Episode ${ep.episode}` : r.title.type === "SERIES" ? "Series" : "Movie"} · {time(r.updatedAt)}
                    </p>
                    {pct !== null && (
                      <div role="progressbar" aria-label="Watched" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-1 w-40 max-w-full overflow-hidden rounded-full bg-white/20">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(3, pct * 100)}%` }} />
                      </div>
                    )}
                  </div>
                  <Link href={href} className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black">{pct !== null && pct >= 0.95 ? "Watch again" : "Resume"}</Link>
                  <button onClick={() => remove(r)} aria-label={`Remove ${r.title.name}${ep ? ` S${ep.season}E${ep.episode}` : ""} from activity`} title="Remove from activity" className="grid size-9 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white">
                    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {next && (
        <div className="text-center">
          <button onClick={more} disabled={busy} className="rounded-full bg-white/10 px-6 py-2 text-sm font-medium hover:bg-white/20 disabled:opacity-50">{busy ? "Loading…" : "Show more"}</button>
        </div>
      )}
    </div>
  );
}
