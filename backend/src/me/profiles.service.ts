import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import type { Request } from "express";
import { PrismaService } from "../common/prisma.service";
import { requireEnv } from "../common/secrets";
import { PIN_PATTERN, PinAttempts } from "./pin-guard";

export const MAX_PROFILES = 5;
export const PROFILE_HEADER = "x-profile-id";
export const PROFILE_TOKEN_HEADER = "x-profile-token";
const PIN_TOKEN_TTL = "12h";

export interface ActiveProfile {
  id: string;
  isKids: boolean;
}

/** Profile as sent to clients: never the PIN hash, only whether one is set. */
export function toPublicProfile<T extends { pinHash?: string | null; prefs?: unknown }>(p: T) {
  const { pinHash, prefs: _prefs, ...rest } = p;
  return { ...rest, hasPin: !!pinHash };
}

@Injectable()
export class ProfilesService {
  private readonly attempts = new PinAttempts();
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** PIN tokens use a derived secret so they can never double as access tokens (the auth guard verifies with the plain one). */
  private pinSecret() {
    return `${requireEnv("JWT_ACCESS_SECRET")}:profile-pin`;
  }

  /** The account's profiles for display, oldest first. */
  async list(userId: string) {
    return (await this.all(userId)).map(toPublicProfile);
  }

  /** Internal: full rows (including the PIN hash). The first call creates a default profile and adopts pre-profile data. */
  private async all(userId: string) {
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
      this.prisma.userList.updateMany({ where: { userId, profileId: "" }, data: { profileId: created.id } }),
    ]);
    return [created];
  }

  /**
   * Profile named by the X-Profile-Id header if it belongs to the user, otherwise the first one.
   * A PIN-locked profile additionally needs a valid X-Profile-Token (from verify-pin), or the request is refused.
   */
  async resolve(req: Request & { user: { id: string } }): Promise<ActiveProfile> {
    const all = await this.all(req.user.id);
    const want = req.headers[PROFILE_HEADER];
    const p = all.find((x) => x.id === want) ?? all[0];
    if (p.pinHash && !(await this.tokenValid(req.user.id, p.id, req.headers[PROFILE_TOKEN_HEADER]))) throw new ForbiddenException("PIN required");
    return { id: p.id, isKids: p.isKids };
  }

  private async tokenValid(userId: string, profileId: string, token: string | string[] | undefined) {
    if (typeof token !== "string") return false;
    try {
      const c = await this.jwt.verifyAsync<{ sub: string; pid: string }>(token, { secret: this.pinSecret() });
      return c.sub === userId && c.pid === profileId;
    } catch {
      return false;
    }
  }

  /** Checks a PIN (with lockout after repeated failures) and returns a token that unlocks the profile for 12 hours. */
  async verifyPin(userId: string, profileId: string, pin: string) {
    const p = await this.prisma.profile.findFirst({ where: { id: profileId, userId }, select: { pinHash: true } });
    if (!p) throw new NotFoundException("Profile not found");
    if (!p.pinHash) return { token: null };
    const key = `${userId}:${profileId}`;
    const wait = this.attempts.waitSeconds(key);
    if (wait) throw new HttpException(`Too many wrong PINs. Try again in ${Math.ceil(wait / 60)} min.`, HttpStatus.TOO_MANY_REQUESTS);
    if (!PIN_PATTERN.test(pin) || !(await argon2.verify(p.pinHash, pin))) {
      this.attempts.fail(key);
      throw new ForbiddenException("Wrong PIN");
    }
    this.attempts.succeed(key);
    return { token: await this.jwt.signAsync({ sub: userId, pid: profileId }, { secret: this.pinSecret(), expiresIn: PIN_TOKEN_TTL }) };
  }

  /** Changing or deleting a locked profile needs that profile's unlock token, so a borrowed session can't remove the lock. */
  private async requireUnlocked(userId: string, profileId: string, token: string | string[] | undefined) {
    const p = await this.prisma.profile.findFirst({ where: { id: profileId, userId }, select: { pinHash: true } });
    if (!p) throw new NotFoundException("Profile not found");
    if (p.pinHash && !(await this.tokenValid(userId, profileId, token))) throw new ForbiddenException("PIN required");
  }

  async create(userId: string, data: { name: string; avatar?: string; isKids?: boolean; pin?: string }) {
    const count = await this.prisma.profile.count({ where: { userId } });
    await this.all(userId); // make sure legacy data is adopted by the default profile first
    if (count >= MAX_PROFILES) throw new BadRequestException(`At most ${MAX_PROFILES} profiles per account`);
    const pinHash = data.pin === undefined ? undefined : await this.hashPin(data.pin);
    const p = await this.prisma.profile.create({ data: { userId, name: data.name.trim(), avatar: data.avatar ?? "0", isKids: data.isKids ?? false, pinHash } });
    return toPublicProfile(p);
  }

  /** `pin`: a 4-digit string sets/changes the lock, `null` removes it, omitted leaves it alone. Locked profiles need `token`. */
  async update(
    userId: string,
    id: string,
    data: { name?: string; avatar?: string; isKids?: boolean; pin?: string | null },
    token?: string | string[],
  ) {
    await this.own(userId, id);
    await this.requireUnlocked(userId, id, token);
    const { pin, ...rest } = data;
    const pinHash = pin === undefined ? undefined : pin === null ? null : await this.hashPin(pin);
    const p = await this.prisma.profile.update({ where: { id }, data: { ...rest, ...(rest.name && { name: rest.name.trim() }), ...(pinHash !== undefined && { pinHash }) } });
    return toPublicProfile(p);
  }

  async remove(userId: string, id: string, token?: string | string[]) {
    await this.own(userId, id);
    await this.requireUnlocked(userId, id, token);
    if ((await this.prisma.profile.count({ where: { userId } })) <= 1) throw new BadRequestException("Can't delete the only profile");
    await this.prisma.$transaction([
      this.prisma.watchlistItem.deleteMany({ where: { userId, profileId: id } }),
      this.prisma.watchHistory.deleteMany({ where: { userId, profileId: id } }),
      this.prisma.rating.deleteMany({ where: { userId, profileId: id } }),
      this.prisma.userList.deleteMany({ where: { userId, profileId: id } }),
      this.prisma.notification.deleteMany({ where: { userId, profileId: id } }),
      this.prisma.reminder.deleteMany({ where: { userId, profileId: id } }),
      this.prisma.profile.delete({ where: { id } }),
    ]);
  }

  private async hashPin(pin: string) {
    if (!PIN_PATTERN.test(pin)) throw new BadRequestException("A PIN is exactly 4 digits");
    return argon2.hash(pin, { type: argon2.argon2id });
  }

  private async own(userId: string, id: string) {
    const p = await this.prisma.profile.findFirst({ where: { id, userId }, select: { id: true } });
    if (!p) throw new NotFoundException("Profile not found");
  }
}
