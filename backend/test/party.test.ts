import { describe, expect, it } from "vitest";
import { PartyService, RateLimiter, cleanChat, isReaction, MAX_CHAT_LENGTH, CHAT_HISTORY } from "../src/party/party.service";

describe("cleanChat", () => {
  it("trims and rejects empty or oversized messages", () => {
    expect(cleanChat("  hi there ")).toBe("hi there");
    expect(cleanChat("   ")).toBeUndefined();
    expect(cleanChat("x".repeat(MAX_CHAT_LENGTH + 1))).toBeUndefined();
    expect(cleanChat("x".repeat(MAX_CHAT_LENGTH))).toHaveLength(MAX_CHAT_LENGTH);
    expect(cleanChat(42)).toBeUndefined();
  });
  it("replaces control characters", () => {
    expect(cleanChat("a\u0000b\nc")).toBe("a b c");
  });
});

describe("isReaction", () => {
  it("only accepts the whitelist", () => {
    expect(isReaction("🔥")).toBe(true);
    expect(isReaction("💣")).toBe(false);
    expect(isReaction(undefined)).toBe(false);
  });
});

describe("RateLimiter", () => {
  it("allows up to the limit per window, per key", () => {
    const rl = new RateLimiter(2, 1000);
    expect(rl.allow("a", 0)).toBe(true);
    expect(rl.allow("a", 10)).toBe(true);
    expect(rl.allow("a", 20)).toBe(false);
    expect(rl.allow("b", 20)).toBe(true);
    expect(rl.allow("a", 1001)).toBe(true);
  });
});

describe("PartyService chat history", () => {
  it("keeps only the latest messages", () => {
    const svc = new PartyService();
    const room = svc.create("t");
    for (let i = 0; i < CHAT_HISTORY + 5; i++) svc.addChat(room, { id: String(i), from: "s", name: "n", text: String(i), at: i });
    expect(room.chat).toHaveLength(CHAT_HISTORY);
    expect(room.chat[0].text).toBe("5");
  });
  it("snapshot extrapolates position while playing", () => {
    const svc = new PartyService();
    const room = svc.create("t");
    room.state = { playing: true, position: 10, at: Date.now() - 5000 };
    expect(svc.snapshot(room).position).toBeGreaterThanOrEqual(14.9);
  });
});
