import { Body, Controller, NotFoundException, Delete, Get, HttpCode, Param, Put, Post, Req, UseGuards } from "@nestjs/common";
import { IsInt, IsOptional, IsString, Min } from "class-validator";
import { AuthGuard, type AuthedRequest } from "../auth/auth.guard";
import { PrismaService } from "../common/prisma.service";
import { toPublicTitle } from "../titles/titles.service";

class WatchlistAddDto {
  @IsString() titleId: string;
}
class HistoryDto {
  @IsString() titleId: string;
  @IsOptional() @IsString() episodeId?: string;
  @IsInt() @Min(0) positionSec: number;
  @IsInt() @Min(0) durationSec: number;
}

@Controller("me")
@UseGuards(AuthGuard)
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("watchlist") async watchlist(@Req() req: AuthedRequest) {
    const rows = await this.prisma.watchlistItem.findMany({
      where: { userId: req.user.id, title: { published: true } },
      orderBy: { addedAt: "desc" },
      include: { title: { include: { sources: true } } },
    });
    return rows.map((r) => ({ addedAt: r.addedAt, title: toPublicTitle(r.title) }));
  }

  @Post("watchlist") @HttpCode(204) async add(@Req() req: AuthedRequest, @Body() dto: WatchlistAddDto) {
    const id = await this.resolveTitleId(dto.titleId);
    await this.prisma.watchlistItem.upsert({
      where: { userId_titleId: { userId: req.user.id, titleId: id } },
      create: { userId: req.user.id, titleId: id },
      update: {},
    });
  }

  @Delete("watchlist/:titleId") @HttpCode(204) async remove(@Req() req: AuthedRequest, @Param("titleId") titleId: string) {
    const id = await this.resolveTitleId(titleId);
    await this.prisma.watchlistItem.deleteMany({ where: { userId: req.user.id, titleId: id } });
  }

  @Get("history") async history(@Req() req: AuthedRequest) {
    const rows = await this.prisma.watchHistory.findMany({
      where: { userId: req.user.id, title: { published: true } },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: { title: { include: { sources: true } } },
    });
    return rows.map(({ title, userId: _u, ...h }) => ({ ...h, title: toPublicTitle(title) }));
  }

  @Put("history") @HttpCode(204) async progress(@Req() req: AuthedRequest, @Body() dto: HistoryDto) {
    const titleId = await this.resolveTitleId(dto.titleId);
    const episodeId = dto.episodeId ?? "";
    const data = { positionSec: dto.positionSec, durationSec: dto.durationSec };
    await this.prisma.watchHistory.upsert({
      where: { userId_titleId_episodeId: { userId: req.user.id, titleId, episodeId } },
      create: { userId: req.user.id, titleId, episodeId, ...data },
      update: data,
    });
  }

  private async resolveTitleId(idOrSlug: string): Promise<string> {
    const t = await this.prisma.title.findFirst({
      where: { published: true, OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      select: { id: true },
    });
    if (!t) throw new NotFoundException("Title not found");
    return t.id;
  }
}
