"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { ACCENTS, DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from "@/lib/prefs";

let lastRaw: string | null | undefined;
let last: Prefs = DEFAULT_PREFS;
function snapshot(): Prefs {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem("cineora.prefs");
  } catch {}
  if (raw !== lastRaw) {
    lastRaw = raw;
    last = loadPrefs();
  }
  return last;
}
const subscribe = (cb: () => void) => {
  window.addEventListener("cineora-prefs", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("cineora-prefs", cb);
    window.removeEventListener("storage", cb);
  };
};
export const usePrefs = () => useSyncExternalStore(subscribe, snapshot, () => DEFAULT_PREFS);

/** Appearance popover: theme, accent colour, reduced motion. */
export function SettingsMenu() {
  const prefs = usePrefs();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const set = (p: Partial<Prefs>) => savePrefs({ ...prefs, ...p });

  return (
    <div ref={box} className="relative ml-1">
      <button
        type="button"
        aria-label="Appearance settings"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="grid size-9 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      </button>
      {open && (
        <div id={id} role="dialog" aria-label="Appearance" className="glass-menu absolute right-0 top-full z-50 mt-3 w-64 rounded-2xl p-4 text-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/45">Theme</p>
          <div role="radiogroup" aria-label="Theme" className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-white/8 p-1">
            {(["dark", "light"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={prefs.theme === t}
                onClick={() => set({ theme: t })}
                className={`rounded-lg py-1.5 capitalize ${prefs.theme === t ? "bg-white font-semibold text-black" : "text-white/70 hover:text-white"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/45">Accent colour</p>
          <div role="radiogroup" aria-label="Accent colour" className="mb-4 flex flex-wrap gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.value}
                type="button"
                role="radio"
                aria-checked={prefs.accent === a.value}
                aria-label={a.name}
                title={a.name}
                onClick={() => set({ accent: a.value })}
                className={`size-7 rounded-full ring-offset-2 ring-offset-[var(--background)] ${prefs.accent === a.value ? "ring-2 ring-white" : ""}`}
                style={{ background: a.value }}
              />
            ))}
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              Reduce motion
              <span className="block text-xs text-white/45">Also follows your system setting</span>
            </span>
            <input
              type="checkbox"
              checked={prefs.motion === "reduce"}
              onChange={(e) => set({ motion: e.target.checked ? "reduce" : "system" })}
              className="size-4 accent-[var(--accent)]"
            />
          </label>
        </div>
      )}
    </div>
  );
}
