import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import { RedisService } from "../common/redis.service";
import { filtersToWhere } from "../search/query";
import { keyPeople, relatedScore } from "./related-score";

export interface ListQuery {
  genre?: string;
  language?: string;
  type?: "MOVIE" | "SERIES";
  year?: number;
  yearFrom?: number;
  yearTo?: number;
  rating?: string[];
  q?: string;
  sort?: "newest" | "name" | "year";
  page: number;
  limit: number;
}

/** Catalog listings only show titles that have a poster; direct title URLs still resolve. */
export const HAS_POSTER: Prisma.TitleWhereInput = { AND: [{ posterPath: { not: null } }, { posterPath: { not: "" } }] };

@Injectable()
export class TitlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Drop cached catalog responses after any admin change. */
  invalidate() {
    return this.redis.invalidate("titles:");
  }

  async getMany(ids: string[]) {
    if (ids.length === 0) return [];
    const rows = await this.prisma.title.findMany({ where: { id: { in: ids }, published: true, ...HAS_POSTER }, include: { sources: this.sourceSelect } });
    return (await this.hideDisabledEmbeds(rows)).map(toPublicTitle);
  }

  list(q: ListQuery) {
    return this.redis.cached(`titles:list:${JSON.stringify(q)}`, 60, () => this.listUncached(q));
  }

  private async listUncached(q: ListQuery) {
    const where: Prisma.TitleWhereInput = {
      published: true,
      ...HAS_POSTER,
      ...filtersToWhere(q),
      ...(q.q && { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { overview: { contains: q.q, mode: "insensitive" } }] }),
    };
    const orderBy: Prisma.TitleOrderByWithRelationInput =
      q.sort === "name" ? { name: "asc" } : q.sort === "year" ? { year: "desc" } : { createdAt: "desc" };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.title.findMany({ where, orderBy, skip: (q.page - 1) * q.limit, take: q.limit, include: { sources: this.sourceSelect } }),
      this.prisma.title.count({ where }),
    ]);
    return { items: (await this.hideDisabledEmbeds(items)).map(toPublicTitle), total, page: q.page, limit: q.limit };
  }

  /** Published titles with a poster that release in the future, soonest first. */
  upcoming(limit = 40) {
    return this.redis.cached(`titles:upcoming:${limit}`, 300, async () => {
      const rows = await this.prisma.title.findMany({
        where: { published: true, ...HAS_POSTER, releaseDate: { gt: new Date() } },
        orderBy: { releaseDate: "asc" },
        take: limit,
        include: { sources: this.sourceSelect },
      });
      return (await this.hideDisabledEmbeds(rows)).map(toPublicTitle);
    });
  }

  /** Distinct certifications (PG, R, TV-MA…) across published titles, most common first. */
  ratings() {
    return this.redis.cached("titles:ratings", 300, async () => {
      const rows = await this.prisma.title.groupBy({ by: ["rating"], where: { published: true, rating: { not: null } }, _count: { _all: true }, orderBy: { _count: { rating: "desc" } } });
      return rows.flatMap((r) => (r.rating && r.rating !== "NR" ? [r.rating] : []));
    });
  }

  /** Distinct genres across published titles, alphabetical. */
  genres() {
    return this.redis.cached("titles:genres", 300, async () => {
      const rows = await this.prisma.title.findMany({ where: { published: true }, select: { genres: true } });
      return [...new Set(rows.flatMap((r) => r.genres))].sort();
    });
  }

  /** Distinct original languages across published titles, most common first. */
  languages() {
    return this.redis.cached("titles:languages", 300, async () => {
      const rows = await this.prisma.title.groupBy({ by: ["language"], where: { published: true, language: { not: null } }, _count: { _all: true }, orderBy: { _count: { language: "desc" } } });
      return rows.flatMap((r) => (r.language ? [r.language] : []));
    });
  }

  get(idOrSlug: string) {
    return this.redis.cached(`titles:get:${idOrSlug}`, 60, () => this.getUncached(idOrSlug));
  }

  private async getUncached(idOrSlug: string) {
    const t = await this.prisma.title.findFirst({
      where: { published: true, OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: { sources: this.sourceSelect, episodes: { orderBy: [{ season: "asc" }, { number: "asc" }] } },
    });
    if (!t) throw new NotFoundException();
    return toPublicTitle((await this.hideDisabledEmbeds([t]))[0]);
  }

  /**
   * "You may also like": hybrid ranking of published titles against a seed title.
   * Content score (genre Jaccard, language, type, era proximity) is blended with a
   * collaborative score (other titles saved/watched by users who saved/watched the seed).
   */
  related(idOrSlug: string, limit = 12) {
    return this.redis.cached(`titles:related:${idOrSlug}:${limit}`, 300, () => this.relatedUncached(idOrSlug, limit));
  }

  private async relatedUncached(idOrSlug: string, limit: number) {
    const seed = await this.prisma.title.findFirst({ where: { published: true, OR: [{ id: idOrSlug }, { slug: idOrSlug }] } });
    if (!seed) throw new NotFoundException();

    // Pools so a regional title isn't drowned out by globally popular English ones, and people-linked titles surface too.
    const seedPeople = keyPeople(seed.credits);
    const pool = (or: Prisma.TitleWhereInput[], take: number) =>
      this.prisma.title.findMany({
        where: { published: true, ...HAS_POSTER, id: { not: seed.id }, OR: or },
        orderBy: [{ popularity: "desc" }, { voteCount: "desc" }],
        take,
        include: { sources: this.sourceSelect },
      });
    const [byGenre, byLanguage, byPeople, coWatch] = await Promise.all([
      pool([{ genres: { hasSome: seed.genres } }], 250),
      seed.language ? pool([{ language: seed.language, genres: { hasSome: seed.genres } }], 250) : Promise.resolve([]),
      this.sharedPeopleIds(seed.id, seedPeople).then((ids) => (ids.length ? pool([{ id: { in: ids } }], 60) : [])),
      this.coOccurrence(seed.id),
    ]);
    const candidates = [...new Map([...byGenre, ...byLanguage, ...byPeople].map((t) => [t.id, t])).values()];

    const maxCo = Math.max(1, ...coWatch.values());
    const scored = candidates.map((t) => ({ t, score: relatedScore(seed, t, { seedPeople, collab: (coWatch.get(t.id) ?? 0) / maxCo }) }));
    scored.sort((a, b) => b.score - a.score);

    // Light diversity pass: don't let one franchise-like name prefix fill the whole row.
    const picked: typeof scored = [];
    const prefixCount = new Map<string, number>();
    for (const c of scored) {
      const prefix = c.t.name.toLowerCase().split(/[\s:\-]+/)[0];
      if ((prefixCount.get(prefix) ?? 0) >= 2) continue;
      prefixCount.set(prefix, (prefixCount.get(prefix) ?? 0) + 1);
      picked.push(c);
      if (picked.length === limit) break;
    }
    return (await this.hideDisabledEmbeds(picked.map((c) => c.t))).map(toPublicTitle);
  }

  /** Published titles whose cast or crew include any of `names` (the seed's key people). */
  private async sharedPeopleIds(seedId: string, names: string[]): Promise<string[]> {
    if (names.length === 0) return [];
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT t.id FROM "Title" t
      WHERE t.published AND t.id <> ${seedId} AND t."posterPath" IS NOT NULL AND t."posterPath" <> ''
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(
            (CASE WHEN jsonb_typeof(t.credits->'cast') = 'array' THEN t.credits->'cast' ELSE '[]'::jsonb END) ||
            (CASE WHEN jsonb_typeof(t.credits->'crew') = 'array' THEN t.credits->'crew' ELSE '[]'::jsonb END)
          ) c WHERE c->>'name' = ANY(${names})
        )
      LIMIT 200`;
    return rows.map((r) => r.id);
  }

  /** titleId -> number of users who saved/watched both it and the seed. */
  private async coOccurrence(seedId: string) {
    const [saved, watched] = await Promise.all([
      this.prisma.watchlistItem.findMany({ where: { titleId: seedId }, select: { userId: true }, take: 2000 }),
      this.prisma.watchHistory.findMany({ where: { titleId: seedId }, select: { userId: true }, take: 2000 }),
    ]);
    const userIds = [...new Set([...saved, ...watched].map((r) => r.userId))];
    const counts = new Map<string, number>();
    if (userIds.length === 0) return counts;
    const [a, b] = await Promise.all([
      this.prisma.watchlistItem.groupBy({ by: ["titleId"], where: { userId: { in: userIds }, titleId: { not: seedId } }, _count: { _all: true } }),
      this.prisma.watchHistory.groupBy({ by: ["titleId"], where: { userId: { in: userIds }, titleId: { not: seedId } }, _count: { _all: true } }),
    ]);
    for (const r of [...a, ...b]) counts.set(r.titleId, (counts.get(r.titleId) ?? 0) + r._count._all);
    return counts;
  }

  async hideDisabledEmbeds<T extends TitleWithSources>(titles: T[]): Promise<T[]> {
    const enabled = new Set(
      (await this.prisma.embedProvider.findMany({ where: { enabled: true }, select: { slug: true } })).map((p) => p.slug),
    );
    return titles.map((t) => ({
      ...t,
      sources: t.sources.filter((s) => s.kind !== "EMBED_PROVIDER" || enabled.has(s.externalUrl ?? "")),
    }));
  }

  async sources(idOrSlug: string) {
    return (await this.get(idOrSlug)).sources;
  }

  /** Only READY sources, in priority order; embed sources only while their provider is enabled. */
  get sourceSelect() {
    return { where: { status: "READY" as const }, orderBy: { priority: "asc" as const } };
  }
}

type TitleWithSources = Prisma.TitleGetPayload<{ include: { sources: true } }>;

export function toPublicTitle(t: TitleWithSources & { episodes?: unknown[] }) {
  const { sources, credits, ...rest } = t;
  return {
    ...rest,
    // Cast/crew is only sent with the single-title response (which also carries episodes); lists stay lean.
    ...(t.episodes ? { credits } : {}),
    // manifestKey is internal; clients get playable URLs only via POST /playback/token.
    sources: sources.map((s) => ({
      id: s.id,
      kind: s.kind,
      label: s.label,
      priority: s.priority,
      ...(s.kind === "WATCH_LINK" && s.externalUrl ? { externalUrl: s.externalUrl } : {}),
    })),
  };
}
