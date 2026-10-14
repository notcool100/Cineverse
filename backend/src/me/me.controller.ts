import { Body, Controller, NotFoundException, Delete, Get, HttpCode, Param, Put, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Min } from "class-validator";
import { AuthGuard, type AuthedRequest } from "../auth/auth.guard";
import { PrismaService } from "../common/prisma.service";
import { ProfilesService } from "./profiles.service";
import { HomeService } from "../titles/home.service";
import { toPublicTitle } from "../titles/titles.service";
import { resolvePrefs, sanitizePrefs, SUBTITLE_SIZES } from "./profile-prefs";

class WatchlistAddDto {
  @IsString() titleId: string;
}
class HistoryDto {
  @IsString() titleId: string;
  @IsOptional() @IsString() episodeId?: string;
  @IsInt() @Min(0) positionSec: number;
  @IsInt() @Min(0) durationSec: number;
}

class SeasonWatchedDto {
  @IsBoolean() watched: boolean;
}

class PrefsDto {
  @IsOptional() @IsString() @Matches(/^([a-z]{2,3})?$/) audioLang?: string;
  @IsOptional() @IsString() @Matches(/^([a-z]{2,3})?$/) subtitleLang?: string;
  @IsOptional() @IsIn(SUBTITLE_SIZES) subtitleSize?: string;
  @IsOptional() @IsBoolean() autoplayNext?: boolean;
  @IsOptional() @IsBoolean() autoplayPreviews?: boolean;
  @IsOptional() @IsBoolean() autoSkipIntro?: boolean;
}

class RatingDto {
  /** 1 = thumbs up, -1 = thumbs down. */
  @IsInt() @IsIn([1, -1]) value: number;
}

@Controller("me")
@UseGuards(AuthGuard)
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly home: HomeService,
    private readonly profiles: ProfilesService,
  ) {}

  /** Personalized home rows: continue watching, because-you-watched, picked for you. */
  @Get("home") forYou(@Req() req: AuthedRequest) {
    return this.profiles.resolve(req).then((p) => this.home.forUser(req.user.id, p));
  }

  /** `?ids=slug1,slug2` (max 40) → `{ slug: 0‑100 }` taste match for the active profile; unscored titles are omitted. */
  @Get("match") async match(@Req() req: AuthedRequest, @Query("ids") ids = "") {
    const list = [...new Set(ids.split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 40);
    if (list.length === 0) return {};
    const p = await this.profiles.resolve(req);
    return this.home.match(req.user.id, p.id, list);
  }

  /** Playback preferences of the active profile (defaults filled in). */
  @Get("profile-prefs") async prefs(@Req() req: AuthedRequest) {
    const p = await this.profiles.resolve(req);
    const row = await this.prisma.profile.findUnique({ where: { id: p.id }, select: { prefs: true } });
    return resolvePrefs(row?.prefs);
  }

  /** Partial update: only the fields sent change. */
  @Put("profile-prefs") async setPrefs(@Req() req: AuthedRequest, @Body() dto: PrefsDto) {
    const p = await this.profiles.resolve(req);
    const row = await this.prisma.profile.findUnique({ where: { id: p.id }, select: { prefs: true } });
    const next = resolvePrefs(row?.prefs, sanitizePrefs(dto));
    await this.prisma.profile.update({ where: { id: p.id }, data: { prefs: { ...next } } });
    return next;
  }

  @Get("watchlist") async watchlist(@Req() req: AuthedRequest) {
    const p = await this.profiles.resolve(req);
    const rows = await this.prisma.watchlistItem.findMany({
      where: { userId: req.user.id, profileId: p.id, title: { published: true } },
      orderBy: { addedAt: "desc" },
      include: { title: { include: { sources: true } } },
    });
    return rows.map((r) => ({ addedAt: r.addedAt, title: toPublicTitle(r.title) }));
  }

  @Post("watchlist") @HttpCode(204) async add(@Req() req: AuthedRequest, @Body() dto: WatchlistAddDto) {
    const p = await this.profiles.resolve(req);
    const id = await this.resolveTitleId(dto.titleId);
    await this.prisma.watchlistItem.upsert({
      where: { userId_profileId_titleId: { userId: req.user.id, profileId: p.id, titleId: id } },
      create: { userId: req.user.id, profileId: p.id, titleId: id },
      update: {},
    });
  }

  @Delete("watchlist/:titleId") @HttpCode(204) async remove(@Req() req: AuthedRequest, @Param("titleId") titleId: string) {
    const p = await this.profiles.resolve(req);
    const id = await this.resolveTitleId(titleId);
    await this.prisma.watchlistItem.deleteMany({ where: { userId: req.user.id, profileId: p.id, titleId: id } });
  }

  @Get("history") async history(@Req() req: AuthedRequest) {
    const p = await this.profiles.resolve(req);
    const rows = await this.prisma.watchHistory.findMany({
      where: { userId: req.user.id, profileId: p.id, title: { published: true } },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: { title: { include: { sources: true } } },
    });
    return rows.map(({ title, userId: _u, ...h }) => ({ ...h, title: toPublicTitle(title) }));
  }

  @Put("history") @HttpCode(204) async progress(@Req() req: AuthedRequest, @Body() dto: HistoryDto) {
    const p = await this.profiles.resolve(req);
    const titleId = await this.resolveTitleId(dto.titleId);
    const episodeId = dto.episodeId ?? "";
    const data = { positionSec: dto.positionSec, durationSec: dto.durationSec };
    // 0/0 is a "started playing" marker from players that can't report progress (iframes): keep any saved position.
    const marker = dto.positionSec === 0 && dto.durationSec === 0;
    await this.prisma.watchHistory.upsert({
      where: { userId_profileId_titleId_episodeId: { userId: req.user.id, profileId: p.id, titleId, episodeId } },
      create: { userId: req.user.id, profileId: p.id, titleId, episodeId, ...data },
      update: marker ? { updatedAt: new Date() } : data,
    });
  }

  /**
   * Viewing activity, newest first, one row per title/episode. Page with `?before=<ISO date of the last row>`.
   * Rows are lean (no sources) because the page only lists and removes them.
   */
  @Get("activity") async activity(@Req() req: AuthedRequest, @Query("before") before?: string, @Query("limit") limit?: string) {
    const p = await this.profiles.resolve(req);
    const take = Math.min(100, Math.max(1, Number.parseInt(limit ?? "40", 10) || 40));
    const cursor = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : undefined;
    const rows = await this.prisma.watchHistory.findMany({
      where: { userId: req.user.id, profileId: p.id, title: { published: true }, ...(cursor && { updatedAt: { lt: cursor } }) },
      orderBy: { updatedAt: "desc" },
      take: take + 1,
      include: { title: { select: { slug: true, name: true, type: true, year: true, posterPath: true, accent: true } } },
    });
    const page = rows.slice(0, take);
    return {
      items: page.map((r) => ({
        titleId: r.title.slug,
        episodeId: r.episodeId,
        positionSec: r.positionSec,
        durationSec: r.durationSec,
        updatedAt: r.updatedAt,
        title: r.title,
      })),
      next: rows.length > take ? page[page.length - 1].updatedAt : null,
    };
  }

  /** Clears the active profile's whole viewing history. */
  @Delete("history") @HttpCode(204) async clearHistory(@Req() req: AuthedRequest) {
    const p = await this.profiles.resolve(req);
    await this.prisma.watchHistory.deleteMany({ where: { userId: req.user.id, profileId: p.id } });
  }

  /** Removes a title (every episode, or just `?episodeId=`) from history, which also drops it from Continue watching. */
  @Delete("history/:titleId") @HttpCode(204) async removeHistory(@Req() req: AuthedRequest, @Param("titleId") titleId: string, @Query("episodeId") episodeId?: string) {
    const p = await this.profiles.resolve(req);
    const id = await this.resolveTitleId(titleId);
    await this.prisma.watchHistory.deleteMany({
      where: { userId: req.user.id, profileId: p.id, titleId: id, ...(episodeId !== undefined && { episodeId }) },
    });
  }

  /** Per-episode progress for one series, used for watched checkmarks and resume bars. */
  @Get("history/:titleId") async titleHistory(@Req() req: AuthedRequest, @Param("titleId") titleId: string) {
    const p = await this.profiles.resolve(req);
    const id = await this.resolveTitleId(titleId);
    const rows = await this.prisma.watchHistory.findMany({
      where: { userId: req.user.id, profileId: p.id, titleId: id, episodeId: { not: "" } },
      select: { episodeId: true, positionSec: true, durationSec: true },
    });
    return rows;
  }

  /** Marks every episode of a season watched (or clears them with watched=false). */
  @Put("history/:titleId/season/:season") @HttpCode(204) async markSeason(
    @Req() req: AuthedRequest,
    @Param("titleId") titleId: string,
    @Param("season") season: string,
    @Body() dto: SeasonWatchedDto,
  ) {
    const p = await this.profiles.resolve(req);
    const id = await this.resolveTitleId(titleId);
    const n = Number(season);
    if (!Number.isInteger(n) || n < 0) throw new NotFoundException("Season not found");
    const eps = await this.prisma.episode.findMany({ where: { titleId: id, season: n }, select: { number: true } });
    const keys = eps.map((e) => `S${n}E${e.number}`);
    if (!dto.watched) {
      await this.prisma.watchHistory.deleteMany({ where: { userId: req.user.id, profileId: p.id, titleId: id, episodeId: { in: keys } } });
      return;
    }
    // Position == duration reads as finished; the real length is unknown for episodes watched elsewhere.
    await this.prisma.$transaction(
      keys.map((episodeId) =>
        this.prisma.watchHistory.upsert({
          where: { userId_profileId_titleId_episodeId: { userId: req.user.id, profileId: p.id, titleId: id, episodeId } },
          create: { userId: req.user.id, profileId: p.id, titleId: id, episodeId, positionSec: 1, durationSec: 1 },
          update: { positionSec: 1, durationSec: 1 },
        }),
      ),
    );
  }

  @Get("ratings/:titleId") async rating(@Req() req: AuthedRequest, @Param("titleId") titleId: string) {
    const p = await this.profiles.resolve(req);
    const id = await this.resolveTitleId(titleId);
    const r = await this.prisma.rating.findUnique({ where: { userId_profileId_titleId: { userId: req.user.id, profileId: p.id, titleId: id } } });
    return { value: r?.value ?? 0 };
  }

  @Put("ratings/:titleId") @HttpCode(204) async rate(@Req() req: AuthedRequest, @Param("titleId") titleId: string, @Body() dto: RatingDto) {
    const p = await this.profiles.resolve(req);
    const id = await this.resolveTitleId(titleId);
    await this.prisma.rating.upsert({
      where: { userId_profileId_titleId: { userId: req.user.id, profileId: p.id, titleId: id } },
      create: { userId: req.user.id, profileId: p.id, titleId: id, value: dto.value },
      update: { value: dto.value },
    });
  }

  @Delete("ratings/:titleId") @HttpCode(204) async unrate(@Req() req: AuthedRequest, @Param("titleId") titleId: string) {
    const p = await this.profiles.resolve(req);
    const id = await this.resolveTitleId(titleId);
    await this.prisma.rating.deleteMany({ where: { userId: req.user.id, profileId: p.id, titleId: id } });
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
