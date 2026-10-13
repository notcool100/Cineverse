"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Title } from "@/lib/types";
import { TitleCard } from "./TitleCard";

// Aligns the scroller's first card with the page gutter at any viewport width.
const gutter = "max(1.25rem, calc((100vw - 80rem) / 2 + 2.5rem))";

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={dir === "left" ? "m15 6-6 6 6 6" : "m9 6 6 6-6 6"} />
    </svg>
  );
}

/**
 * Horizontal carousel. Native overflow scrolling gives swipe/trackpad + scroll-snap on touch;
 * the arrow buttons page by one viewport, and the cards inside remain ordinary tab stops.
 */
export function TitleRow({ heading, titles }: { heading: string; titles: Title[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    measure();
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, titles.length]);

  if (titles.length === 0) return null;

  const page = (dir: -1 | 1) => scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.85, behavior: "smooth" });
  const arrow = (dir: "left" | "right") => {
    const hidden = dir === "left" ? edge.start : edge.end;
    return (
      <button
        type="button"
        aria-label={`Scroll ${heading} ${dir}`}
        tabIndex={hidden ? -1 : 0}
        onClick={() => page(dir === "left" ? -1 : 1)}
        className={`on-dark glass absolute top-[calc(50%-1.5rem)] z-10 hidden size-11 -translate-y-1/2 place-items-center rounded-full text-white opacity-0 transition hover:bg-white/20 focus-visible:opacity-100 group-hover/row:opacity-100 md:grid ${dir === "left" ? "left-2" : "right-2"} ${hidden ? "pointer-events-none !opacity-0" : ""}`}
      >
        <Chevron dir={dir} />
      </button>
    );
  };

  return (
    <section aria-label={heading} className="group/row relative">
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold tracking-tight" style={{ paddingInline: gutter }}>
        <span className="h-4 w-1 rounded-full bg-accent" aria-hidden />
        {heading}
      </h2>
      <div className="relative">
        {arrow("left")}
        {arrow("right")}
        <div
          ref={scroller}
          onScroll={measure}
          className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-6 pt-1 [-webkit-overflow-scrolling:touch]"
          style={{ paddingInline: gutter, scrollPaddingInline: gutter }}
        >
          {titles.map((t) => (
            <TitleCard key={t.id} title={t} />
          ))}
        </div>
      </div>
    </section>
  );
}
