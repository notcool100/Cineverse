import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { requireEnv } from "../common/secrets";

export interface AuthUser {
  id: string;
  role: "USER" | "ADMIN";
}
export type AuthedRequest = Request & { user: AuthUser };

export const ROLES_KEY = "roles";
export const Roles = (...roles: AuthUser["role"][]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException();
    try {
      const p = await this.jwt.verifyAsync<{ sub: string; role: AuthUser["role"] }>(token, {
        secret: requireEnv("JWT_ACCESS_SECRET"),
      });
      req.user = { id: p.sub, role: p.role };
    } catch {
      throw new UnauthorizedException();
    }
    const roles = this.reflector.getAllAndOverride<AuthUser["role"][] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (roles && !roles.includes(req.user.role)) throw new ForbiddenException();
    return true;
  }
}
