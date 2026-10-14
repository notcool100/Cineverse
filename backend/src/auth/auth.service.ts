import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import { MailerService } from "../common/mailer.service";
import { PrismaService } from "../common/prisma.service";
import { requireEnv } from "../common/secrets";
import type { LoginDto, RegisterDto } from "./dto";
import { RESET_TTL_MS, VERIFY_TTL_MS, cooldownLeftMs, hashToken, isUsable, newToken } from "./email-token";

const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mailer: MailerService,
  ) {}

  /** Public URL of the web app, used in email links. */
  private appUrl() {
    return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException("Email already registered");
    const user = await this.prisma.user.create({
      data: { email, name: dto.name, passwordHash: await argon2.hash(dto.password, { type: argon2.argon2id }) },
    });
    // Verification is a nudge, not a gate: sign-up succeeds even if the mail can't be sent.
    this.sendVerification(user.id).catch((e) => this.log.warn(`verification mail failed: ${(e as Error).message}`));
    return this.issue(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, dto.password)))
      throw new UnauthorizedException("Invalid credentials");
    return this.issue(user);
  }

  /** Rotating refresh tokens: each token is single-use. */
  async refresh(refreshToken: string) {
    const rec = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: true },
    });
    if (!rec || rec.revokedAt || rec.expiresAt < new Date()) throw new UnauthorizedException();
    await this.prisma.refreshToken.update({ where: { id: rec.id }, data: { revokedAt: new Date() } });
    return this.issue(rec.user);
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Current account details, including whether the email is verified. */
  async me(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new NotFoundException();
    return { id: u.id, email: u.email, name: u.name, role: u.role, emailVerified: !!u.emailVerifiedAt };
  }

  /** Emails a verification link (valid 3 days). At most one per minute per account. */
  async sendVerification(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new NotFoundException();
    if (u.emailVerifiedAt) return { alreadyVerified: true };
    const last = await this.prisma.emailToken.findFirst({ where: { userId, kind: "VERIFY" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    const wait = cooldownLeftMs(last?.createdAt);
    if (wait) throw new HttpException(`Please wait ${Math.ceil(wait / 1000)}s before requesting another email`, HttpStatus.TOO_MANY_REQUESTS);
    const { token, hash } = newToken();
    await this.prisma.emailToken.create({ data: { userId, kind: "VERIFY", tokenHash: hash, expiresAt: new Date(Date.now() + VERIFY_TTL_MS) } });
    const link = `${this.appUrl()}/verify-email?token=${token}`;
    await this.mailer.send({
      to: u.email,
      subject: "Confirm your email for Cineora",
      text: `Welcome to Cineora!\n\nConfirm your email address by opening this link (valid for 3 days):\n${link}\n\nIf you didn't create an account, you can ignore this message.`,
    });
    return { sent: true };
  }

  async verifyEmail(token: string) {
    const rec = await this.prisma.emailToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!rec || rec.kind !== "VERIFY" || !isUsable(rec)) throw new BadRequestException("This link is invalid or has expired. Request a new one.");
    await this.prisma.$transaction([
      this.prisma.emailToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
      this.prisma.user.update({ where: { id: rec.userId }, data: { emailVerifiedAt: new Date() } }),
    ]);
  }

  /** Always resolves the same way, so it can't be used to discover which emails have accounts. */
  async forgotPassword(email: string) {
    const u = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!u?.passwordHash) return;
    const { token, hash } = newToken();
    await this.prisma.emailToken.create({ data: { userId: u.id, kind: "RESET", tokenHash: hash, expiresAt: new Date(Date.now() + RESET_TTL_MS) } });
    const link = `${this.appUrl()}/reset-password?token=${token}`;
    await this.mailer.send({
      to: u.email,
      subject: "Reset your Cineora password",
      text: `Someone asked to reset the password for this Cineora account.\n\nChoose a new password here (valid for 1 hour):\n${link}\n\nIf this wasn't you, ignore this message; your password stays the same.`,
    });
  }

  /** Sets a new password, burns the token, and signs the account out everywhere. */
  async resetPassword(token: string, password: string) {
    const rec = await this.prisma.emailToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!rec || rec.kind !== "RESET" || !isUsable(rec)) throw new BadRequestException("This link is invalid or has expired. Request a new one.");
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.emailToken.update({ where: { id: rec.id }, data: { usedAt: now } }),
      // Following the emailed link also proves the address belongs to them.
      this.prisma.user.update({ where: { id: rec.userId }, data: { passwordHash, emailVerifiedAt: now } }),
      this.prisma.refreshToken.updateMany({ where: { userId: rec.userId, revokedAt: null }, data: { revokedAt: now } }),
      this.prisma.emailToken.updateMany({ where: { userId: rec.userId, kind: "RESET", usedAt: null }, data: { usedAt: now } }),
    ]);
  }

  private async issue(user: { id: string; email: string; name: string | null; role: "USER" | "ADMIN"; emailVerifiedAt: Date | null }) {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role },
      { secret: requireEnv("JWT_ACCESS_SECRET"), expiresIn: "15m" },
    );
    const refreshToken = randomBytes(48).toString("base64url");
    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: sha256(refreshToken), expiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
    });
    return { accessToken, refreshToken, user: { id: user.id, email: user.email, name: user.name, role: user.role, emailVerified: !!user.emailVerifiedAt } };
  }
}
