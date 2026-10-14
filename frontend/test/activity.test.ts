import { test } from "node:test";
import assert from "node:assert/strict";
import { dayLabel, groupByDay, parseEpisodeKey, watchedFraction } from "../src/lib/activity.ts";

const now = new Date(2026, 5, 15, 12, 0, 0); // Mon 15 Jun 2026, local
const at = (d: number, h = 9) => new Date(2026, 5, d, h).toISOString();

test("parses episode keys", () => {
  assert.deepEqual(parseEpisodeKey("S2E15"), { season: 2, episode: 15 });
  assert.equal(parseEpisodeKey(""), null);
  assert.equal(parseEpisodeKey("x"), null);
});
test("fraction watched, null without a duration", () => {
  assert.equal(watchedFraction({ positionSec: 30, durationSec: 120 }), 0.25);
  assert.equal(watchedFraction({ positionSec: 500, durationSec: 100 }), 1);
  assert.equal(watchedFraction({ positionSec: 0, durationSec: 0 }), null);
});
test("labels today, yesterday and older days", () => {
  assert.equal(dayLabel(at(15, 1), now), "Today");
  assert.equal(dayLabel(at(14, 23), now), "Yesterday");
  assert.match(dayLabel(at(10), now), /June 10/);
  assert.match(dayLabel(new Date(2025, 5, 10).toISOString(), now), /2025/);
});
test("groups newest-first rows by local day", () => {
  const rows = [{ updatedAt: at(15, 11) }, { updatedAt: at(15, 8) }, { updatedAt: at(14, 20) }, { updatedAt: at(2) }];
  const g = groupByDay(rows, now);
  assert.deepEqual(g.map((x) => [x.label.startsWith("June") || x.label.includes("June") ? "date" : x.label, x.rows.length]), [["Today", 2], ["Yesterday", 1], ["date", 1]]);
});
