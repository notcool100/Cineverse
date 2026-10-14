import { describe, expect, it } from "vitest";
import { affinityScore, buildAffinity, matchPercent } from "../src/titles/affinity";

const mk = (id: string, genres: string[], language = "en") => ({
  id, genres, language, popularity: 50, voteCount: 500, releaseDate: new Date("2020-01-01"), backdropPath: "/b", overview: "x".repeat(60), sources: [],
});
const scifi = mk("a", ["Sci-Fi", "Action"]);
const romance = mk("b", ["Romance"]);
const scifi2 = mk("c", ["Sci-Fi"]);

describe("match %", () => {
  it("is null with no taste data", () => {
    expect(matchPercent(buildAffinity([], [], []), scifi)).toBeNull();
  });
  it("scores titles in watched genres above unrelated ones", () => {
    const aff = buildAffinity([], [{ titleId: "a", title: scifi }], []);
    expect(matchPercent(aff, scifi2)!).toBeGreaterThan(matchPercent(aff, romance)!);
    expect(affinityScore(aff, scifi2)).toBeGreaterThan(affinityScore(aff, romance));
  });
  it("is 99 for liked and hidden for disliked titles", () => {
    const aff = buildAffinity([{ titleId: "a", title: scifi, value: 1 }, { titleId: "b", title: romance, value: -1 }], [], []);
    expect(matchPercent(aff, scifi)).toBe(99);
    expect(matchPercent(aff, romance)).toBeNull();
  });
  it("stays within 1..98 for non-liked titles", () => {
    const aff = buildAffinity([], [{ titleId: "a", title: scifi }], []);
    const pct = matchPercent(aff, scifi2)!;
    expect(pct).toBeGreaterThanOrEqual(1);
    expect(pct).toBeLessThanOrEqual(98);
  });
  it("penalises genres the user disliked", () => {
    const base = buildAffinity([], [{ titleId: "a", title: scifi }], []);
    const withDislike = buildAffinity([{ titleId: "b", title: mk("b", ["Sci-Fi", "Horror"]), value: -1 }], [{ titleId: "a", title: scifi }], []);
    expect(matchPercent(withDislike, scifi2)!).toBeLessThan(matchPercent(base, scifi2)!);
  });
});
