"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getHistory, getWatchlist, type ApiTitleLite, type HistoryEntry } from "@/lib/client-api";
import { imageUrl } from "@/lib/image-url";
import type { Title } from "@/lib/types";
import { TitleCard } from "./TitleCard";
import { useUser } from "./useSession";

// The card only needs presentation fields, which the API returns on every title.
const asTitle = (t: ApiTitleLite): Title =>
  ({
    id: t.slug,
    name: t.name,
    year: t.year ?? 0,
    genres: t.genres,
    poster: imageUrl(t.posterPath, "w500"),
    accent: [t.accent[0] ?? "#333", t.accent[1] ?? "#0a0a0a"],
  }) as Title;

export function WatchlistView() {
  const user = useUser();
  const [list, setList] = useState<ApiTitleLite[] | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    if (!user) return;
    getWatchlist().then((r) => setList(r.map((x) => x.title))).catch(() => setList([]));
    getHistory().then(setHistory).catch(() => {});
  }, [user]);

  if (!user)
    return (
      <p className="text-white/60">
        <Link href="/login?next=/watchlist" className="text-accent underline">Sign in</Link> to see your list.
      </p>
    );
  if (!list) return <p className="text-white/50">Loading…</p>;

  return (
    <>
      {list.length === 0 ? (
        <p className="text-white/60">Nothing here yet. Add titles with “My List” on any title page.</p>
      ) : (
        <div className="grid grid-cols-2 justify-items-center gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {list.map((t) => <TitleCard key={t.slug} title={asTitle(t)} />)}
        </div>
      )}
      {history.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-5 text-xl font-semibold">Continue watching</h2>
          <div className="grid grid-cols-2 justify-items-center gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {history.map((h) => <TitleCard key={h.title.slug} title={asTitle(h.title)} />)}
          </div>
        </section>
      )}
    </>
  );
}
