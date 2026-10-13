import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isBlockedProvider } from "../src/admin/blocklist";
import { signUrl } from "../src/playback/playback.service";

describe("blocklist", () => {
  it("rejects unlicensed aggregators", () => {
    expect(isBlockedProvider("x", "X", "https://vidsrc.to/embed/{tmdbId}")).toBe(true);
    expect(isBlockedProvider("acme", "Acme", "https://acme.example/e/{tmdbId}")).toBe(false);
  });
});

describe("signUrl", () => {
  it("produces an expiring HMAC signature", () => {
    const { url } = signUrl("https://cdn.example/", "media/a/master.m3u8", "k", 1_000_000);
    const q = new URL(url).searchParams;
    expect(q.get("exp")).toBe("1300");
    expect(q.get("sig")).toBe(createHmac("sha256", "k").update("/media/a/master.m3u8:1300").digest("hex"));
  });
});
