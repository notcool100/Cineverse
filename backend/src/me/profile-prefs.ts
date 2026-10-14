/** Per-profile playback preferences. Stored as JSON on Profile; anything unknown or malformed is dropped. */
export const SUBTITLE_SIZES = ["small", "medium", "large", "xlarge"] as const;
export type SubtitleSize = (typeof SUBTITLE_SIZES)[number];

export interface ProfilePrefs {
  /** Preferred audio language (ISO 639-1/2), "" = provider default. */
  audioLang: string;
  /** Subtitle language, "" = subtitles off. */
  subtitleLang: string;
  subtitleSize: SubtitleSize;
  /** Start the next episode automatically when one ends. */
  autoplayNext: boolean;
  /** Play muted trailer previews when hovering cards. */
  autoplayPreviews: boolean;
  /** Jump past the intro automatically when the episode has intro markers. */
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

/** Keeps only valid known fields from untrusted input. */
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

/** Defaults, then what is stored, then the patch. */
export const resolvePrefs = (stored: unknown, patch: unknown = {}): ProfilePrefs => ({ ...PROFILE_PREF_DEFAULTS, ...sanitizePrefs(stored), ...sanitizePrefs(patch) });
