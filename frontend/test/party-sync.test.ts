import { test } from "node:test";
import assert from "node:assert/strict";
import { DRIFT_TOLERANCE, describeSync, partyWatchUrl, planSync } from "../src/lib/party-sync.ts";

test("no action when already in sync", () => {
  assert.equal(planSync({ playing: true, position: 10 }, { playing: true, position: 10 + DRIFT_TOLERANCE - 0.1 }), null);
});
test("seeks only past the drift tolerance", () => {
  assert.deepEqual(planSync({ playing: true, position: 10 }, { playing: true, position: 20 }), { seek: 20 });
});
test("toggles play state", () => {
  assert.deepEqual(planSync({ playing: true, position: 5 }, { playing: false, position: 5 }), { play: false });
  assert.deepEqual(planSync({ playing: false, position: 5 }, { playing: true, position: 30 }), { seek: 30, play: true });
});
test("describes who did what and where", () => {
  assert.equal(describeSync("Sam", { playing: false, position: 125 }), "Sam paused at 2:05");
  assert.equal(describeSync(undefined, { playing: true, position: 3723 }), "Someone played at 1:02:03");
});
test("builds invite/navigation urls", () => {
  assert.equal(partyWatchUrl({ titleId: "dune", season: 1, episode: 2 }, "ABC123", true), "/watch/dune?season=1&episode=2&party=ABC123&nav=1");
  assert.equal(partyWatchUrl({ titleId: "dune" }, "ABC123"), "/watch/dune?party=ABC123");
  assert.equal(partyWatchUrl({ titleId: "dune", season: 2, episode: 3 }, null), "/watch/dune?season=2&episode=3");
  assert.equal(partyWatchUrl({ titleId: "dune" }), "/watch/dune");
});
