// PROJECT.md §1/§2: unlicensed aggregators must never be configured as embed providers.
const BLOCKED = ["vidsrc", "2embed", "vidlink", "multiembed", "cinesrc", "peestream", "vidfast"];

export function isBlockedProvider(...values: string[]): boolean {
  const hay = values.join(" ").toLowerCase();
  return BLOCKED.some((b) => hay.includes(b));
}
