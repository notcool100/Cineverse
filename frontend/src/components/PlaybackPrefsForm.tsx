"use client";

import { useState } from "react";
import { saveProfilePrefs, SUBTITLE_SIZES, type ProfilePrefs } from "@/lib/profile-prefs";
import { useProfile } from "./useProfile";
import { useProfilePrefs } from "./useProfilePrefs";
import { useUser } from "./useSession";

const LANGS = ["en", "hi", "es", "fr", "de", "it", "pt", "ja", "ko", "zh", "ar", "ru", "ta", "te", "bn"];
const SIZE_LABEL = { small: "Small", medium: "Medium", large: "Large", xlarge: "Extra large" } as const;

const langName = (code: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
};

/** Playback settings stored on the active profile (not the device): subtitles, audio language, autoplay. */
export function PlaybackPrefsForm() {
  const user = useUser();
  const profile = useProfile();
  const prefs = useProfilePrefs();
  const [error, setError] = useState<string | null>(null);
  if (!user || !profile) return null;

  const set = (patch: Partial<ProfilePrefs>) => {
    setError(null);
    saveProfilePrefs(patch).catch((e) => setError(e instanceof Error ? e.message : "Couldn't save"));
  };
  const select = "w-full rounded-lg border border-white/10 bg-white/8 px-2 py-1.5 text-sm text-white outline-none focus:border-accent";
  const toggle = (k: "autoplayNext" | "autoplayPreviews" | "autoSkipIntro", label: string, hint?: string) => (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span>
        {label}
        {hint && <span className="block text-xs text-white/45">{hint}</span>}
      </span>
      <input type="checkbox" checked={prefs[k]} onChange={(e) => set({ [k]: e.target.checked })} className="size-4 accent-[var(--accent)]" />
    </label>
  );

  return (
    <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Playback · {profile.name}</p>
      {toggle("autoplayNext", "Autoplay next episode")}
      {toggle("autoSkipIntro", "Skip intros automatically", "When an episode has intro markers")}
      {toggle("autoplayPreviews", "Autoplay previews", "Trailers when hovering a title")}
      <label className="block text-xs text-white/55">
        Audio language
        <select value={prefs.audioLang} onChange={(e) => set({ audioLang: e.target.value })} className={`${select} mt-1`}>
          <option value="" className="bg-neutral-900">Default</option>
          {LANGS.map((l) => <option key={l} value={l} className="bg-neutral-900">{langName(l)}</option>)}
        </select>
      </label>
      <label className="block text-xs text-white/55">
        Subtitles
        <select value={prefs.subtitleLang} onChange={(e) => set({ subtitleLang: e.target.value })} className={`${select} mt-1`}>
          <option value="" className="bg-neutral-900">Off</option>
          {LANGS.map((l) => <option key={l} value={l} className="bg-neutral-900">{langName(l)}</option>)}
        </select>
      </label>
      <label className="block text-xs text-white/55">
        Subtitle size
        <select value={prefs.subtitleSize} onChange={(e) => set({ subtitleSize: e.target.value as ProfilePrefs["subtitleSize"] })} className={`${select} mt-1`}>
          {SUBTITLE_SIZES.map((s) => <option key={s} value={s} className="bg-neutral-900">{SIZE_LABEL[s]}</option>)}
        </select>
      </label>
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
