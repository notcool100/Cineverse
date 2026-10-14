import { describe, expect, it } from "vitest";
import { keyPeople, peopleOverlap, relatedScore, type RelatedTitle } from "../src/titles/related-score";

const credits = (cast: string[], directors: string[] = []) => ({
  cast: cast.map((name) => ({ name })),
  crew: directors.map((name) => ({ name, job: "Director" })),
});
const t = (id: string, o: Partial<RelatedTitle> = {}): RelatedTitle => ({ id, type: "MOVIE", genres: ["Drama"], language: "en", year: 2010, popularity: 50, voteCount: 500, ...o });

describe("keyPeople", () => {
  it("takes top-billed cast and directors/creators, de-duplicated", () => {
    const c = { cast: [{ name: "A" }, { name: "B" }, { name: "C" }], crew: [{ name: "D", job: "Director" }, { name: "E", job: "Editor" }, { name: "A", job: "Creator" }] };
    expect(keyPeople(c, 2)).toEqual(["A", "B", "D"]);
  });
  it("tolerates missing or malformed credits", () => {
    expect(keyPeople(null)).toEqual([]);
    expect(keyPeople({ cast: "nope" })).toEqual([]);
  });
});

describe("peopleOverlap", () => {
  it("is 0 without shared people and saturates at the cap", () => {
    expect(peopleOverlap(["A", "B", "C", "D"], credits(["X"]))).toBe(0);
    expect(peopleOverlap(["A", "B", "C", "D"], credits(["A", "B", "C"]))).toBe(1);
    expect(peopleOverlap(["A", "B", "C", "D"], credits(["A"]))).toBeCloseTo(1 / 3);
    expect(peopleOverlap([], credits(["A"]))).toBe(0);
  });
  it("counts crew too", () => {
    expect(peopleOverlap(["Dir"], credits([], ["Dir"]))).toBe(1);
  });
});

describe("relatedScore", () => {
  const seed = t("seed", { credits: credits(["A", "B", "C"]) });
  it("ranks a title with the same cast above an otherwise identical stranger", () => {
    const people = keyPeople(seed.credits);
    const same = t("same", { credits: credits(["A", "B"]) });
    const other = t("other", { credits: credits(["Z"]) });
    expect(relatedScore(seed, same, { seedPeople: people, collab: 0 })).toBeGreaterThan(relatedScore(seed, other, { seedPeople: people, collab: 0 }));
  });
  it("prefers shared genres and the same language", () => {
    const s = t("s", { genres: ["Sci-Fi", "Action"] });
    const close = t("c", { genres: ["Sci-Fi", "Action"] });
    const far = t("f", { genres: ["Romance"], language: "fr" });
    expect(relatedScore(s, close, { seedPeople: [], collab: 0 })).toBeGreaterThan(relatedScore(s, far, { seedPeople: [], collab: 0 }));
  });
  it("stays within 0..1", () => {
    const best = relatedScore(seed, t("b", { credits: seed.credits, popularity: 1e6, voteCount: 1e6 }), { seedPeople: keyPeople(seed.credits), collab: 1 });
    expect(best).toBeLessThanOrEqual(1);
    expect(best).toBeGreaterThan(0.5);
  });
});
