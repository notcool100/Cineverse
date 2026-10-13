"use client";

import type { Source } from "@/lib/types";

export function SourceSwitcher({
  sources,
  selected,
  onSelect,
}: {
  sources: Source[];
  selected: string | undefined;
  onSelect: (id: string) => void;
}) {
  if (sources.length === 0) return <p className="text-white/50">No sources available.</p>;

  return (
    <div role="radiogroup" aria-label="Choose a source" className="flex flex-wrap gap-2">
      {sources.map((s) => {
        const active = s.id === selected;
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(s.id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              active
                ? "border-accent bg-accent text-white shadow-[0_0_24px_-4px_var(--accent)]"
                : "glass-soft text-white/75 hover:text-white"
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
