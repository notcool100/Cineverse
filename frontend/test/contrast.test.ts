import assert from "node:assert/strict";
import { test } from "node:test";
import { CARD_SCRIM_ALPHA, contrastRatio, hexToRgb, minScrimAlpha } from "../src/lib/contrast.ts";

test("contrastRatio matches known WCAG values", () => {
  assert.equal(Math.round(contrastRatio([0, 0, 0], [255, 255, 255])), 21);
  assert.equal(contrastRatio([255, 255, 255], [255, 255, 255]), 1);
});

test("card overlay scrim keeps white text AA-readable even over a pure-white poster", () => {
  assert.ok(CARD_SCRIM_ALPHA >= minScrimAlpha(4.5), `scrim ${CARD_SCRIM_ALPHA} < required ${minScrimAlpha(4.5)}`);
});

test("accent colours offered in settings stay AA-readable as white-on-accent buttons or large text", () => {
  for (const hex of ["#e50914", "#d97706", "#059669", "#2563eb", "#7c3aed", "#db2777"]) {
    // 3:1 is the WCAG bar for large/bold UI text, which is how accent fills are used.
    const r = contrastRatio([255, 255, 255], hexToRgb(hex));
    assert.ok(r >= 3, `${hex} only ${r.toFixed(2)}:1 against white`);
  }
});
