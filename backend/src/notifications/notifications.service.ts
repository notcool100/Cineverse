import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { notifyWatchers } from "./fanout";

const SWEEP_MS = 60 * 60_000;

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(NotificationsService.name);
  private timer?: ReturnType<typeof setInterval>;
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.sweepReleases();
    this.timer = setInterval(() => void this.sweepReleases(), SWEEP_MS);
  }
  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** Reminders whose title has now been released: notify once and mark them done. */
  async sweepReleases(): Promise<number> {
    try {
      const due = await this.prisma.reminder.findMany({
        where: { notifiedAt: null, title: { published: true, releaseDate: { lte: new Date() } } },
        include: { title: { select: { id: true, name: true } } },
      });
      if (due.length === 0) return 0;
      await this.prisma.notification.createMany({
        data: due.map((r) => ({ userId: r.userId, profileId: r.profileId, titleId: r.titleId, type: "RELEASED" as const, message: `${r.title.name} is out now` })),
      });
      await this.prisma.reminder.updateMany({
        where: { OR: due.map((r) => ({ userId: r.userId, profileId: r.profileId, titleId: r.titleId })) },
        data: { notifiedAt: new Date() },
      });
      return due.length;
    } catch (e) {
      this.log.warn(`release sweep failed: ${(e as Error).message}`);
      return 0;
    }
  }

  notifyWatchers(titleId: string, type: "SOURCE_ADDED" | "EPISODE_ADDED", message: string) {
    return notifyWatchers(this.prisma, titleId, type, message);
  }

  /** Newest first, with the title fields the UI needs to render and link. */
  async list(userId: string, profileId: string, take = 30) {
    const where = { userId, profileId: { in: [profileId, ""] } };
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        include: { title: { select: { slug: true, name: true, posterPath: true } } },
      }),
      this.prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return {
      unread,
      items: items.map((n) => ({ id: n.id, type: n.type, message: n.message, read: !!n.readAt, createdAt: n.createdAt, title: n.title })),
    };
  }

  /** Marks the given ids read, or every unread notification when `ids` is empty/omitted. */
  async markRead(userId: string, profileId: string, ids?: string[]) {
    await this.prisma.notification.updateMany({
      where: { userId, profileId: { in: [profileId, ""] }, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
  }

  reminders(userId: string, profileId: string) {
    return this.prisma.reminder.findMany({ where: { userId, profileId }, select: { titleId: true, title: { select: { slug: true } } } }).then((rows) => rows.map((r) => r.title.slug));
  }

  async remind(userId: string, profileId: string, titleId: string) {
    await this.prisma.reminder.upsert({
      where: { userId_profileId_titleId: { userId, profileId, titleId } },
      create: { userId, profileId, titleId },
      update: {},
    });
  }

  async unremind(userId: string, profileId: string, titleId: string) {
    await this.prisma.reminder.deleteMany({ where: { userId, profileId, titleId } });
  }
}
