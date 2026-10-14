import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import { RedisService } from "../common/redis.service";
import { HAS_POSTER, TitlesService, toPublicTitle } from "./titles.service";
import { affinityScore, buildAffinity, matchPercent, quality } from "./affinity";

const POOL = 300; // candidates ranked per row
const ROW_SIZE = 20;
const MIN_ROW = 6; // rows shorter than this are dropped rather than shown half-empty
const ACTIVITY_DAYS = 30;
const VIEW_HALF_LIFE_DAYS = 7;
/** Behavior only steers ranking once there are about this many events; below that TMDB popularity leads. */
const FULL_CONFIDENCE_EVENTS = 60;
const day = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
const GENRE_ROWS = 8;
const LANGUAGE_ROWS = 4;

/** Kids profiles: family/animation genres only, no mature genres, and no adult certification. */
const KIDS_GENRES = ["Family", "Animation", "Kids"];
const MATURE_GENRES = ["Horror", "Crime", "War", "Thriller"];
const MATURE_RATINGS = ["R", "NC-17", "TV-MA", "PG-13", "TV-14", "18+", "A"];
export const KIDS_WHERE: Prisma.TitleWhereInput = {
  genres: { hasSome: KIDS_GENRES },
  NOT: [{ genres: { hasSome: MATURE_GENRES } }, { rating: { in: MATURE_RATINGS } }],
};
export const isKidsSafe = (t: { genres: string[]; rating: string | null }) =>
  t.genres.some((g) => KIDS_GENRES.includes(g)) && !t.genres.some((g) => MATURE_GENRES.includes(g)) && !MATURE_RATINGS.includes(t.rating ?? "");

type Row = { key: string; title: string; items: ReturnType<typeof toPublicTitle>[] };
const TOP_N = 10;
type Candidate = Prisma.TitleGetPayload<{ include: { sources: true } }>;

/** Builds the home page: shared rows for everyone, plus per-user rows from watch history and My List. */
@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly titles: TitlesService,
  ) {}

  home(kids = false) {
    return this.redis.cached(kids ? "titles:home:kids" : "titles:home", 300, () => this.build(kids));
  }

  private async build(kids: boolean) {
    const pool = (extra: Prisma.TitleWhereInput, take?: number) => this.pool(extra, take, kids);
    const [{ scores: activity, confidence }, genres, languages, today] = await Promise.all([this.activity(), this.topGenres(), this.topLanguages(), this.todayScores()]);

    // One ranked pool per row, fetched in parallel; rows then claim titles in order so nothing repeats.
    const [trending, playable, series, movies, ...rest] = await Promise.all([
      pool({}),
      pool({ sources: { some: { status: "READY" } } }, 30),
      pool({ type: "SERIES" }),
      pool({ type: "MOVIE" }),
      ...genres.map((g) => pool({ genres: { has: g } })),
      ...languages.map((l) => pool({ language: l })),
    ]);
    const genrePools = rest.slice(0, genres.length);
    const languagePools = rest.slice(genres.length);

    // Scale behavior by confidence so a handful of early events can't outrank proven popularity.
    const rank = (pool: Candidate[], activityWeight = 0.2) =>
      pool
        .map((t) => ({ t, s: quality(t) + activityWeight * confidence * (activity.get(t.id) ?? 0) }))
        .sort((a, b) => b.s - a.s)
        .map((x) => x.t);

    const trendingRanked = rank(trending, 0.8);
    const hero = trendingRanked.find((t) => t.backdropPath && (t.overview?.length ?? 0) > 40) ?? trendingRanked[0];

    const seen = new Set<string>();
    const claim = (key: string, title: string, pool: Candidate[], activityWeight?: number): Row | null => {
      const picked: Candidate[] = [];
      for (const t of rank(pool, activityWeight)) {
        if (seen.has(t.id)) continue;
        picked.push(t);
        if (picked.length === ROW_SIZE) break;
      }
      if (picked.length < MIN_ROW) return null;
      picked.forEach((t) => seen.add(t.id));
      return { key, title, items: picked as unknown as Row["items"] };
    };

    // Top 10 is not part of the de-dupe: it is a ranking, so its titles may repeat in the rows below.
    const top = rankTop(trending, today).slice(0, TOP_N);
    const raw = [
      ...(top.length >= TOP_N ? [{ key: "top10", title: "Top 10 today", items: top as unknown as Row["items"] }] : []),
      claim("trending", "Trending now", trending, 0.8),
      claim("playable", "Watch on Cineora", playable),
      claim("series", "Popular series", series),
      claim("movies", "Popular movies", movies),
      ...languagePools.map((p, i) => claim(`lang:${languages[i]}`, `Popular in ${languageName(languages[i])}`, p)),
      ...genrePools.map((p, i) => claim(`genre:${genres[i]}`, genres[i], p)),
    ].filter((r): r is Row => r !== null);

    // Convert to public shape once, hiding embeds whose provider is disabled.
    const all = raw.flatMap((r) => r.items as unknown as Candidate[]);
    const shown = await this.titles.hideDisabledEmbeds(hero ? [hero, ...all] : all);
    const byId = new Map(shown.map((t) => [t.id, toPublicTitle(t)]));
    return {
      hero: hero ? byId.get(hero.id) : null,
      rows: raw.map((r) => ({ ...r, items: (r.items as unknown as Candidate[]).map((t) => byId.get(t.id)!) })),
    };
  }

  async forUser(userId: string, profile: { id: string; isKids: boolean }): Promise<{ rows: Row[] }> {
    const profileId = profile.id;
    const [history, saved, ratings] = await Promise.all([
      this.prisma.watchHistory.findMany({
        where: { userId, profileId, title: { published: true } },
        orderBy: { updatedAt: "desc" },
        take: 60,
        include: { title: { include: { sources: this.titles.sourceSelect } } },
      }),
      this.prisma.watchlistItem.findMany({
        where: { userId, profileId, title: { published: true } },
        orderBy: { addedAt: "desc" },
        take: 200,
        include: { title: { include: { sources: this.titles.sourceSelect } } },
      }),
      this.prisma.rating.findMany({
        where: { userId, profileId, title: { published: true } },
        orderBy: { updatedAt: "desc" },
        take: 200,
        include: { title: { include: { sources: this.titles.sourceSelect } } },
      }),
    ]);

    const rows: Row[] = [];
    const present = async (ts: Candidate[]) => (await this.titles.hideDisabledEmbeds(ts)).map(toPublicTitle);

    // Continue watching: one card per title, most recent first. A finished series episode advances to the next one.
    // Embedded players can't report progress (duration 0), so those resume without a bar.
    type Cont = { t: Candidate; progress: number | null; season?: number; episode?: number; finished: boolean };
    const contMap = new Map<string, Cont>();
    for (const h of history) {
      if (contMap.has(h.titleId)) continue;
      const known = h.durationSec > 0;
      const progress = known ? h.positionSec / h.durationSec : null;
      const finished = known && (progress ?? 0) >= 0.95;
      if (known && !finished && h.positionSec < 30) continue;
      if (finished && h.title.type !== "SERIES") continue;
      const m = /^S(\d+)E(\d+)$/.exec(h.episodeId);
      contMap.set(h.titleId, { t: h.title, progress, finished, ...(m && { season: Number(m[1]), episode: Number(m[2]) }) });
    }
    const advancing = [...contMap.values()].filter((c) => c.finished).map((c) => c.t.id);
    if (advancing.length) {
      const eps = await this.prisma.episode.findMany({
        where: { titleId: { in: advancing } },
        orderBy: [{ season: "asc" }, { number: "asc" }],
        select: { titleId: true, season: true, number: true },
      });
      for (const c of [...contMap.values()].filter((x) => x.finished)) {
        const list = eps.filter((e) => e.titleId === c.t.id);
        const i = list.findIndex((e) => e.season === c.season && e.number === c.episode);
        const nxt = i >= 0 ? list[i + 1] : undefined;
        if (!nxt) contMap.delete(c.t.id);
        else Object.assign(c, { season: nxt.season, episode: nxt.number, progress: null, finished: false });
      }
    }
    const cont = contMap;
    if (cont.size) {
      const entries = [...cont.values()].slice(0, ROW_SIZE);
      const items = await present(entries.map((e) => e.t));
      rows.push({
        key: "continue",
        title: "Continue watching",
        items: items.map((t, i) => {
          const e = entries.find((x) => x.t.slug === t.slug) ?? entries[i];
          return { ...t, resume: true, progress: e.progress, resumeSeason: e.season, resumeEpisode: e.episode };
        }) as Row["items"],
      });
    }

    const aff = buildAffinity(ratings, history, saved);
    const { touched, liked, disliked } = aff;
    if (touched.size === 0) return { rows };

    // "Because you watched …": reuse the title-to-title ranker for the two most recent seeds.
    const seeds = [...touched.values()].slice(0, 2).map((x) => x.t);
    const because = await Promise.all(seeds.map((s) => this.titles.related(s.id, 16).catch(() => [])));
    const shownIds = new Set<string>(cont.keys());
    seeds.forEach((s, i) => {
      const items = because[i].filter((t) => (!profile.isKids || isKidsSafe(t)) && !touched.has(t.id) && !disliked.has(t.id) && !shownIds.has(t.id));
      if (items.length < MIN_ROW) return;
      items.forEach((t) => shownIds.add(t.id));
      rows.push({ key: `because:${s.id}`, title: `Because you ${liked.has(s.id) ? "liked" : history.some((h) => h.titleId === s.id) ? "watched" : "saved"} ${s.name}`, items });
    });

    // Picked for you: genre/language affinity from the whole profile.
    const topGenres = [...aff.genreW.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([g]) => g);
    if (topGenres.length) {
      const pool = await this.pool({ genres: { hasSome: topGenres }, id: { notIn: [...touched.keys(), ...disliked] } }, POOL, profile.isKids);
      const scored = pool
        .filter((t) => !shownIds.has(t.id))
        .map((t) => ({ t, s: affinityScore(aff, t) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, ROW_SIZE)
        .map((x) => x.t);
      if (scored.length >= MIN_ROW) rows.push({ key: "picked", title: "Picked for you", items: await present(scored) });
    }
    return { rows };
  }

  /** "NN% match" per title slug/id for the active profile. Titles with no number (no taste data, disliked) are omitted. */
  async match(userId: string, profileId: string, idsOrSlugs: string[]): Promise<Record<string, number>> {
    const [history, saved, ratings, wanted] = await Promise.all([
      this.prisma.watchHistory.findMany({ where: { userId, profileId, title: { published: true } }, orderBy: { updatedAt: "desc" }, take: 60, include: { title: { include: { sources: true } } } }),
      this.prisma.watchlistItem.findMany({ where: { userId, profileId, title: { published: true } }, orderBy: { addedAt: "desc" }, take: 200, include: { title: { include: { sources: true } } } }),
      this.prisma.rating.findMany({ where: { userId, profileId, title: { published: true } }, orderBy: { updatedAt: "desc" }, take: 200, include: { title: { include: { sources: true } } } }),
      this.prisma.title.findMany({ where: { published: true, OR: [{ id: { in: idsOrSlugs } }, { slug: { in: idsOrSlugs } }] }, include: { sources: true } }),
    ]);
    const aff = buildAffinity(ratings, history, saved);
    const out: Record<string, number> = {};
    for (const t of wanted) {
      const pct = matchPercent(aff, t);
      if (pct === null) continue;
      out[t.slug] = pct;
      out[t.id] = pct;
    }
    return out;
  }

  /** Candidate titles: has a poster, already released, most popular first. */
  private pool(extra: Prisma.TitleWhereInput, take = POOL, kids = false): Promise<Candidate[]> {
    return this.prisma.title.findMany({
      where: {
        published: true,
        ...HAS_POSTER,
        AND: [{ OR: [{ releaseDate: null }, { releaseDate: { lte: new Date() } }] }, extra, ...(kids ? [KIDS_WHERE] : [])],
      },
      orderBy: [{ popularity: "desc" }, { voteCount: "desc" }],
      take,
      include: { sources: this.titles.sourceSelect },
    });
  }

  /**
   * Behavior score per title (0..1, log-scaled) from the last 30 days: watching counts most, then saving,
   * then page views (which decay with a 7-day half-life). `confidence` is 0..1 by total event volume.
   */
  private async activity() {
    const since = new Date(Date.now() - ACTIVITY_DAYS * 86_400_000);
    const [saves, watches, views] = await Promise.all([
      this.prisma.watchlistItem.groupBy({ by: ["titleId"], where: { addedAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.watchHistory.groupBy({ by: ["titleId"], where: { updatedAt: { gte: since } }, _count: { _all: true } }),
      this.recentViews(),
    ]);
    const raw = new Map<string, number>();
    let events = 0;
    for (const r of saves) (raw.set(r.titleId, (raw.get(r.titleId) ?? 0) + 2 * r._count._all), (events += r._count._all));
    for (const r of watches) (raw.set(r.titleId, (raw.get(r.titleId) ?? 0) + 3 * r._count._all), (events += r._count._all));
    for (const [id, v] of views) (raw.set(id, (raw.get(id) ?? 0) + v), (events += v));
    const max = Math.max(1, ...raw.values());
    return {
      scores: new Map([...raw].map(([id, v]) => [id, Math.log1p(v) / Math.log1p(max)])),
      confidence: Math.min(1, events / FULL_CONFIDENCE_EVENTS),
    };
  }

  /**
   * Last-24h behavior per title (raw weighted counts, not normalised): watching 3, saving 2, page views 1.
   * Today's view bucket counts in full, yesterday's at half, so the ranking moves through the day.
   */
  private async todayScores() {
    const since = new Date(Date.now() - 86_400_000);
    const [saves, watches, views] = await Promise.all([
      this.prisma.watchlistItem.groupBy({ by: ["titleId"], where: { addedAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.watchHistory.groupBy({ by: ["titleId"], where: { updatedAt: { gte: since } }, _count: { _all: true } }),
      this.dayViews(),
    ]);
    const out = new Map<string, number>(views);
    for (const r of saves) out.set(r.titleId, (out.get(r.titleId) ?? 0) + 2 * r._count._all);
    for (const r of watches) out.set(r.titleId, (out.get(r.titleId) ?? 0) + 3 * r._count._all);
    return out;
  }

  private async dayViews() {
    const out = new Map<string, number>();
    const client = this.redis.client;
    if (!client) return out;
    try {
      const [today, yesterday] = await Promise.all([new Date(), new Date(Date.now() - 86_400_000)].map((d) => client.hgetall(`views:${day(d)}`)));
      for (const [id, n] of Object.entries(today)) out.set(id, Number(n));
      for (const [id, n] of Object.entries(yesterday)) out.set(id, (out.get(id) ?? 0) + Number(n) / 2);
    } catch {}
    return out;
  }

  /** Anonymous page views: one count per visitor per title per 30 minutes, stored in daily Redis hashes. */
  async recordView(idOrSlug: string, visitor: string) {
    const client = this.redis.client;
    if (!client) return;
    try {
      const t = await this.prisma.title.findFirst({ where: { published: true, OR: [{ id: idOrSlug }, { slug: idOrSlug }] }, select: { id: true } });
      if (!t) return;
      const fresh = await client.set(`viewed:${visitor}:${t.id}`, "1", "EX", 1800, "NX");
      if (!fresh) return;
      const key = `views:${day(new Date())}`;
      await client.multi().hincrby(key, t.id, 1).expire(key, (ACTIVITY_DAYS + 1) * 86_400).exec();
    } catch {}
  }

  private async recentViews() {
    const out = new Map<string, number>();
    const client = this.redis.client;
    if (!client) return out;
    try {
      const days = Array.from({ length: ACTIVITY_DAYS }, (_, i) => new Date(Date.now() - i * 86_400_000));
      const hashes = await Promise.all(days.map((d) => client.hgetall(`views:${day(d)}`)));
      hashes.forEach((h, age) => {
        const decay = 0.5 ** (age / VIEW_HALF_LIFE_DAYS);
        for (const [id, n] of Object.entries(h)) out.set(id, (out.get(id) ?? 0) + Number(n) * decay);
      });
    } catch {}
    return out;
  }

  private async topGenres() {
    const rows = await this.prisma.$queryRaw<{ g: string }[]>`
      SELECT g FROM "Title", unnest(genres) AS g
      WHERE published AND "posterPath" IS NOT NULL AND "posterPath" <> ''
      GROUP BY g ORDER BY count(*) DESC LIMIT ${GENRE_ROWS}`;
    return rows.map((r) => r.g);
  }

  private async topLanguages() {
    const rows = await this.prisma.title.groupBy({
      by: ["language"],
      where: { published: true, ...HAS_POSTER, language: { notIn: ["en"] } },
      _count: { _all: true },
      orderBy: { _count: { language: "desc" } },
      take: LANGUAGE_ROWS,
    });
    return rows.flatMap((r) => (r.language ? [r.language] : []));
  }
}

/**
 * Orders candidates by today's activity first; titles nobody touched today fall back to their base quality,
 * so a quiet day still yields a full, sensible Top 10. Exported for tests.
 */
export function rankTop<T extends Candidate>(pool: T[], today: Map<string, number>): T[] {
  return pool
    .map((t) => ({ t, active: today.get(t.id) ?? 0, q: quality(t) }))
    .sort((a, b) => (b.active > 0 ? 1 : 0) - (a.active > 0 ? 1 : 0) || b.active - a.active || b.q - a.q)
    .map((x) => x.t);
}

const names = new Intl.DisplayNames(["en"], { type: "language" });
function languageName(code: string) {
  try {
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}
