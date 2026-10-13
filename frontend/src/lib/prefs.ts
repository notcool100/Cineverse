// Per-device appearance preferences, applied as attributes on <html> (see THEME_SCRIPT for the pre-paint pass).
export type Theme = "dark" | "light";
export type Motion = "system" | "reduce";

export const ACCENTS = [
  { name: "Crimson", value: "#e50914" },
  { name: "Amber", value: "#d97706" },
  { name: "Emerald", value: "#059669" },
  { name: "Azure", value: "#2563eb" },
  { name: "Violet", value: "#7c3aed" },
  { name: "Rose", value: "#db2777" },
] as const;

export interface Prefs {
  theme: Theme;
  accent: string;
  motion: Motion;
}
export const DEFAULT_PREFS: Prefs = { theme: "dark", accent: ACCENTS[0].value, motion: "system" };
const KEY = "cineora.prefs";

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      theme: p.theme === "light" ? "light" : "dark",
      accent: typeof p.accent === "string" && /^#[0-9a-f]{6}$/i.test(p.accent) ? p.accent : DEFAULT_PREFS.accent,
      motion: p.motion === "reduce" ? "reduce" : "system",
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function applyPrefs(p: Prefs) {
  const el = document.documentElement;
  el.dataset.theme = p.theme;
  el.dataset.motion = p.motion;
  el.style.setProperty("--accent", p.accent);
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
  applyPrefs(p);
  window.dispatchEvent(new Event("cineora-prefs"));
}

/** Inlined in <head> so the saved theme/accent apply before first paint (no flash). */
export const THEME_SCRIPT = `try{var p=JSON.parse(localStorage.getItem("${KEY}")||"{}"),e=document.documentElement;if(p.theme==="light")e.dataset.theme="light";if(p.motion==="reduce")e.dataset.motion="reduce";if(/^#[0-9a-f]{6}$/i.test(p.accent))e.style.setProperty("--accent",p.accent)}catch(_){}`;
