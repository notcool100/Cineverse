"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import type { Title } from "@/lib/types";
import { PlayGlyph, blurData, posterStyle } from "./Poster";
import { trailerSrc } from "./TrailerLoop";
import { MatchLabel } from "./MatchChip";
import { useRating } from "./useRating";
import { useWatchlist } from "./useWatchlist";

const MARGIN = 12;
const runtime = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

/**
 * Netflix-style expanded card: rendered in a portal (so the row scroller can't clip it), centred on the
 * card that opened it and clamped to the viewport. Trailer, match %, quick actions and genres.
 */
export function HoverCard({
  title,
  anchor,
  href,
  trailer,
  onEnter,
  onLeave,
}: {
  title: Title;
  anchor: DOMRect;
  href: string;
  /** Play the trailer in the media area (autoplay allowed and a trailer exists). */
  trailer: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  const width = Math.min(Math.max(anchor.width * 1.7, 288), window.innerWidth - MARGIN * 2);
  const { saved, toggle } = useWatchlist(title.id, `/title/${title.id}`);
  const { rating, rate } = useRating(title.id, `/title/${title.id}`);

  // Measure once the content is laid out, then clamp into the viewport.
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    const left = Math.min(Math.max(anchor.left + anchor.width / 2 - width / 2, MARGIN), window.innerWidth - width - MARGIN);
    const top = Math.min(Math.max(anchor.top + anchor.height / 2 - h / 2, MARGIN), Math.max(MARGIN, window.innerHeight - h - MARGIN));
    setPos({ left, top });
  }, [anchor, width]);

  useEffect(() => {
    const close = () => onLeave();
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("scroll", close, { capture: true, passive: true });
    window.addEventListener("resize", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", key);
    };
  }, [onLeave]);

  const art = title.backdrop || title.poster;
  const btn = "grid size-9 place-items-center rounded-full border border-white/40 bg-black/40 text-base transition hover:border-white hover:bg-white/15";

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`${title.name} preview`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="on-dark hovercard-in fixed z-[70] overflow-hidden rounded-xl border border-white/12 bg-[#141418] shadow-2xl shadow-black/80"
      style={{ width, left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
    >
      <div className="relative aspect-video w-full bg-black" style={posterStyle(title)}>
        {art && (
          <Image src={art} alt="" fill sizes="340px" placeholder="blur" blurDataURL={blurData(title.accent[1])} className="object-cover" />
        )}
        {trailer && title.trailerKey && (
          <iframe
            title={`${title.name} trailer`}
            src={trailerSrc(title.trailerKey)}
            allow="autoplay; encrypted-media"
            tabIndex={-1}
            aria-hidden
            onLoad={() => setFrameReady(true)}
            className={`pointer-events-none absolute left-1/2 top-1/2 aspect-video h-[118%] -translate-x-1/2 -translate-y-1/2 border-0 transition-opacity duration-700 ${frameReady ? "opacity-100" : "opacity-0"}`}
          />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#141418] to-transparent" />
        <p className="absolute bottom-2 left-3 right-3 truncate text-base font-bold drop-shadow">{title.name}</p>
      </div>
      <div className="space-y-2.5 p-3">
        <div className="flex items-center gap-2">
          <Link href={href} aria-label={title.resume ? `Resume ${title.name}` : `Play ${title.name}`} className="grid size-9 place-items-center rounded-full bg-white text-black transition hover:bg-white/85">
            <PlayGlyph className="ml-0.5 size-4" />
          </Link>
          <button type="button" onClick={toggle} aria-pressed={saved} aria-label={saved ? "Remove from My List" : "Add to My List"} title={saved ? "Remove from My List" : "Add to My List"} className={btn}>
            <span aria-hidden>{saved ? "✓" : "+"}</span>
          </button>
          {([1, -1] as const).map((v) => (
            <button key={v} type="button" onClick={() => rate(v)} aria-pressed={rating === v} aria-label={v === 1 ? "I like this" : "Not for me"} title={v === 1 ? "I like this" : "Not for me"} className={`${btn} ${rating === v ? "!border-white !bg-white/25" : ""}`}>
              <span aria-hidden className="text-sm">{v === 1 ? "👍" : "👎"}</span>
            </button>
          ))}
          <Link href={`/title/${title.id}`} aria-label={`More info about ${title.name}`} title="More info" className={`${btn} ml-auto`}>
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </Link>
        </div>
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-white/70">
          <MatchLabel slug={title.id} className="text-sm" />
          {title.rating && title.rating !== "NR" && <span className="rounded border border-white/40 px-1.5 py-px text-[11px]">{title.rating}</span>}
          {title.runtimeMin > 0 && <span>{runtime(title.runtimeMin)}</span>}
          {title.type === "SERIES" && <span>Series</span>}
          {title.year > 0 && <span>{title.year}</span>}
        </p>
        {title.genres.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-white/85">
            {title.genres.slice(0, 3).map((g, i) => (
              <span key={g} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden className="text-white/35">•</span>}
                {g}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
