import { describe, expect, it } from "vitest";
import { FLAG_THRESHOLD, FLAG_WINDOW_MS, providerKey, providerSlugOf, shouldFlag } from "../src/reports/autoflag";

const now = Date.UTC(2026, 0, 10);
const at = (userId: string, agoMs = 0) => ({ userId, createdAt: new Date(now - agoMs) });

describe("shouldFlag", () => {
  it("needs the threshold of distinct viewers", () => {
    expect(FLAG_THRESHOLD).toBe(3);
    expect(shouldFlag([at("a"), at("b")], now)).toBe(false);
    expect(shouldFlag([at("a"), at("b"), at("c")], now)).toBe(true);
  });
  it("counts one viewer once however often they report", () => {
    expect(shouldFlag([at("a"), at("a"), at("a"), at("b")], now)).toBe(false);
  });
  it("ignores reports older than the window", () => {
    expect(shouldFlag([at("a"), at("b"), at("c", FLAG_WINDOW_MS + 1)], now)).toBe(false);
    expect(shouldFlag([at("a"), at("b"), at("c", FLAG_WINDOW_MS)], now)).toBe(true);
  });
});

describe("provider keys", () => {
  it("round-trips and rejects plain source ids", () => {
    expect(providerSlugOf(providerKey("cinezo"))).toBe("cinezo");
    expect(providerSlugOf("cmv87abc")).toBeNull();
  });
});
