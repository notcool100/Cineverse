export interface Markers {
  introStartSec?: number | null;
  introEndSec?: number | null;
  creditsStartSec?: number | null;
}

/** Returns a human-readable problem with a marker set, or null when it is consistent. `undefined` fields mean "unchanged". */
export function validateMarkers(m: Markers, runtimeSec?: number | null): string | null {
  const { introStartSec: a, introEndSec: b, creditsStartSec: c } = m;
  for (const [name, v] of [["introStartSec", a], ["introEndSec", b], ["creditsStartSec", c]] as const) {
    if (v !== undefined && v !== null && (!Number.isInteger(v) || v < 0 || v > 24 * 3600)) return `${name} must be a whole number of seconds (0–86400)`;
  }
  if ((a == null) !== (b == null) && a !== undefined && b !== undefined) return "Set both intro start and intro end, or neither";
  if (a != null && b != null && b <= a) return "Intro end must be after intro start";
  if (c != null && b != null && c <= b) return "Credits must start after the intro ends";
  if (runtimeSec && c != null && c > runtimeSec) return "Credits start is past the end of the episode";
  return null;
}
