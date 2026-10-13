"use client";

import type { PickerEntry } from "@/lib/sources";

export function SourceSwitcher({
  sources,
  selected,
  onSelect,
}: {
  sources: PickerEntry[];
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
            disabled={s.state !== "enabled"}
            title={s.state === "unconfigured" ? "Not configured" : s.state === "disabled" ? "Disabled" : undefined}
            onClick={() => onSelect(s.id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${s.state !== "enabled" ? "cursor-not-allowed opacity-40 " : ""}${
              active
                ? "border-accent bg-accent text-white shadow-[0_0_24px_-4px_var(--accent)]"
                : "glass-soft text-white/75 hover:text-white"
            }`}
          >
            {s.label}
            {s.state !== "enabled" && <span className="ml-1.5 text-xs">· {s.state === "unconfigured" ? "not configured" : "disabled"}</span>}
          </button>
        );
      })}
    </div>
  );
}
