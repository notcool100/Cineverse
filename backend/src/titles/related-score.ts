/** Title-to-title similarity used by "More like this". Pure; the service feeds it candidates. */
export interface RelatedTitle {
  id: string;
  type: string;
  genres: string[];
  language: string | null;
  year: number | null;
  popularity: number;
  voteCount: number;
  credits?: unknown;
}

/** Top-billed cast plus directors/creators: the people whose overlap says "same crowd made this". */
export function keyPeople(credits: unknown, cast = 8): string[] {
  const c = credits as { cast?: { name?: string }[]; crew?: { name?: string; job?: string }[] } | null;
  if (!c || typeof c !== "object") return [];
  const actors = (Array.isArray(c.cast) ? c.cast : []).slice(0, cast).map((p) => p?.name);
  const makers = (Array.isArray(c.crew) ? c.crew : []).filter((p) => /director|creator/i.test(p?.job ?? "")).map((p) => p?.name);
  return [...new Set([...actors, ...makers].filter((n): n is string => !!n))];
}

/** Share of the seed's key people who also appear in the candidate's cast/crew (0..1). */
export function peopleOverlap(seedPeople: string[], candidateCredits: unknown): number {
  if (seedPeople.length === 0) return 0;
  const c = candidateCredits as { cast?: { name?: string }[]; crew?: { name?: string }[] } | null;
  if (!c || typeof c !== "object") return 0;
  const names = new Set([...(Array.isArray(c.cast) ? c.cast : []), ...(Array.isArray(c.crew) ? c.crew : [])].map((p) => p?.name));
  const shared = seedPeople.filter((n) => names.has(n)).length;
  // Two shared names is already a strong signal; cap so one huge cast list can't dominate.
  return Math.min(1, shared / Math.min(seedPeople.length, 3));
}

export function relatedScore(seed: RelatedTitle, t: RelatedTitle, opts: { seedPeople: string[]; collab: number }): number {
  const seedGenres = new Set(seed.genres);
  const shared = t.genres.filter((g) => seedGenres.has(g)).length;
  const union = seedGenres.size + t.genres.length - shared;
  const genre = union ? shared / union : 0;
  const era = seed.year && t.year ? Math.exp(-Math.abs(seed.year - t.year) / 12) : 0.3;
  const pop = Math.min(1, Math.log1p(t.popularity) / Math.log1p(300));
  const votes = Math.min(1, Math.log1p(t.voteCount) / Math.log1p(5000));
  return (
    0.3 * genre +
    0.17 * peopleOverlap(opts.seedPeople, t.credits) +
    0.15 * (seed.language && t.language === seed.language ? 1 : 0) +
    0.08 * (t.type === seed.type ? 1 : 0) +
    0.05 * era +
    0.12 * opts.collab +
    0.13 * (0.6 * pop + 0.4 * votes)
  );
}
