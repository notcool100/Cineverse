import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../common/prisma.service";

export const MAX_PROFILES = 5;
export const PROFILE_HEADER = "x-profile-id";

export interface ActiveProfile {
  id: string;
  isKids: boolean;
}

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  /** The account's profiles, oldest first. The first call creates a default one and adopts pre-profile data. */
  async list(userId: string) {
    const existing = await this.prisma.profile.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
    if (existing.length) return existing;
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
    const created = await this.prisma.profile.create({
      data: { userId, name: u?.name?.trim() || u?.email.split("@")[0] || "Me" },
    });
    await this.prisma.$transaction([
      this.prisma.watchlistItem.updateMany({ where: { userId, profileId: "" }, data: { profileId: created.id } }),
      this.prisma.watchHistory.updateMany({ where: { userId, profileId: "" }, data: { profileId: created.id } }),
      this.prisma.rating.updateMany({ where: { userId, profileId: "" }, data: { profileId: created.id } }),
    ]);
    return [created];
  }

  /** Profile named by the X-Profile-Id header if it belongs to the user, otherwise the first one. */
  async resolve(req: Request & { user: { id: string } }): Promise<ActiveProfile> {
    const all = await this.list(req.user.id);
    const want = req.headers[PROFILE_HEADER];
    return all.find((p) => p.id === want) ?? all[0];
  }

  async create(userId: string, data: { name: string; avatar?: string; isKids?: boolean }) {
    const count = await this.prisma.profile.count({ where: { userId } });
    await this.list(userId); // make sure legacy data is adopted by the default profile first
    if (count >= MAX_PROFILES) throw new BadRequestException(`At most ${MAX_PROFILES} profiles per account`);
    return this.prisma.profile.create({ data: { userId, name: data.name.trim(), avatar: data.avatar ?? "0", isKids: data.isKids ?? false } });
  }

  async update(userId: string, id: string, data: { name?: string; avatar?: string; isKids?: boolean }) {
    await this.own(userId, id);
    return this.prisma.profile.update({ where: { id }, data: { ...data, ...(data.name && { name: data.name.trim() }) } });
  }

  async remove(userId: string, id: string) {
    await this.own(userId, id);
    if ((await this.prisma.profile.count({ where: { userId } })) <= 1) throw new BadRequestException("Can't delete the only profile");
    await this.prisma.$transaction([
      this.prisma.watchlistItem.deleteMany({ where: { userId, profileId: id } }),
      this.prisma.watchHistory.deleteMany({ where: { userId, profileId: id } }),
      this.prisma.rating.deleteMany({ where: { userId, profileId: id } }),
      this.prisma.profile.delete({ where: { id } }),
    ]);
  }

  private async own(userId: string, id: string) {
    const p = await this.prisma.profile.findFirst({ where: { id, userId }, select: { id: true } });
    if (!p) throw new NotFoundException("Profile not found");
  }
}
