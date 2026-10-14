import { describe, expect, it } from "vitest";
import { notifyWatchers } from "../src/notifications/fanout";

type Key = { userId: string; profileId: string };
function fake(opts: { listed?: Key[]; reminded?: Key[]; recent?: Key[] }) {
  const created: Key[][] = [];
  const prisma = {
    watchlistItem: { findMany: async () => opts.listed ?? [] },
    reminder: { findMany: async () => opts.reminded ?? [] },
    notification: {
      findMany: async () => opts.recent ?? [],
      createMany: async ({ data }: { data: Key[] }) => (created.push(data), { count: data.length }),
    },
  };
  return { prisma: prisma as never, created };
}
const k = (userId: string, profileId = "p1"): Key => ({ userId, profileId });

describe("notifyWatchers", () => {
  it("notifies each profile once even if it both saved and set a reminder", async () => {
    const { prisma, created } = fake({ listed: [k("a"), k("b")], reminded: [k("a")] });
    expect(await notifyWatchers(prisma, "t", "SOURCE_ADDED", "msg", { includeReminders: true })).toBe(2);
    expect(created[0].map((x) => x.userId).sort()).toEqual(["a", "b"]);
  });
  it("ignores reminders unless asked", async () => {
    const { prisma } = fake({ listed: [k("a")], reminded: [k("z")] });
    expect(await notifyWatchers(prisma, "t", "EPISODE_ADDED", "msg")).toBe(1);
  });
  it("skips profiles already notified recently", async () => {
    const { prisma, created } = fake({ listed: [k("a"), k("b")], recent: [k("a")] });
    expect(await notifyWatchers(prisma, "t", "SOURCE_ADDED", "msg")).toBe(1);
    expect(created[0][0].userId).toBe("b");
  });
  it("does nothing when nobody is watching", async () => {
    const { prisma, created } = fake({});
    expect(await notifyWatchers(prisma, "t", "SOURCE_ADDED", "msg")).toBe(0);
    expect(created).toHaveLength(0);
  });
});
