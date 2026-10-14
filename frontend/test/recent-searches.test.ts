import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_RECENT, pushRecent } from "../src/lib/recent-searches.ts";

test("newest first, case-insensitive de-dupe", () => {
  assert.deepEqual(pushRecent(["dune", "alien"], "Dune"), ["Dune", "alien"]);
  assert.deepEqual(pushRecent(["dune"], "  tom   hanks "), ["tom hanks", "dune"]);
});
test("ignores blank and one-character queries", () => {
  assert.deepEqual(pushRecent(["a b"], " "), ["a b"]);
  assert.deepEqual(pushRecent(["a b"], "x"), ["a b"]);
});
test("caps the list", () => {
  const many = Array.from({ length: MAX_RECENT }, (_, i) => `q${i}`);
  const out = pushRecent(many, "fresh");
  assert.equal(out.length, MAX_RECENT);
  assert.equal(out[0], "fresh");
  assert.ok(!out.includes(`q${MAX_RECENT - 1}`));
});
