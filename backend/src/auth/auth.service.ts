import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../common/prisma.service";
import { requireEnv } from "../common/secrets";
import type { LoginDto, RegisterDto } from "./dto";

const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException("Email already registered");
    const user = await this.prisma.user.create({
      data: { email, name: dto.name, passwordHash: await argon2.hash(dto.password, { type: argon2.argon2id }) },
    });
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

  private async issue(user: { id: string; email: string; name: string | null; role: "USER" | "ADMIN" }) {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role },
      { secret: requireEnv("JWT_ACCESS_SECRET"), expiresIn: "15m" },
    );
    const refreshToken = randomBytes(48).toString("base64url");
    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: sha256(refreshToken), expiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
    });
    return { accessToken, refreshToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
  }
}
