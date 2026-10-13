"use client";

import { useState } from "react";
import { filterByLanguage, languagesOf, type PickerEntry } from "@/lib/sources";

const langName = (code: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
};

export function SourceSwitcher({
  sources,
  selected,
  onSelect,
}: {
  sources: PickerEntry[];
  selected: string | undefined;
  onSelect: (id: string) => void;
}) {
  const [lang, setLang] = useState<string | null>(null);
  if (sources.length === 0) return <p className="text-white/50">No sources available.</p>;

  const langs = languagesOf(sources);
  const shown = filterByLanguage(sources, lang);

  return (
    <div className="space-y-3">
      {langs.length > 0 && (
        <div role="group" aria-label="Filter servers by language" className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-white/50">Language</span>
          {[null, ...langs].map((l) => (
            <button
              key={l ?? "all"}
              type="button"
              aria-pressed={lang === l}
              onClick={() => setLang(l)}
              className={`rounded-full border px-3 py-1 transition ${lang === l ? "border-accent bg-accent text-white" : "glass-soft text-white/75 hover:text-white"}`}
            >
              {l ? langName(l) : "All"}
            </button>
          ))}
        </div>
      )}
      <div role="radiogroup" aria-label="Choose a source" className="flex flex-wrap gap-2">
        {shown.map((s) => {
          const active = s.id === selected;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={s.state !== "enabled"}
              title={s.state === "unconfigured" ? "Not configured" : s.state === "disabled" ? "Disabled" : s.languages?.length ? s.languages.map(langName).join(", ") : undefined}
              onClick={() => onSelect(s.id)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${s.state !== "enabled" ? "cursor-not-allowed opacity-40 " : ""}${
                active
                  ? "border-accent bg-accent text-white shadow-[0_0_24px_-4px_var(--accent)]"
                  : "glass-soft text-white/75 hover:text-white"
              }`}
            >
              {s.label}
              {s.state === "enabled" && !!s.languages?.length && (
                <span className="ml-1.5 text-xs uppercase opacity-70">· {s.languages.join(" ")}</span>
              )}
              {s.state !== "enabled" && <span className="ml-1.5 text-xs">· {s.state === "unconfigured" ? "not configured" : "disabled"}</span>}
            </button>
          );
        })}
        {shown.length === 0 && <p className="text-white/50">No server offers that language.</p>}
      </div>
    </div>
  );
}
