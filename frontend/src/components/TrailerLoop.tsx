"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/** Muted, looping, chrome-less YouTube trailer; `cover` crops the 16:9 frame to fill a taller box. */
export function trailerSrc(key: string) {
  const id = encodeURIComponent(key);
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${id}&modestbranding=1&playsinline=1&rel=0&disablekb=1&iv_load_policy=3`;
}

/** True unless the visitor prefers reduced motion or has data saving on. */
export function useAutoplayAllowed() {
  return useSyncExternalStore(
    () => () => {},
    () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
      return !reduce && !saveData;
    },
    () => false,
  );
}

/** Hero banner trailer: fades in over the backdrop once the frame has loaded, with a delay so the page paints first. */
export function HeroTrailer({ trailerKey, title }: { trailerKey: string; title: string }) {
  const allowed = useAutoplayAllowed();
  const [start, setStart] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!allowed) return;
    const t = setTimeout(() => setStart(true), 1500);
    return () => clearTimeout(t);
  }, [allowed]);
  if (!allowed || !start) return null;
  return (
    <>
      {!hidden && (
        <div className={`pointer-events-none absolute inset-y-0 right-0 -z-10 hidden w-full overflow-hidden transition-opacity duration-1000 md:block lg:w-[78%] ${loaded ? "opacity-100" : "opacity-0"}`}>
          <iframe
            title={`${title} trailer`}
            src={trailerSrc(trailerKey)}
            allow="autoplay; encrypted-media"
            tabIndex={-1}
            aria-hidden
            onLoad={() => setLoaded(true)}
            className="absolute left-1/2 top-1/2 aspect-video h-[130%] min-w-full -translate-x-1/2 -translate-y-1/2 border-0"
          />
        </div>
      )}
      <button
        onClick={() => setHidden((h) => !h)}
        className="glass absolute bottom-6 right-5 z-10 hidden rounded-full px-3.5 py-1.5 text-xs md:block sm:right-10"
      >
        {hidden ? "Play trailer" : "Hide trailer"}
      </button>
    </>
  );
}
