import type { NotificationType, PrismaClient } from "@prisma/client";

const DEDUPE_MS = 24 * 3600_000;

/**
 * Notifies every profile that has the title on its list or a reminder set. Plain function over a Prisma client
 * so import scripts can use it too. Skips a profile that already got the same kind of notification for the
 * title in the last 24h (adding five sources in a row sends one notification). Returns how many were created.
 */
export async function notifyWatchers(
  prisma: Pick<PrismaClient, "watchlistItem" | "reminder" | "notification">,
  titleId: string,
  type: NotificationType,
  message: string,
  opts: { includeReminders?: boolean } = {},
): Promise<number> {
  const [listed, reminded] = await Promise.all([
    prisma.watchlistItem.findMany({ where: { titleId }, select: { userId: true, profileId: true } }),
    opts.includeReminders ? prisma.reminder.findMany({ where: { titleId }, select: { userId: true, profileId: true } }) : Promise.resolve([]),
  ]);
  const targets = new Map([...listed, ...reminded].map((r) => [`${r.userId}|${r.profileId}`, r]));
  if (targets.size === 0) return 0;
  const recent = await prisma.notification.findMany({
    where: { titleId, type, createdAt: { gte: new Date(Date.now() - DEDUPE_MS) } },
    select: { userId: true, profileId: true },
  });
  for (const r of recent) targets.delete(`${r.userId}|${r.profileId}`);
  if (targets.size === 0) return 0;
  const { count } = await prisma.notification.createMany({
    data: [...targets.values()].map((t) => ({ userId: t.userId, profileId: t.profileId, titleId, type, message })),
  });
  return count;
}
