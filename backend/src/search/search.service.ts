import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { Meilisearch } from "meilisearch";
import { PrismaService } from "../common/prisma.service";
import { TitlesService } from "../titles/titles.service";

interface Doc {
  id: string;
  slug: string;
  name: string;
  overview: string;
  genres: string[];
  year: number | null;
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
      searchableAttributes: ["name", "genres", "overview"],
      filterableAttributes: ["genres", "year"],
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

  async search(q: string) {
    if (this.client) {
      try {
        const res = await this.client.index<Doc>("titles").search(q, { limit: 20 });
        const ids = res.hits.map((h) => h.id);
        const order = new Map(ids.map((id, i) => [id, i]));
        const found = await this.titles.getMany(ids);
        found.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
        return { items: found, total: res.estimatedTotalHits ?? found.length, page: 1, limit: 20 };
      } catch (e) {
        this.log.warn(`meili search failed, using Postgres: ${(e as Error).message}`);
      }
    }
    return this.titles.list({ q, page: 1, limit: 20 });
  }
}

const toDoc = (t: { id: string; slug: string; name: string; overview: string | null; genres: string[]; year: number | null }): Doc => ({
  id: t.id,
  slug: t.slug,
  name: t.name,
  overview: t.overview ?? "",
  genres: t.genres,
  year: t.year,
});
