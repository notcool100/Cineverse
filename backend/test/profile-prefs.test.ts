import { describe, expect, it } from "vitest";
import { PROFILE_PREF_DEFAULTS, resolvePrefs, sanitizePrefs } from "../src/me/profile-prefs";

describe("profile prefs", () => {
  it("defaults when nothing is stored", () => {
    expect(resolvePrefs(null)).toEqual(PROFILE_PREF_DEFAULTS);
    expect(resolvePrefs(undefined, undefined)).toEqual(PROFILE_PREF_DEFAULTS);
  });
  it("drops unknown keys and invalid values", () => {
    expect(sanitizePrefs({ subtitleSize: "gigantic", audioLang: "ENGLISH", autoplayNext: "yes", evil: 1, subtitleLang: "es" })).toEqual({ subtitleLang: "es" });
    expect(sanitizePrefs("nope")).toEqual({});
    expect(sanitizePrefs(null)).toEqual({});
  });
  it("accepts empty-string languages (meaning off / default)", () => {
    expect(sanitizePrefs({ audioLang: "", subtitleLang: "" })).toEqual({ audioLang: "", subtitleLang: "" });
  });
  it("patches over stored values without losing the rest", () => {
    const stored = { audioLang: "hi", autoplayNext: false };
    const next = resolvePrefs(stored, { subtitleSize: "large" });
    expect(next).toEqual({ ...PROFILE_PREF_DEFAULTS, audioLang: "hi", autoplayNext: false, subtitleSize: "large" });
  });
  it("ignores a corrupt stored blob", () => {
    expect(resolvePrefs([1, 2, 3])).toEqual(PROFILE_PREF_DEFAULTS);
    expect(resolvePrefs({ autoplayPreviews: 5 })).toEqual(PROFILE_PREF_DEFAULTS);
  });
});
