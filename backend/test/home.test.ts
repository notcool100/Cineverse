import { describe, expect, it } from "vitest";
import { rankTop } from "../src/titles/home.service";

const t = (id: string, popularity: number) =>
  ({ id, popularity, voteCount: 100, releaseDate: new Date("2020-01-01"), backdropPath: "/b", overview: "x".repeat(60), sources: [] }) as never;

describe("rankTop", () => {
  it("puts titles with activity today first, most active first", () => {
    const pool = [t("quiet", 300), t("busy", 10), t("busier", 5)];
    const out = rankTop(pool, new Map([["busy", 4], ["busier", 9]])).map((x: { id: string }) => x.id);
    expect(out).toEqual(["busier", "busy", "quiet"]);
  });
  it("falls back to base quality when nothing happened today", () => {
    const out = rankTop([t("low", 1), t("high", 300)], new Map()).map((x: { id: string }) => x.id);
    expect(out).toEqual(["high", "low"]);
  });
});
