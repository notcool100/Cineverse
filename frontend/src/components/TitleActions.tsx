"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Source } from "@/lib/types";
import { addToWatchlist, getWatchlist, removeFromWatchlist } from "@/lib/client-api";
import { PlayGlyph } from "./Poster";
import { SourceSwitcher } from "./SourceSwitcher";
import { useUser } from "./useSession";

export function TitleActions({ titleId, sources }: { titleId: string; sources: Source[] }) {
  const router = useRouter();
  const user = useUser();
  const ordered = [...sources].sort((a, b) => a.priority - b.priority);
  const [sourceId, setSourceId] = useState(ordered[0]?.id);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    let live = true;
    getWatchlist()
      .then((rows) => live && setSaved(rows.some((r) => r.title.slug === titleId)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [user, titleId]);

  async function toggleList() {
    if (!user) return router.push(`/login?next=/title/${titleId}`);
    const was = saved;
    setSaved(!was);
    try {
      await (was ? removeFromWatchlist(titleId) : addToWatchlist(titleId));
    } catch {
      setSaved(was);
    }
  }

  return (
    <>
      <div className="rise rise-3 mt-8 flex flex-wrap gap-3">
        {sourceId ? (
          <Link
            href={`/watch/${titleId}?source=${sourceId}`}
            className="inline-flex items-center gap-2.5 rounded-md bg-white px-8 py-3 text-base font-semibold text-black transition hover:bg-white/90"
          >
            <PlayGlyph className="size-5" /> Play
          </Link>
        ) : (
          <span className="rounded-md bg-white/20 px-8 py-3 text-base font-semibold text-white/60">Unavailable</span>
        )}
        <button
          type="button"
          onClick={toggleList}
          aria-pressed={saved}
          className="inline-flex items-center gap-2 rounded-md bg-white/20 px-7 py-3 text-base font-semibold backdrop-blur-md transition hover:bg-white/30"
        >
          <span aria-hidden className="text-xl leading-none">{saved ? "✓" : "+"}</span> My List
        </button>
      </div>
      <div className="rise rise-3 mt-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">Watch from</p>
        <SourceSwitcher sources={ordered} selected={sourceId} onSelect={setSourceId} />
      </div>
    </>
  );
}
