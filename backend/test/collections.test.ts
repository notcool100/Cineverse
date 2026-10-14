import { describe, expect, it } from "vitest";
import { COLLECTIONS, collectionByKey, collectionWhere } from "../src/titles/collections";

describe("collections", () => {
  it("have unique keys, a title, a blurb and at least one genre rule", () => {
    const keys = COLLECTIONS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of COLLECTIONS) {
      expect(c.title).toBeTruthy();
      expect(c.blurb).toBeTruthy();
      expect(c.any.length).toBeGreaterThan(0);
      expect(c.key).toMatch(/^[a-z0-9-]+$/);
    }
  });
  it("never both require and exclude the same genre", () => {
    for (const c of COLLECTIONS) for (const g of c.none ?? []) expect(c.any).not.toContain(g);
  });
  it("builds a where with hasSome and an optional NOT", () => {
    const feel = collectionWhere(collectionByKey("feel-good")!);
    expect(feel.genres).toEqual({ hasSome: ["Comedy", "Family", "Romance"] });
    expect(feel.NOT).toEqual({ genres: { hasSome: ["Horror", "Thriller", "War", "Crime"] } });
    expect(collectionWhere(collectionByKey("after-dark")!).NOT).toBeUndefined();
  });
  it("looks collections up by key", () => {
    expect(collectionByKey("adrenaline")?.title).toBe("Adrenaline");
    expect(collectionByKey("nope")).toBeUndefined();
  });
});
