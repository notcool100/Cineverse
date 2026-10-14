import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { TitlesService } from "../titles/titles.service";
import { FLAG_WINDOW_MS, shouldFlag, type Reason } from "./autoflag";

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly titles: TitlesService,
  ) {}

  /** Records (or reopens) one viewer's report, then flags the source dead if enough viewers agree. */
  async report(userId: string, input: { titleId: string; sourceKey: string; season?: number; episode?: number; reason: Reason; note?: string }) {
    const title = await this.prisma.title.findFirst({ where: { published: true, OR: [{ id: input.titleId }, { slug: input.titleId }] }, select: { id: true } });
    if (!title) throw new NotFoundException("Title not found");
    const episodeKey = input.season && input.episode ? `S${input.season}E${input.episode}` : "";
    const key = { userId, titleId: title.id, sourceKey: input.sourceKey, episodeKey };
    await this.prisma.sourceReport.upsert({
      where: { userId_titleId_sourceKey_episodeKey: key },
      create: { ...key, reason: input.reason, note: input.note },
      update: { reason: input.reason, note: input.note, createdAt: new Date(), resolvedAt: null },
    });
    return this.autoFlag(title.id, input.sourceKey);
  }

  /**
   * A stored source reported by enough viewers is set FAILED, which hides it from every picker (sources are
   * filtered to READY). Registry providers have no row to flip; they are excluded per title via `flaggedProviders`.
   */
  private async autoFlag(titleId: string, sourceKey: string) {
    if (sourceKey.startsWith("provider:")) return { flagged: false };
    const open = await this.prisma.sourceReport.findMany({
      where: { sourceKey, resolvedAt: null, createdAt: { gte: new Date(Date.now() - FLAG_WINDOW_MS) } },
      select: { userId: true, createdAt: true },
    });
    if (!shouldFlag(open)) return { flagged: false };
    const r = await this.prisma.source.updateMany({ where: { id: sourceKey, status: "READY" }, data: { status: "FAILED" } });
    if (r.count) await this.titles.invalidate();
    return { flagged: r.count > 0 };
  }

  /** Open reports grouped by source and episode, most-reported first, for the admin panel. */
  async openGroups() {
    const rows = await this.prisma.sourceReport.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: "desc" },
      include: { title: { select: { slug: true, name: true } } },
      take: 1000,
    });
    const groups = new Map<string, { titleId: string; slug: string; name: string; sourceKey: string; episodeKey: string; users: Set<string>; reasons: Record<string, number>; last: Date; notes: string[] }>();
    for (const r of rows) {
      const k = `${r.titleId}|${r.sourceKey}|${r.episodeKey}`;
      const g = groups.get(k) ?? { titleId: r.titleId, slug: r.title.slug, name: r.title.name, sourceKey: r.sourceKey, episodeKey: r.episodeKey, users: new Set(), reasons: {}, last: r.createdAt, notes: [] };
      g.users.add(r.userId);
      g.reasons[r.reason] = (g.reasons[r.reason] ?? 0) + 1;
      if (r.note && g.notes.length < 3) g.notes.push(r.note);
      groups.set(k, g);
    }
    const storedIds = [...new Set([...groups.values()].filter((g) => !g.sourceKey.startsWith("provider:")).map((g) => g.sourceKey))];
    const sources = await this.prisma.source.findMany({ where: { id: { in: storedIds } }, select: { id: true, label: true, status: true } });
    const byId = new Map(sources.map((s) => [s.id, s]));
    return [...groups.values()]
      .map((g) => {
        const src = byId.get(g.sourceKey);
        return {
          titleId: g.titleId, slug: g.slug, title: g.name, sourceKey: g.sourceKey, episodeKey: g.episodeKey,
          sourceLabel: src?.label ?? g.sourceKey.replace(/^provider:/, ""),
          kind: g.sourceKey.startsWith("provider:") ? "provider" : "source",
          sourceStatus: src?.status ?? null,
          reporters: g.users.size, reasons: g.reasons, notes: g.notes, lastReportedAt: g.last,
        };
      })
      .sort((a, b) => b.reporters - a.reporters || +new Date(b.lastReportedAt) - +new Date(a.lastReportedAt));
  }

  /** Marks matching open reports resolved (e.g. after fixing the source). */
  async resolve(titleId: string, sourceKey: string, episodeKey = "") {
    await this.prisma.sourceReport.updateMany({ where: { titleId, sourceKey, episodeKey, resolvedAt: null }, data: { resolvedAt: new Date() } });
  }

  /** Puts a FAILED source back in rotation and clears its reports. */
  async restore(sourceId: string) {
    const s = await this.prisma.source.updateMany({ where: { id: sourceId }, data: { status: "READY" } });
    if (!s.count) throw new NotFoundException();
    await this.prisma.sourceReport.updateMany({ where: { sourceKey: sourceId, resolvedAt: null }, data: { resolvedAt: new Date() } });
    await this.titles.invalidate();
  }

  /** Registry providers that enough viewers flagged for this title (and episode); the picker hides them. */
  async flaggedProviders(titleId: string, episodeKey: string): Promise<string[]> {
    const rows = await this.prisma.sourceReport.findMany({
      where: { titleId, episodeKey, resolvedAt: null, sourceKey: { startsWith: "provider:" }, createdAt: { gte: new Date(Date.now() - FLAG_WINDOW_MS) } },
      select: { sourceKey: true, userId: true, createdAt: true },
    });
    const by = new Map<string, typeof rows>();
    for (const r of rows) by.set(r.sourceKey, [...(by.get(r.sourceKey) ?? []), r]);
    return [...by].filter(([, list]) => shouldFlag(list)).map(([k]) => k.slice("provider:".length));
  }
}
