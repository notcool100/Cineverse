/** Distinct reporters within this window count toward flagging a source. */
export const FLAG_WINDOW_MS = 7 * 24 * 3600_000;
/** This many distinct viewers reporting the same source flags it dead. */
export const FLAG_THRESHOLD = 3;

export const REASONS = ["BROKEN", "WRONG_TITLE", "NO_AUDIO", "BAD_QUALITY", "OTHER"] as const;
export type Reason = (typeof REASONS)[number];

/**
 * True when enough different viewers reported recently. Repeat reports by one viewer never count twice,
 * and resolved reports are excluded by the caller.
 */
export function shouldFlag(reports: { userId: string; createdAt: Date }[], now = Date.now(), threshold = FLAG_THRESHOLD, windowMs = FLAG_WINDOW_MS): boolean {
  const users = new Set(reports.filter((r) => now - r.createdAt.getTime() <= windowMs).map((r) => r.userId));
  return users.size >= threshold;
}

export const providerKey = (slug: string) => `provider:${slug}`;
export const providerSlugOf = (key: string) => (key.startsWith("provider:") ? key.slice("provider:".length) : null);
