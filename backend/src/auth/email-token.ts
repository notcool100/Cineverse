import { createHash, randomBytes } from "node:crypto";

export const VERIFY_TTL_MS = 3 * 24 * 3600_000;
export const RESET_TTL_MS = 60 * 60_000;
/** A new verification email is refused until this long after the previous one. */
export const RESEND_COOLDOWN_MS = 60_000;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** A fresh URL-safe token and the hash to store for it. */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

/** A token can be used once, before it expires. */
export function isUsable(rec: { expiresAt: Date; usedAt: Date | null }, now = Date.now()): boolean {
  return !rec.usedAt && rec.expiresAt.getTime() > now;
}

export function cooldownLeftMs(lastSentAt: Date | null | undefined, now = Date.now()): number {
  return lastSentAt ? Math.max(0, lastSentAt.getTime() + RESEND_COOLDOWN_MS - now) : 0;
}
