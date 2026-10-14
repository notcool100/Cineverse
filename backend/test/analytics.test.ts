import { describe, expect, it } from "vitest";
import { dayKey, fillDays, lastDays, rankTitles, sumHash } from "../src/admin/analytics";

describe("analytics helpers", () => {
  it("lists the last N UTC days oldest first, crossing month boundaries", () => {
    expect(lastDays(3, new Date("2026-03-01T10:00:00Z"))).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
    expect(lastDays(1, new Date("2026-01-05T23:59:59Z"))).toEqual(["2026-01-05"]);
  });
  it("matches the Redis day key format", () => {
    expect(dayKey(new Date("2026-10-04T00:00:00Z"))).toBe("20261004");
  });
  it("fills gaps with zeros", () => {
    const days = ["2026-01-01", "2026-01-02", "2026-01-03"];
    expect(fillDays(days, new Map([["2026-01-02", 5]]))).toEqual([
      { date: "2026-01-01", value: 0 },
      { date: "2026-01-02", value: 5 },
      { date: "2026-01-03", value: 0 },
    ]);
  });
  it("sums a hash of string counts and ignores junk", () => {
    expect(sumHash({ a: "3", b: "4", c: "oops" })).toBe(7);
    expect(sumHash({})).toBe(0);
  });
  it("ranks by weighted activity and drops idle titles", () => {
    const out = rankTitles(
      [
        { id: "views", views: 10 },
        { id: "watched", watches: 4 }, // 12
        { id: "saved", saves: 3 }, // 6
        { id: "idle" },
      ],
      2,
    );
    expect(out.map((r) => r.id)).toEqual(["watched", "views"]);
  });
});
