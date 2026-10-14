import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { ArrayMaxSize, IsArray, IsOptional, IsString } from "class-validator";
import { AuthGuard, type AuthedRequest } from "../auth/auth.guard";
import { PrismaService } from "../common/prisma.service";
import { ProfilesService } from "../me/profiles.service";
import { NotificationsService } from "./notifications.service";

class ReadDto {
  /** Omit or send [] to mark everything read. */
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) ids?: string[];
}

@Controller("me")
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly profiles: ProfilesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("notifications") async list(@Req() req: AuthedRequest) {
    const p = await this.profiles.resolve(req);
    return this.notifications.list(req.user.id, p.id);
  }

  @Post("notifications/read") @HttpCode(204) async read(@Req() req: AuthedRequest, @Body() dto: ReadDto) {
    const p = await this.profiles.resolve(req);
    await this.notifications.markRead(req.user.id, p.id, dto.ids);
  }

  /** Slugs of the coming-soon titles this profile asked to be reminded about. */
  @Get("reminders") async reminders(@Req() req: AuthedRequest) {
    const p = await this.profiles.resolve(req);
    return this.notifications.reminders(req.user.id, p.id);
  }

  @Put("reminders/:titleId") @HttpCode(204) async remind(@Req() req: AuthedRequest, @Param("titleId") titleId: string) {
    const p = await this.profiles.resolve(req);
    await this.notifications.remind(req.user.id, p.id, await this.titleId(titleId));
  }

  @Delete("reminders/:titleId") @HttpCode(204) async unremind(@Req() req: AuthedRequest, @Param("titleId") titleId: string) {
    const p = await this.profiles.resolve(req);
    await this.notifications.unremind(req.user.id, p.id, await this.titleId(titleId));
  }

  private async titleId(idOrSlug: string) {
    const t = await this.prisma.title.findFirst({ where: { published: true, OR: [{ id: idOrSlug }, { slug: idOrSlug }] }, select: { id: true } });
    if (!t) throw new NotFoundException("Title not found");
    return t.id;
  }
}
