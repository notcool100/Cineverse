import { describe, expect, it } from "vitest";
import { PIN_PATTERN, PinAttempts } from "../src/me/pin-guard";

describe("PIN pattern", () => {
  it("is exactly four digits", () => {
    expect(PIN_PATTERN.test("0042")).toBe(true);
    for (const bad of ["123", "12345", "12a4", "", " 123", "١٢٣٤"]) expect(PIN_PATTERN.test(bad)).toBe(false);
  });
});

describe("PinAttempts", () => {
  it("locks after the maximum failures and reports the wait", () => {
    const a = new PinAttempts(3, 60_000);
    expect(a.waitSeconds("k", 0)).toBe(0);
    a.fail("k", 0);
    a.fail("k", 1);
    expect(a.waitSeconds("k", 2)).toBe(0);
    a.fail("k", 2);
    expect(a.waitSeconds("k", 1000)).toBe(60); // locked until 60_002 ms, rounded up
    expect(a.waitSeconds("k", 60_002)).toBe(0);
  });
  it("is per key and a success resets the count", () => {
    const a = new PinAttempts(2, 60_000);
    a.fail("a", 0);
    a.succeed("a");
    a.fail("a", 1);
    expect(a.waitSeconds("a", 2)).toBe(0);
    a.fail("b", 0);
    a.fail("b", 1);
    expect(a.waitSeconds("b", 2)).toBeGreaterThan(0);
    expect(a.waitSeconds("a", 2)).toBe(0);
  });
  it("starts a fresh count after a lockout ends", () => {
    const a = new PinAttempts(2, 1000);
    a.fail("k", 0);
    a.fail("k", 1);
    expect(a.waitSeconds("k", 500)).toBeGreaterThan(0);
    a.fail("k", 2000); // lock over: this is failure #1 again, not an instant relock
    expect(a.waitSeconds("k", 2001)).toBe(0);
  });
});
