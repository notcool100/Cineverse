"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Title } from "@/lib/types";
import { HeroTrailer, useAutoplayAllowed } from "./TrailerLoop";
import { BackdropImage, PlayGlyph, posterStyle } from "./Poster";
import { useWatchlist } from "./useWatchlist";

const ROTATE_MS = 8000;

function Actions({ title }: { title: Title }) {
  const { saved, toggle } = useWatchlist(title.id, "/");
  return (
    <div className="mt-9 flex flex-wrap items-center gap-3">
      <Link
        href={`/watch/${title.id}`}
        className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-black transition hover:scale-[1.03] hover:bg-white/90"
      >
        <PlayGlyph className="size-4" /> Play
      </Link>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={saved}
        className="glass inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold transition hover:bg-white/15"
      >
        <span aria-hidden className="text-lg leading-none">{saved ? "✓" : "+"}</span> My List
      </button>
      <Link href={`/title/${title.id}`} className="glass inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold transition hover:bg-white/15">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6M12 7.5v.01" />
        </svg>
        Info
      </Link>
    </div>
  );
}

/** Full-bleed featured banner: crossfades through up to five titles, pausing while hovered, focused or manually paused. */
export function HeroCarousel({ titles }: { titles: Title[] }) {
  const motionOk = useAutoplayAllowed();
  const [index, setIndex] = useState(0);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [paused, setPaused] = useState(false);
  const rotating = motionOk && !paused && !hover && !focus && titles.length > 1;

  useEffect(() => {
    if (!rotating) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % titles.length), ROTATE_MS);
    return () => clearTimeout(t);
  }, [rotating, index, titles.length]);

  if (titles.length === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured titles"
      className="on-dark relative isolate h-[92vh] min-h-[34rem] overflow-hidden"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setFocus(false)}
    >
      {titles.map((t, i) => {
        const active = i === index;
        return (
          <div
            key={t.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${titles.length}`}
            aria-hidden={!active}
            inert={!active}
            className={`absolute inset-0 isolate flex items-end transition-opacity duration-1000 ${active ? "opacity-100" : "pointer-events-none opacity-0"}`}
          >
            <div className="absolute inset-0 -z-10" style={posterStyle(t)} />
            <div className="absolute inset-y-0 right-0 -z-10 w-full lg:w-[78%]">
              <BackdropImage title={t} priority={i === 0} />
            </div>
            {active && t.trailerKey && <HeroTrailer key={t.id} trailerKey={t.trailerKey} title={t.name} />}
            <div className="grain absolute inset-0 -z-10" aria-hidden />
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/90 from-20% via-black/50 via-45% to-transparent" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 from-3% via-black/20 via-35% to-black/10" />
            <div className="absolute inset-x-0 bottom-0 -z-10 h-24 bg-gradient-to-t from-background to-transparent" />

            <div className="mx-auto w-full max-w-7xl px-5 pb-28 pt-40 sm:px-10">
              <p className="glass-soft mb-5 inline-flex rounded-full border px-3.5 py-1 text-xs tracking-wide text-white/90">
                {i === 0 ? "Featured" : "Spotlight"} · {t.genres.slice(0, 3).join(" · ")}
              </p>
              <h1 className="max-w-2xl text-5xl font-extrabold leading-[1] tracking-tight drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)] sm:text-7xl lg:text-8xl">
                {t.name}
              </h1>
              <p className="mt-6 line-clamp-3 max-w-xl text-base leading-relaxed text-white/85 sm:text-lg">{t.overview}</p>
              <p className="mt-4 text-sm text-white/70">
                {[t.year || null, t.rating, t.runtimeMin ? `${t.runtimeMin} min` : null].filter(Boolean).join(" · ")}
              </p>
              {active && <Actions title={t} />}
            </div>
          </div>
        );
      })}

      {titles.length > 1 && (
        <div className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 md:left-auto md:right-10 md:translate-x-0">
          <div role="tablist" aria-label="Choose featured title" className="flex items-center gap-1">
            {titles.map((t, i) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={i === index}
                aria-label={`Show ${t.name}`}
                onClick={() => setIndex(i)}
                className="grid h-6 w-6 place-items-center"
              >
                <span className={`block h-1.5 rounded-full transition-all ${i === index ? "w-7 bg-white" : "w-1.5 bg-white/45"}`} />
              </button>
            ))}
          </div>
          {motionOk && (
            <button
              type="button"
              aria-label={paused ? "Resume automatic rotation" : "Pause automatic rotation"}
              aria-pressed={paused}
              onClick={() => setPaused((p) => !p)}
              className="glass grid size-8 place-items-center rounded-full text-white"
            >
              <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
                {paused ? <path d="M8 5.5v13l11-6.5z" /> : <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />}
              </svg>
            </button>
          )}
        </div>
      )}
    </section>
  );
}
