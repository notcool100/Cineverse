/** Failed-PIN lockout: `max` wrong tries lock that profile for `lockMs`. In-memory, per API instance. */
export class PinAttempts {
  private readonly state = new Map<string, { fails: number; lockedUntil: number }>();
  constructor(
    private readonly max = 5,
    private readonly lockMs = 5 * 60_000,
  ) {}

  /** Seconds the caller must still wait, or 0 when attempts are allowed. */
  waitSeconds(key: string, now = Date.now()): number {
    const s = this.state.get(key);
    return s && s.lockedUntil > now ? Math.ceil((s.lockedUntil - now) / 1000) : 0;
  }

  fail(key: string, now = Date.now()) {
    const s = this.state.get(key) ?? { fails: 0, lockedUntil: 0 };
    s.fails = s.lockedUntil && s.lockedUntil <= now ? 1 : s.fails + 1; // a finished lockout starts a fresh count
    if (s.fails >= this.max) {
      s.lockedUntil = now + this.lockMs;
      s.fails = 0;
    }
    this.state.set(key, s);
  }

  succeed(key: string) {
    this.state.delete(key);
  }
}

export const PIN_PATTERN = /^\d{4}$/;
