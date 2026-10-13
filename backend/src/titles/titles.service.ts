import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import { RedisService } from "../common/redis.service";

export interface ListQuery {
  genre?: string;
  type?: "MOVIE" | "SERIES";
  year?: number;
  q?: string;
  sort?: "newest" | "name" | "year";
  page: number;
  limit: number;
}

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
    const rows = await this.prisma.title.findMany({ where: { id: { in: ids }, published: true }, include: { sources: this.sourceSelect } });
    return (await this.hideDisabledEmbeds(rows)).map(toPublicTitle);
  }

  list(q: ListQuery) {
    return this.redis.cached(`titles:list:${JSON.stringify(q)}`, 60, () => this.listUncached(q));
  }

  private async listUncached(q: ListQuery) {
    const where: Prisma.TitleWhereInput = {
      published: true,
      ...(q.genre && { genres: { has: q.genre } }),
      ...(q.type && { type: q.type }),
      ...(q.year && { year: q.year }),
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

  /** Distinct genres across published titles, alphabetical. */
  genres() {
    return this.redis.cached("titles:genres", 300, async () => {
      const rows = await this.prisma.title.findMany({ where: { published: true }, select: { genres: true } });
      return [...new Set(rows.flatMap((r) => r.genres))].sort();
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

  private async hideDisabledEmbeds<T extends TitleWithSources>(titles: T[]): Promise<T[]> {
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
  private get sourceSelect() {
    return { where: { status: "READY" as const }, orderBy: { priority: "asc" as const } };
  }
}

type TitleWithSources = Prisma.TitleGetPayload<{ include: { sources: true } }>;

export function toPublicTitle(t: TitleWithSources & { episodes?: unknown[] }) {
  const { sources, ...rest } = t;
  return {
    ...rest,
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
