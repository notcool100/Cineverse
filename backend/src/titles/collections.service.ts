import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import { RedisService } from "../common/redis.service";
import { COLLECTIONS, collectionByKey, collectionWhere } from "./collections";
import { KIDS_WHERE } from "./home.service";
import { HAS_POSTER, TitlesService, toPublicTitle } from "./titles.service";

@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly titles: TitlesService,
  ) {}

  /** Collection cards, each with a few posters so the page isn't a wall of gradients. */
  list() {
    return this.redis.cached("titles:collections", 600, async () =>
      Promise.all(
        COLLECTIONS.map(async (c) => {
          const [samples, total] = await Promise.all([
            this.prisma.title.findMany({ where: this.where(c.key, false), orderBy: [{ popularity: "desc" }], take: 3, select: { posterPath: true } }),
            this.prisma.title.count({ where: this.where(c.key, false) }),
          ]);
          return { key: c.key, title: c.title, blurb: c.blurb, accent: c.accent, total, posters: samples.map((s) => s.posterPath).filter(Boolean) as string[] };
        }),
      ).then((all) => all.filter((c) => c.total > 0)),
    );
  }

  get(key: string, o: { kids: boolean; page: number; limit: number }) {
    const c = collectionByKey(key);
    if (!c) throw new NotFoundException("Collection not found");
    return this.redis.cached(`titles:collection:${key}:${o.kids}:${o.page}:${o.limit}`, 300, async () => {
      const where = this.where(key, o.kids);
      const [rows, total] = await Promise.all([
        this.prisma.title.findMany({ where, orderBy: [{ popularity: "desc" }, { voteCount: "desc" }], skip: (o.page - 1) * o.limit, take: o.limit, include: { sources: this.titles.sourceSelect } }),
        this.prisma.title.count({ where }),
      ]);
      const { any: _a, none: _n, ...meta } = c;
      return { collection: meta, items: (await this.titles.hideDisabledEmbeds(rows)).map(toPublicTitle), total, page: o.page, limit: o.limit };
    });
  }

  private where(key: string, kids: boolean): Prisma.TitleWhereInput {
    const c = collectionByKey(key)!;
    return {
      published: true,
      ...HAS_POSTER,
      AND: [{ OR: [{ releaseDate: null }, { releaseDate: { lte: new Date() } }] }, collectionWhere(c), ...(kids ? [KIDS_WHERE] : [])],
    };
  }
}
