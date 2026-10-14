import { test } from "node:test";
import assert from "node:assert/strict";
import { PROFILE_PREF_DEFAULTS, resolvePrefs, sanitizePrefs } from "../src/lib/profile-prefs-core.ts";

test("defaults when nothing is stored", () => {
  assert.deepEqual(resolvePrefs(null), PROFILE_PREF_DEFAULTS);
});
test("drops unknown keys and invalid values", () => {
  assert.deepEqual(sanitizePrefs({ subtitleSize: "huge", audioLang: "ENGLISH", autoplayNext: "yes", x: 1, subtitleLang: "es" }), { subtitleLang: "es" });
});
test("patch layers over stored values", () => {
  assert.deepEqual(resolvePrefs({ audioLang: "hi", autoplayNext: false }, { subtitleSize: "large" }), {
    ...PROFILE_PREF_DEFAULTS,
    audioLang: "hi",
    autoplayNext: false,
    subtitleSize: "large",
  });
});
