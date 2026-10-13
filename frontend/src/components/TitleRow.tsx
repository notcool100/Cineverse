import type { Title } from "@/lib/types";
import { TitleCard } from "./TitleCard";

// Aligns the scroller's first card with the page gutter at any viewport width.
const gutter = "max(1.25rem, calc((100vw - 80rem) / 2 + 2.5rem))";

export function TitleRow({ heading, titles }: { heading: string; titles: Title[] }) {
  if (titles.length === 0) return null;
  return (
    <section aria-label={heading}>
      <h2
        className="mb-4 flex items-center gap-3 text-lg font-semibold tracking-tight"
        style={{ paddingInline: gutter }}
      >
        <span className="h-4 w-1 rounded-full bg-accent" aria-hidden />
        {heading}
      </h2>
      <div
        className="no-scrollbar flex snap-x gap-4 overflow-x-auto pb-6 pt-1"
        style={{ paddingInline: gutter, scrollPaddingInline: gutter }}
      >
        {titles.map((t) => (
          <TitleCard key={t.id} title={t} />
        ))}
      </div>
    </section>
  );
}
