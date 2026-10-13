"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Title } from "@/lib/types";
import { trailerSrc, useAutoplayAllowed } from "./TrailerLoop";
import { PlayGlyph, PosterImage, posterStyle } from "./Poster";

const HOVER_MS = 700;
const LONG_PRESS_MS = 500;

export function TitleCard({ title }: { title: Title }) {
  const router = useRouter();
  const allowed = useAutoplayAllowed();
  const [preview, setPreview] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const longPressed = useRef(false);
  const canPreview = allowed && !!title.trailerKey;
  const href = title.resume ? `/watch/${title.id}${title.resumeSeason ? `?season=${title.resumeSeason}&episode=${title.resumeEpisode}` : ""}` : `/title/${title.id}`;
  // Warm the destination as soon as intent shows (hover/focus), ahead of the in-viewport prefetch.
  const warm = () => router.prefetch(href);
  const arm = (ms: number) => {
    if (!canPreview) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPreview(true), ms);
  };
  const disarm = () => {
    clearTimeout(timer.current);
    setPreview(false);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  // After a long-press the preview stays up until the next touch elsewhere.
  useEffect(() => {
    if (!preview || !longPressed.current) return;
    const off = () => {
      longPressed.current = false;
      setPreview(false);
    };
    const t = setTimeout(() => document.addEventListener("touchstart", off, { once: true }), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("touchstart", off);
    };
  }, [preview]);

  return (
    <Link
      onMouseEnter={() => {
        warm();
        arm(HOVER_MS);
      }}
      onMouseLeave={disarm}
      onFocus={() => {
        warm();
        arm(HOVER_MS);
      }}
      onBlur={disarm}
      onTouchStart={() => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          longPressed.current = true;
          setPreview(true);
        }, LONG_PRESS_MS);
      }}
      onTouchEnd={() => clearTimeout(timer.current)}
      onTouchMove={() => clearTimeout(timer.current)}
      onContextMenu={(e) => canPreview && e.preventDefault()}
      onClick={(e) => {
        if (longPressed.current) e.preventDefault();
      }}
      href={href}
      aria-label={title.resume ? `Resume ${title.name}` : title.name}
      className="on-dark cv-card group relative block aspect-[2/3] w-40 shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 shadow-lg shadow-black/50 transition duration-300 hover:-translate-y-1.5 hover:border-white/30 hover:shadow-2xl hover:shadow-black/70 sm:w-48"
      style={posterStyle(title)}
    >
      <PosterImage
        title={title}
        sizes="(min-width: 640px) 192px, 160px"
        className="transition duration-500 group-hover:scale-105"
      />
      {preview && title.trailerKey && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden bg-black">
          <iframe
            title={`${title.name} preview`}
            src={trailerSrc(title.trailerKey)}
            allow="autoplay; encrypted-media"
            tabIndex={-1}
            aria-hidden
            className="absolute left-1/2 top-1/2 aspect-video h-full -translate-x-1/2 -translate-y-1/2 scale-[1.02] border-0"
          />
        </div>
      )}
      <div className="absolute inset-0 bg-black/0 transition duration-300 group-hover:bg-black/45" />
      <span className="glass absolute left-1/2 top-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 scale-75 place-items-center rounded-full text-white opacity-0 transition duration-300 group-hover:scale-100 group-hover:opacity-100">
        <PlayGlyph className="ml-0.5 size-5" />
      </span>
      {/* Scrim: via-black/70 must stay >= CARD_SCRIM_ALPHA in lib/contrast.ts (checked by test/contrast.test.ts). */}
      <div className="absolute inset-x-0 bottom-0 translate-y-1 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-3.5 pt-16 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100">
        <p className="text-sm font-semibold leading-tight">{title.name}</p>
        <p className="mt-1 text-xs text-white/80">
          {title.resume ? (title.resumeSeason ? `Resume S${title.resumeSeason}·E${title.resumeEpisode}` : "Resume") : `${title.year} · ${title.genres[0]}`}
        </p>
      </div>
      {typeof title.progress === "number" && (
        <div
          role="progressbar"
          aria-label="Watched"
          aria-valuenow={Math.round(title.progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="absolute inset-x-3 bottom-2.5 h-1 overflow-hidden rounded-full bg-white/25"
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(3, Math.min(100, title.progress * 100))}%` }} />
        </div>
      )}
    </Link>
  );
}
