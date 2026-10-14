// Per-profile playback preferences: types, defaults and validation. No imports so it is unit-testable.
// Mirrors backend/src/me/profile-prefs.ts.
export const SUBTITLE_SIZES = ["small", "medium", "large", "xlarge"] as const;
export type SubtitleSize = (typeof SUBTITLE_SIZES)[number];

export interface ProfilePrefs {
  /** Preferred audio language code; "" = provider default. */
  audioLang: string;
  /** Subtitle language code; "" = subtitles off. */
  subtitleLang: string;
  subtitleSize: SubtitleSize;
  autoplayNext: boolean;
  autoplayPreviews: boolean;
  autoSkipIntro: boolean;
}

export const PROFILE_PREF_DEFAULTS: ProfilePrefs = {
  audioLang: "",
  subtitleLang: "",
  subtitleSize: "medium",
  autoplayNext: true,
  autoplayPreviews: true,
  autoSkipIntro: false,
};

const LANG = /^(|[a-z]{2,3})$/;

export function sanitizePrefs(input: unknown): Partial<ProfilePrefs> {
  if (typeof input !== "object" || input === null) return {};
  const i = input as Record<string, unknown>;
  const out: Partial<ProfilePrefs> = {};
  if (typeof i.audioLang === "string" && LANG.test(i.audioLang)) out.audioLang = i.audioLang;
  if (typeof i.subtitleLang === "string" && LANG.test(i.subtitleLang)) out.subtitleLang = i.subtitleLang;
  if (typeof i.subtitleSize === "string" && (SUBTITLE_SIZES as readonly string[]).includes(i.subtitleSize)) out.subtitleSize = i.subtitleSize as SubtitleSize;
  for (const k of ["autoplayNext", "autoplayPreviews", "autoSkipIntro"] as const) if (typeof i[k] === "boolean") out[k] = i[k];
  return out;
}

export const resolvePrefs = (stored: unknown, patch: unknown = {}): ProfilePrefs => ({ ...PROFILE_PREF_DEFAULTS, ...sanitizePrefs(stored), ...sanitizePrefs(patch) });

/** Share of the default cue size, for `video::cue { font-size }`. */
export const SUBTITLE_SCALE: Record<SubtitleSize, number> = { small: 0.8, medium: 1, large: 1.35, xlarge: 1.8 };
