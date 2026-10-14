import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { RedisService } from "../common/redis.service";
import { ReportsService } from "../reports/reports.service";
import { dayKey, fillDays, lastDays, rankTitles, sumHash } from "./analytics";

/** Numbers for the admin Overview tab. Views come from the Redis day counters; everything else from Postgres. */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly reports: ReportsService,
  ) {}

  overview(days = 14) {
    return this.redis.cached(`admin:analytics:${days}`, 60, () => this.build(days));
  }

  private async build(span: number) {
    const days = lastDays(span);
    const since = new Date(`${days[0]}T00:00:00Z`);
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);

    const [totals, views, watchRows, signupRows, saves, watches, openReports] = await Promise.all([
      this.totals(),
      this.viewsByDay(days),
      this.prisma.$queryRaw<{ d: string; n: number }[]>`
        SELECT to_char("updatedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d, count(*)::int AS n
        FROM "WatchHistory" WHERE "updatedAt" >= ${since} GROUP BY 1`,
      this.prisma.$queryRaw<{ d: string; n: number }[]>`
        SELECT to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d, count(*)::int AS n
        FROM "User" WHERE "createdAt" >= ${since} GROUP BY 1`,
      this.prisma.watchlistItem.groupBy({ by: ["titleId"], where: { addedAt: { gte: weekAgo } }, _count: { _all: true } }),
      this.prisma.watchHistory.groupBy({ by: ["titleId"], where: { updatedAt: { gte: weekAgo } }, _count: { _all: true } }),
      this.reports.openGroups(),
    ]);

    // Top titles over the last 7 days: per-title views from the newest seven day hashes.
    const perTitle = new Map<string, { id: string; views: number; watches: number; saves: number }>();
    const row = (id: string) => perTitle.get(id) ?? perTitle.set(id, { id, views: 0, watches: 0, saves: 0 }).get(id)!;
    for (const [id, n] of await this.titleViews(days.slice(-7))) row(id).views += n;
    for (const w of watches) row(w.titleId).watches += w._count._all;
    for (const s of saves) row(s.titleId).saves += s._count._all;
    const top = rankTitles([...perTitle.values()], 10);
    const names = await this.prisma.title.findMany({ where: { id: { in: top.map((t) => t.id) } }, select: { id: true, slug: true, name: true, type: true } });
    const byId = new Map(names.map((n) => [n.id, n]));

    return {
      days: span,
      totals: { ...totals, openReports: openReports.length },
      series: {
        views: fillDays(days, views),
        watches: fillDays(days, new Map(watchRows.map((r) => [r.d, r.n]))),
        signups: fillDays(days, new Map(signupRows.map((r) => [r.d, r.n]))),
      },
      topTitles: top.flatMap((t) => {
        const n = byId.get(t.id);
        return n ? [{ slug: n.slug, name: n.name, type: n.type, views: t.views, watches: t.watches, saves: t.saves }] : [];
      }),
      deadSources: openReports.filter((g) => g.sourceStatus === "FAILED" || g.reporters >= 2).slice(0, 8),
    };
  }

  private async totals() {
    const [users, verified, profiles, titles, published, sources, failed, requests] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
      this.prisma.profile.count(),
      this.prisma.title.count(),
      this.prisma.title.count({ where: { published: true } }),
      this.prisma.source.count(),
      this.prisma.source.count({ where: { status: "FAILED" } }),
      this.prisma.titleRequest.count({ where: { status: "OPEN" } }),
    ]);
    return { users, verifiedUsers: verified, profiles, titles, publishedTitles: published, sources, failedSources: failed, openRequests: requests };
  }

  /** Total page views per day (YYYY-MM-DD → count) from the Redis hashes `views:YYYYMMDD`. */
  private async viewsByDay(days: string[]) {
    const out = new Map<string, number>();
    const client = this.redis.client;
    if (!client) return out;
    try {
      const hashes = await Promise.all(days.map((d) => client.hgetall(`views:${dayKey(new Date(`${d}T00:00:00Z`))}`)));
      days.forEach((d, i) => out.set(d, sumHash(hashes[i])));
    } catch {}
    return out;
  }

  private async titleViews(days: string[]) {
    const out = new Map<string, number>();
    const client = this.redis.client;
    if (!client) return out;
    try {
      const hashes = await Promise.all(days.map((d) => client.hgetall(`views:${dayKey(new Date(`${d}T00:00:00Z`))}`)));
      for (const h of hashes) for (const [id, n] of Object.entries(h)) out.set(id, (out.get(id) ?? 0) + (Number(n) || 0));
    } catch {}
    return out;
  }
}
