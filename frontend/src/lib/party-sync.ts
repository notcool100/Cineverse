// Pure helpers for keeping a local <video> in step with the room. No imports so they are unit-testable.

/** Seconds of drift tolerated before we seek to the room's position. */
export const DRIFT_TOLERANCE = 1.5;

export interface PartyPlayState {
  playing: boolean;
  position: number;
}

/** What the local player must do to match `remote`, or null when it is already close enough. */
export function planSync(local: PartyPlayState, remote: PartyPlayState): { seek?: number; play?: boolean } | null {
  const plan: { seek?: number; play?: boolean } = {};
  if (Math.abs(local.position - remote.position) > DRIFT_TOLERANCE) plan.seek = remote.position;
  if (local.playing !== remote.playing) plan.play = remote.playing;
  return plan.seek === undefined && plan.play === undefined ? null : plan;
}

/** "Sam paused at 1:02:03" style label for the sync indicator. */
export function describeSync(name: string | undefined, s: PartyPlayState): string {
  const t = Math.max(0, Math.floor(s.position));
  const h = Math.floor(t / 3600);
  const clock = `${h ? `${h}:` : ""}${String(Math.floor((t % 3600) / 60)).padStart(h ? 2 : 1, "0")}:${String(t % 60).padStart(2, "0")}`;
  return `${name ?? "Someone"} ${s.playing ? "played" : "paused"} at ${clock}`;
}

/** Watch URL for a title/episode. With a party `code` it joins that room; `nav` marks a deliberate in-party navigation (others follow). */
export function partyWatchUrl(n: { titleId: string; season?: number; episode?: number }, code?: string | null, nav = false): string {
  const q = new URLSearchParams();
  if (n.season !== undefined && n.episode !== undefined) {
    q.set("season", String(n.season));
    q.set("episode", String(n.episode));
  }
  if (code) {
    q.set("party", code);
    if (nav) q.set("nav", "1");
  }
  const qs = q.toString();
  return `/watch/${encodeURIComponent(n.titleId)}${qs ? `?${qs}` : ""}`;
}
