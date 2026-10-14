import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { Meilisearch } from "meilisearch";
import { PrismaService } from "../common/prisma.service";
import { Prisma } from "@prisma/client";
import { RedisService } from "../common/redis.service";
import { HAS_POSTER, TitlesService } from "../titles/titles.service";
import { filtersToMeili, filtersToWhere, peopleSql, rankedMatchesSql, type CatalogFilters } from "./query";

interface Doc {
  id: string;
  slug: string;
  name: string;
  overview: string;
  genres: string[];
  year: number | null;
  type: string;
  language: string | null;
  rating: string | null;
  /** Cast and crew names, so searching an actor or director finds their titles. */
  people: string[];
}

/** Meilisearch-backed search; falls back to Postgres ILIKE when Meilisearch is unconfigured or down. */
@Injectable()
export class SearchService implements OnApplicationBootstrap {
  private readonly log = new Logger(SearchService.name);
  private readonly client = process.env.MEILI_HOST
    ? new Meilisearch({ host: process.env.MEILI_HOST, apiKey: process.env.MEILI_MASTER_KEY })
    : null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly titles: TitlesService,
    private readonly redis: RedisService,
  ) {}

  async onApplicationBootstrap() {
    // Don't block startup on indexing.
    this.reindex().catch((e) => this.log.warn(`initial index failed: ${e.message}`));
  }

  async reindex() {
    if (!this.client) return;
    await this.client.createIndex("titles", { primaryKey: "id" }).waitTask();
    const index = this.client.index<Doc>("titles");
    await index.updateSettings({
      searchableAttributes: ["name", "people", "genres", "overview"],
      filterableAttributes: ["genres", "year", "type", "language", "rating"],
    }).waitTask();
    const rows = await this.prisma.title.findMany({ where: { published: true } });
    await index.addDocuments(rows.map(toDoc)).waitTask();
    this.log.log(`indexed ${rows.length} titles`);
  }

  /** Sync one title after an admin change (removes it if unpublished or deleted). */
  async sync(titleId: string) {
    if (!this.client) return;
    try {
      const t = await this.prisma.title.findUnique({ where: { id: titleId } });
      const index = this.client.index<Doc>("titles");
      if (t?.published) await index.addDocuments([toDoc(t)]);
      else await index.deleteDocument(titleId);
    } catch (e) {
      this.log.warn(`sync failed: ${(e as Error).message}`);
    }
  }

  /** Ranked text search (title, genre, cast/crew, overview) with the same filters as the catalog list. */
  async search(q: string, o: CatalogFilters & { page: number; limit: number }) {
    const { page, limit, ...filters } = o;
    if (this.client) {
      try {
        const filter = filtersToMeili(filters);
        const res = await this.client.index<Doc>("titles").search(q, { offset: (page - 1) * limit, limit, ...(filter.length && { filter }) });
        const ids = res.hits.map((h) => h.id);
        const order = new Map(ids.map((id, i) => [id, i]));
        const found = await this.titles.getMany(ids);
        found.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
        return { items: found, total: res.estimatedTotalHits ?? found.length, page, limit };
      } catch (e) {
        this.log.warn(`meili search failed, using Postgres: ${(e as Error).message}`);
      }
    }
    return this.searchPostgres(q, filters, page, limit);
  }

  private async searchPostgres(q: string, filters: CatalogFilters, page: number, limit: number) {
    const ranked = (await this.prisma.$queryRaw<{ id: string }[]>(rankedMatchesSql(q))).map((r) => r.id);
    if (ranked.length === 0) return { items: [], total: 0, page, limit };
    // Filters run in Prisma so there is one implementation; the candidate list keeps the relevance order.
    const where: Prisma.TitleWhereInput = { id: { in: ranked }, published: true, ...HAS_POSTER, ...filtersToWhere(filters) };
    const allowed = new Set((await this.prisma.title.findMany({ where, select: { id: true } })).map((t) => t.id));
    const ordered = ranked.filter((id) => allowed.has(id));
    const pageIds = ordered.slice((page - 1) * limit, page * limit);
    const found = await this.titles.getMany(pageIds);
    const order = new Map(pageIds.map((id, i) => [id, i]));
    found.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    return { items: found, total: ordered.length, page, limit };
  }

  /** Typeahead: a few titles, matching people and matching genres. Cached briefly per query. */
  suggest(q: string) {
    const key = q.toLowerCase();
    return this.redis.cached(`titles:suggest:${key}`, 300, async () => {
      const [{ items }, people, genres] = await Promise.all([
        this.search(q, { page: 1, limit: 5 }),
        this.prisma.$queryRaw<{ name: string; titles: number }[]>(peopleSql(q)),
        this.titles.genres(),
      ]);
      return {
        titles: items.map((t) => ({ slug: t.slug, name: t.name, year: t.year, type: t.type, posterPath: t.posterPath })),
        people: people.map((p) => ({ name: p.name, titles: p.titles })),
        genres: genres.filter((g) => g.toLowerCase().includes(key)).slice(0, 3),
      };
    });
  }
}

const toDoc = (t: { type: string; id: string; slug: string; name: string; overview: string | null; genres: string[]; year: number | null; language: string | null; rating: string | null; credits: unknown }): Doc => ({
  id: t.id,
  slug: t.slug,
  name: t.name,
  overview: t.overview ?? "",
  genres: t.genres,
  year: t.year,
  type: t.type,
  language: t.language,
  rating: t.rating,
  people: peopleNames(t.credits),
});

function peopleNames(credits: unknown): string[] {
  const c = credits as { cast?: { name?: string }[]; crew?: { name?: string }[] } | null;
  const names = [...(Array.isArray(c?.cast) ? c.cast : []), ...(Array.isArray(c?.crew) ? c.crew : [])].map((p) => p?.name).filter((n): n is string => !!n);
  return [...new Set(names)];
}
