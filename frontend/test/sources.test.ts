import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEntries, initialIndex, nextPlayable, type ProviderInfo } from "../src/lib/sources.ts";

const mk = (n: number, over: Partial<ProviderInfo> = {}): ProviderInfo => ({
  slug: `p${n}`, label: `P${n}`, noAds: false, order: n, state: "unconfigured", types: [], ...over,
});
const providers = Array.from({ length: 30 }, (_, i) => mk(i));
const yt = { id: "s1", kind: "YOUTUBE_OFFICIAL", label: "YouTube", priority: 5 };

test("renders own sources first, then all 30 providers in registry order", () => {
  const e = buildEntries([yt], [...providers].reverse());
  assert.equal(e.length, 31);
  assert.equal(e[0].id, "s1");
  assert.deepEqual(e.slice(1).map((x) => x.label), providers.map((p) => p.label));
});

test("unconfigured providers are not playable and are skipped", () => {
  const ps = providers.map((p) => (p.order === 3 ? { ...p, state: "enabled" as const, types: ["movie" as const] } : p));
  const e = buildEntries([], ps);
  assert.equal(nextPlayable(e, -1), 3);
  assert.equal(nextPlayable(e, 3), -1);
  assert.equal(initialIndex(e), 3);
});

test("provider without a template for the content type is disabled", () => {
  const ps = [mk(0, { state: "enabled", types: ["movie"] })];
  assert.equal(buildEntries([], ps, "SERIES")[0].state, "disabled");
  assert.equal(buildEntries([], ps, "MOVIE")[0].state, "enabled");
});

test("source switching: remembered label wins unless unplayable", () => {
  const ps = [mk(0, { state: "enabled", types: ["movie"] }), mk(1, { state: "enabled", types: ["movie"] }), mk(2)];
  const e = buildEntries([], ps);
  assert.equal(initialIndex(e, undefined, "P1"), 1);
  assert.equal(initialIndex(e, undefined, "P2"), 0);
  assert.equal(initialIndex(e, "provider:p1", "P0"), 1);
  assert.equal(nextPlayable(e, 0), 1);
});

test("probed providers are ordered fastest first; unprobed keep registry order after them", () => {
  const ps = [0, 1, 2, 3].map((n) => mk(n, { state: "enabled", types: ["movie"] }));
  const e = buildEntries([], ps, "MOVIE", { p2: 80, p1: 300 });
  assert.deepEqual(e.map((x) => x.label), ["P2", "P1", "P0", "P3"]);
  assert.equal(initialIndex(e), 0);
});
