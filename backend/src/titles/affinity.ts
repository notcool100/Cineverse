/** Taste model shared by the "Picked for you" row and per-title match %. Pure functions, no I/O. */

interface TitleLike {
  id: string;
  genres: string[];
  language: string | null;
  popularity: number;
  voteCount: number;
  releaseDate: Date | null;
  backdropPath: string | null;
  overview: string | null;
  sources: unknown[];
}
interface Touch<T extends TitleLike> {
  titleId: string;
  title: T;
}

export interface Affinity<T extends TitleLike = TitleLike> {
  /** Titles the profile has interacted with, with a signal weight (liked 3, watched 2, saved 1.5). */
  touched: Map<string, { t: T; w: number }>;
  liked: Set<string>;
  disliked: Set<string>;
  dislikedGenres: Set<string>;
  genreW: Map<string, number>;
  langW: Map<string, number>;
}

/**
 * Builds the interaction profile: what the user has touched, newest first (history outranks the list).
 * Thumbs up is the strongest signal; thumbs down removes a title from the seeds and pushes its genres away.
 */
export function buildAffinity<T extends TitleLike>(
  ratings: (Touch<T> & { value: number })[],
  history: Touch<T>[],
  saved: Touch<T>[],
): Affinity<T> {
  const disliked = new Set(ratings.filter((r) => r.value < 0).map((r) => r.titleId));
  const liked = new Set(ratings.filter((r) => r.value > 0).map((r) => r.titleId));
  const touched = new Map<string, { t: T; w: number }>();
  for (const r of ratings) if (r.value > 0) touched.set(r.titleId, { t: r.title, w: 3 });
  for (const h of history) if (!touched.has(h.titleId) && !disliked.has(h.titleId)) touched.set(h.titleId, { t: h.title, w: 2 });
  for (const w of saved) if (!touched.has(w.titleId) && !disliked.has(w.titleId)) touched.set(w.titleId, { t: w.title, w: 1.5 });
  const dislikedGenres = new Set<string>();
  for (const r of ratings) if (r.value < 0) for (const g of r.title.genres) dislikedGenres.add(g);

  const genreW = new Map<string, number>();
  const langW = new Map<string, number>();
  for (const { t, w } of touched.values()) {
    for (const g of t.genres) genreW.set(g, (genreW.get(g) ?? 0) + w / Math.sqrt(t.genres.length));
    if (t.language) langW.set(t.language, (langW.get(t.language) ?? 0) + w);
  }
  return { touched, liked, disliked, dislikedGenres, genreW, langW };
}

/** 0..~1 taste fit of one candidate: genre affinity, language affinity and base quality, minus a dislike penalty. */
export function affinityScore(a: Affinity, t: TitleLike): number {
  const maxG = Math.max(1, ...a.genreW.values());
  const maxL = Math.max(1, ...a.langW.values());
  const g = t.genres.reduce((s, x) => s + (a.genreW.get(x) ?? 0), 0) / (maxG * Math.max(1, t.genres.length) ** 0.5 * 2);
  const l = t.language ? (a.langW.get(t.language) ?? 0) / maxL : 0;
  const penalty = t.genres.some((x) => a.dislikedGenres.has(x)) ? 0.15 : 0;
  return 0.55 * Math.min(1, g) + 0.2 * l + 0.25 * quality(t) - penalty;
}

/** "NN% match" for one title, or null when it should show none (no taste data yet, or the user disliked it). */
export function matchPercent(a: Affinity, t: TitleLike): number | null {
  if (a.touched.size === 0 || a.disliked.has(t.id)) return null;
  if (a.liked.has(t.id)) return 99;
  return Math.round(Math.min(98, Math.max(1, 40 + affinityScore(a, t) * 65)));
}

/**
 * 0..1 base score: TMDB popularity/votes (log-scaled) lead, then recency, artwork, overview and playability.
 * Behavior (watchlist/watch activity) is added on top by the caller.
 */
export function quality(t: TitleLike): number {
  const ageYears = t.releaseDate ? Math.max(0, (Date.now() - t.releaseDate.getTime()) / 3.156e10) : 20;
  const recency = Math.exp(-ageYears / 15);
  const pop = Math.min(1, Math.log1p(t.popularity) / Math.log1p(300));
  const votes = Math.min(1, Math.log1p(t.voteCount) / Math.log1p(5000));
  return (
    0.3 * pop + 0.2 * votes + 0.2 * recency + 0.1 * (t.backdropPath ? 1 : 0) + 0.1 * ((t.overview?.length ?? 0) > 40 ? 1 : 0) + 0.1 * (t.sources.length > 0 ? 1 : 0)
  );
}
