import { describe, expect, it } from "vitest";
import { RESEND_COOLDOWN_MS, cooldownLeftMs, hashToken, isUsable, newToken } from "../src/auth/email-token";

describe("email tokens", () => {
  it("issues unique url-safe tokens whose stored value is a hash, not the token", () => {
    const a = newToken();
    const b = newToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(a.hash).toBe(hashToken(a.token));
    expect(a.hash).not.toContain(a.token);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("is usable once, before expiry", () => {
    const now = 1_000_000;
    expect(isUsable({ expiresAt: new Date(now + 1), usedAt: null }, now)).toBe(true);
    expect(isUsable({ expiresAt: new Date(now), usedAt: null }, now)).toBe(false);
    expect(isUsable({ expiresAt: new Date(now + 1000), usedAt: new Date(now - 1) }, now)).toBe(false);
  });
  it("tracks the resend cooldown", () => {
    const sent = new Date(1_000_000);
    expect(cooldownLeftMs(null)).toBe(0);
    expect(cooldownLeftMs(sent, 1_000_000)).toBe(RESEND_COOLDOWN_MS);
    expect(cooldownLeftMs(sent, 1_000_000 + RESEND_COOLDOWN_MS)).toBe(0);
  });
});
