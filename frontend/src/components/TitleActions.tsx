"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Source, TitleType } from "@/lib/types";
import { buildEntries, isPlayable, type ProviderInfo } from "@/lib/sources";
import { getEmbedProviders } from "@/lib/client-api";
import { AddToList } from "./AddToList";
import { PlayGlyph } from "./Poster";
import { SourceSwitcher } from "./SourceSwitcher";
import { useUser } from "./useSession";
import { useRating } from "./useRating";
import { useWatchlist } from "./useWatchlist";

export function TitleActions({ titleId, titleName, sources, titleType }: { titleId: string; titleName: string; sources: Source[]; titleType?: TitleType }) {
  const user = useUser();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const ordered = buildEntries(sources, providers, titleType);
  const [sourceId, setSourceId] = useState(sources[0]?.id);
  useEffect(() => {
    if (!user) return;
    let live = true;
    getEmbedProviders().then((p) => live && setProviders(p)).catch(() => {});
    return () => {
      live = false;
    };
  }, [user]);
  const { saved, toggle: toggleList } = useWatchlist(titleId, `/title/${titleId}`);
  const playRef = useRef<HTMLAnchorElement>(null);
  const [pastHero, setPastHero] = useState(false);
  useEffect(() => {
    const el = playRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setPastHero(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, [sourceId]);
  const playable = !!sourceId && isPlayable(ordered.find((e) => e.id === sourceId));

  const { rating, rate } = useRating(titleId, `/title/${titleId}`);

  return (
    <>
      <div className="rise rise-3 relative z-20 mt-8 flex flex-wrap gap-3">
        {playable ? (
          <Link
            ref={playRef}
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
        <AddToList titleId={titleId} />
        {([1, -1] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => rate(v)}
            aria-pressed={rating === v}
            aria-label={v === 1 ? "I like this" : "Not for me"}
            title={v === 1 ? "I like this" : "Not for me"}
            className={`grid size-12 place-items-center rounded-full text-xl backdrop-blur-md transition ${rating === v ? "bg-white text-black" : "bg-white/20 hover:bg-white/30"}`}
          >
            <span aria-hidden>{v === 1 ? "👍" : "👎"}</span>
          </button>
        ))}
      </div>
      <div className="rise rise-3 mt-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">Watch from</p>
        <SourceSwitcher sources={ordered} selected={sourceId} onSelect={setSourceId} />
      </div>
      {playable && (
        <div
          aria-hidden={!pastHero}
          inert={!pastHero}
          className={`on-dark glass fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex items-center justify-between gap-3 rounded-2xl p-2 pl-4 transition duration-300 md:inset-x-auto md:bottom-5 md:left-1/2 md:w-[28rem] md:-translate-x-1/2 ${pastHero ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"}`}
        >
          <span className="truncate text-sm font-semibold">{titleName}</span>
          <Link
            href={`/watch/${titleId}?source=${sourceId}`}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-6 py-2.5 text-sm font-semibold text-black"
          >
            <PlayGlyph className="size-4" /> Play
          </Link>
        </div>
      )}
    </>
  );
}
