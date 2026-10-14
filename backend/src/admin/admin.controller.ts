import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Put, Query, Req, UseGuards, Logger } from "@nestjs/common";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from "class-validator";
import { PartialType } from "@nestjs/swagger";
import { SourceKind, TitleType } from "@prisma/client";
import { AuthGuard, Roles, type AuthedRequest } from "../auth/auth.guard";
import { PrismaService } from "../common/prisma.service";
import { requireEnv } from "../common/secrets";
import { SearchService } from "../search/search.service";
import { TitlesService } from "../titles/titles.service";
import { RedisService } from "../common/redis.service";
import * as argon2 from "argon2";
import { Prisma } from "@prisma/client";
import { loadDbHosts } from "../playback/embed-hosts";
import { envEmbedHosts, isValidHost, validateTemplate } from "../playback/embed-template";
import { validateMarkers } from "./markers";
import { AnalyticsService } from "./analytics.service";
import { NotificationsService } from "../notifications/notifications.service";

class CreateTitleDto {
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/) @MaxLength(100) slug: string;
  @IsEnum(TitleType) type: TitleType;
  @IsString() @MinLength(1) @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(5000) overview?: string;
  @IsOptional() @IsInt() year?: number;
  @IsOptional() @IsInt() @Min(0) runtimeMin?: number;
  @IsOptional() @IsString() rating?: string;
  @IsOptional() @IsString() posterPath?: string;
  @IsOptional() @IsString() backdropPath?: string;
  @IsOptional() @IsString() posterCredit?: string;
  @IsOptional() @IsString() backdropCredit?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(2) @IsString({ each: true }) accent?: string[];
  @IsOptional() @IsInt() tmdbId?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) genres?: string[];
  @IsOptional() @IsBoolean() published?: boolean;
}
class UpdateTitleDto extends PartialType(CreateTitleDto) {}

class CreateSourceDto {
  @IsEnum(SourceKind) kind: SourceKind;
  @IsString() @MaxLength(60) label: string;
  @IsOptional() @IsInt() priority?: number;
  @IsOptional() @IsString() manifestKey?: string;
  /** YouTube id, watch-provider URL, direct stream URL, or embed provider slug. */
  @IsOptional() @IsString() @MaxLength(2000) externalUrl?: string;
}

class ProviderDto {
  @Matches(/^[a-z0-9-]+$/) slug: string;
  @IsString() @MaxLength(60) label: string;
  @IsString() @MaxLength(2000) urlTemplate: string;
  @IsOptional() @IsString() @MaxLength(2000) episodeUrlTemplate?: string;
  @IsOptional() @IsString() licenseRef?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @Matches(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/, { each: true }) languages?: string[];
  @IsOptional() @Type(() => Number) @IsInt() priority?: number;
}

interface TmdbMovie {
  title?: string; name?: string; overview?: string; poster_path?: string; backdrop_path?: string;
  release_date?: string; first_air_date?: string; runtime?: number; genres?: { name: string }[]; original_language?: string;
}

class HostDto {
  @IsString() @MaxLength(253) host: string;
}

class AdminUserDto {
  @IsEmail() email: string;
  @IsString() @MinLength(12) @MaxLength(200) password: string;
}

/** Playback markers; `null` clears a value, an omitted field is left unchanged. */
class MarkersDto {
  @IsOptional() @IsInt() @Min(0) introStartSec?: number | null;
  @IsOptional() @IsInt() @Min(0) introEndSec?: number | null;
  @IsOptional() @IsInt() @Min(0) creditsStartSec?: number | null;
}

class EpisodeDto {
  @IsInt() @Min(0) season: number;
  @IsInt() @Min(1) number: number;
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(5000) overview?: string;
  @IsOptional() @IsInt() @Min(0) runtimeMin?: number;
}

class ImportTmdbDto {
  @IsInt() tmdbId: number;
  @IsEnum(TitleType) type: TitleType;
}

@Controller("admin")
@UseGuards(AuthGuard)
@Roles("ADMIN")
export class AdminController {
  private readonly log = new Logger("admin-audit");
  constructor(
    private readonly prisma: PrismaService,
    private readonly titles: TitlesService,
    private readonly search: SearchService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationsService,
    private readonly analytics: AnalyticsService,
  ) {}

  /** Keep the cache and search index consistent after a write. */
  private async refresh(titleId?: string) {
    await this.titles.invalidate();
    if (titleId) await this.search.sync(titleId);
  }

  private audit(req: AuthedRequest, action: string, target: string) {
    this.log.log(`${req.user.id} ${action} ${target}`);
  }

  /** Dashboard numbers: totals, per-day views/watches/signups, top titles, flagged sources. `days` 7–60. */
  @Get("analytics") overview(@Query("days") days?: string) {
    const n = Math.min(60, Math.max(7, Number.parseInt(days ?? "14", 10) || 14));
    return this.analytics.overview(n);
  }

  @Get("titles") listTitles() {
    return this.prisma.title.findMany({ orderBy: { createdAt: "desc" }, include: { sources: true } });
  }

  @Post("titles") async createTitle(@Req() req: AuthedRequest, @Body() dto: CreateTitleDto) {
    const t = await this.prisma.title.create({ data: { ...dto, genres: dto.genres ?? [] } });
    await this.refresh(t.id);
    this.audit(req, "title.create", t.id);
    return t;
  }

  @Patch("titles/:id") async updateTitle(@Req() req: AuthedRequest, @Param("id") id: string, @Body() dto: UpdateTitleDto) {
    const t = await this.prisma.title.update({ where: { id }, data: dto }).catch((e) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ConflictException("That TMDB id or slug is already used by another title");
      return null;
    });
    if (!t) throw new NotFoundException();
    await this.refresh(id);
    this.audit(req, "title.update", id);
    return t;
  }

  /** Quick takedown (PROJECT.md §9): unpublish without deleting. */
  @Post("titles/:id/unpublish") @HttpCode(204) async unpublish(@Req() req: AuthedRequest, @Param("id") id: string) {
    await this.prisma.title.update({ where: { id }, data: { published: false } }).catch(() => {
      throw new NotFoundException();
    });
    await this.refresh(id);
    this.audit(req, "title.unpublish", id);
  }

  @Post("titles/:id/sources") async addSource(@Req() req: AuthedRequest, @Param("id") titleId: string, @Body() dto: CreateSourceDto) {
    if (dto.kind === "EMBED_PROVIDER") {
      const p = await this.prisma.embedProvider.findUnique({ where: { slug: dto.externalUrl ?? "" } });
      if (!p) throw new BadRequestException("externalUrl must be the slug of an existing embed provider");
    }
    if (dto.kind === "YOUTUBE_OFFICIAL" && !/^[\w-]{11}$/.test(dto.externalUrl ?? ""))
      throw new BadRequestException("externalUrl must be an 11-char YouTube video id");
    const title = await this.prisma.title.findUnique({ where: { id: titleId }, select: { name: true, published: true, _count: { select: { sources: { where: { status: "READY" } } } } } });
    const s = await this.prisma.source.create({ data: { ...dto, titleId } });
    await this.refresh();
    this.audit(req, "source.create", s.id);
    // Only the first playable source is news: "it's now available" for people who saved or are waiting on it.
    if (title?.published && title._count.sources === 0) await this.notifications.notifyWatchers(titleId, "SOURCE_ADDED", `${title.name} is now available to watch`);
    return s;
  }

  @Delete("sources/:id") @HttpCode(204) async deleteSource(@Req() req: AuthedRequest, @Param("id") id: string) {
    await this.prisma.source.delete({ where: { id } }).catch(() => {
      throw new NotFoundException();
    });
    await this.refresh();
    this.audit(req, "source.delete", id);
  }

  /** Episodes of a series with their playback markers, for the marker editor. */
  @Get("titles/:id/episodes") episodes(@Param("id") id: string) {
    return this.prisma.episode.findMany({
      where: { titleId: id },
      orderBy: [{ season: "asc" }, { number: "asc" }],
      select: { id: true, season: true, number: true, name: true, runtimeMin: true, introStartSec: true, introEndSec: true, creditsStartSec: true },
    });
  }

  @Patch("episodes/:id/markers") async setEpisodeMarkers(@Req() req: AuthedRequest, @Param("id") id: string, @Body() dto: MarkersDto) {
    const cur = await this.prisma.episode.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException();
    const merged = {
      introStartSec: dto.introStartSec === undefined ? cur.introStartSec : dto.introStartSec,
      introEndSec: dto.introEndSec === undefined ? cur.introEndSec : dto.introEndSec,
      creditsStartSec: dto.creditsStartSec === undefined ? cur.creditsStartSec : dto.creditsStartSec,
    };
    const err = validateMarkers(merged, cur.runtimeMin ? cur.runtimeMin * 60 : null);
    if (err) throw new BadRequestException(err);
    const ep = await this.prisma.episode.update({ where: { id }, data: merged });
    await this.titles.invalidate();
    this.audit(req, "episode.markers", id);
    return ep;
  }

  /** Applies the same markers to every episode of a season (typical for a show with a fixed-length intro). */
  @Put("titles/:id/seasons/:season/markers") async setSeasonMarkers(
    @Req() req: AuthedRequest,
    @Param("id") id: string,
    @Param("season") season: string,
    @Body() dto: MarkersDto,
  ) {
    const n = Number(season);
    if (!Number.isInteger(n) || n < 0) throw new NotFoundException();
    const data = {
      introStartSec: dto.introStartSec ?? null,
      introEndSec: dto.introEndSec ?? null,
      creditsStartSec: dto.creditsStartSec ?? null,
    };
    const err = validateMarkers(data);
    if (err) throw new BadRequestException(err);
    const { count } = await this.prisma.episode.updateMany({ where: { titleId: id, season: n }, data });
    await this.titles.invalidate();
    this.audit(req, "season.markers", `${id}:${n}`);
    return { updated: count };
  }

  /** Adds (or updates) one episode of a series and tells the people who saved the series. */
  @Post("titles/:id/episodes") async addEpisode(@Req() req: AuthedRequest, @Param("id") titleId: string, @Body() dto: EpisodeDto) {
    const title = await this.prisma.title.findUnique({ where: { id: titleId }, select: { name: true, type: true, published: true } });
    if (!title || title.type !== "SERIES") throw new NotFoundException();
    const where = { titleId_season_number: { titleId, season: dto.season, number: dto.number } };
    const existed = !!(await this.prisma.episode.findUnique({ where }));
    const data = { name: dto.name, overview: dto.overview, runtimeMin: dto.runtimeMin };
    const ep = await this.prisma.episode.upsert({ where, create: { titleId, season: dto.season, number: dto.number, ...data }, update: data });
    await this.titles.invalidate();
    this.audit(req, "episode.add", ep.id);
    if (!existed && title.published)
      await this.notifications.notifyWatchers(titleId, "EPISODE_ADDED", `${title.name}: new episode S${dto.season}·E${dto.number}${dto.name ? ` “${dto.name}”` : ""}`);
    return ep;
  }

  @Get("embed-providers") providers() {
    return this.prisma.embedProvider.findMany({ orderBy: { priority: "asc" } });
  }

  @Post("embed-providers") async createProvider(@Req() req: AuthedRequest, @Body() dto: ProviderDto) {
    this.checkProvider(dto);
    const p = await this.prisma.embedProvider.create({ data: { ...dto, licenseRef: dto.licenseRef ?? "" } });
    await this.refresh();
    this.audit(req, "provider.create", p.slug);
    return p;
  }

  @Patch("embed-providers/:slug") async updateProvider(@Req() req: AuthedRequest, @Param("slug") slug: string, @Body() dto: Partial<ProviderDto>) {
    const cur = await this.prisma.embedProvider.findUnique({ where: { slug } });
    if (!cur) throw new NotFoundException();
    this.checkProvider({ ...cur, ...dto });
    const p = await this.prisma.embedProvider.update({ where: { slug }, data: dto });
    await this.refresh();
    this.audit(req, "provider.update", slug);
    return p;
  }

  @Get("embed-hosts") async hosts() {
    return { env: envEmbedHosts(), added: (await this.prisma.allowedHost.findMany({ orderBy: { host: "asc" } })).map((h) => h.host) };
  }

  @Post("embed-hosts") async addHost(@Req() req: AuthedRequest, @Body() dto: HostDto) {
    const host = dto.host.trim().toLowerCase();
    if (!isValidHost(host)) throw new BadRequestException("Enter a bare hostname such as player.example.com (no scheme, port, path or IP)");
    await this.prisma.allowedHost.upsert({ where: { host }, create: { host }, update: {} });
    await loadDbHosts(this.prisma);
    this.audit(req, "host.add", host);
    return { host };
  }

  @Delete("embed-hosts/:host") @HttpCode(204) async removeHost(@Req() req: AuthedRequest, @Param("host") host: string) {
    await this.prisma.allowedHost.delete({ where: { host: host.toLowerCase() } }).catch(() => {
      throw new NotFoundException();
    });
    await loadDbHosts(this.prisma);
    this.audit(req, "host.remove", host);
  }

  /** Creates an admin, or promotes/updates the existing user with that email. The first admin comes from `pnpm db:seed`. */
  @Post("admins") async setAdmin(@Req() req: AuthedRequest, @Body() dto: AdminUserDto) {
    const email = dto.email.toLowerCase();
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const u = await this.prisma.user.upsert({
      where: { email },
      create: { email, passwordHash, role: "ADMIN" },
      update: { passwordHash, role: "ADMIN" },
    });
    this.audit(req, "admin.set", u.id);
    return { id: u.id, email: u.email, role: u.role };
  }

  /** Metadata only (posters, overview, genres). Imported titles stay unpublished until reviewed. */
  @Post("titles/import-tmdb") async importTmdb(@Req() req: AuthedRequest, @Body() dto: ImportTmdbDto) {
    const kind = dto.type === "MOVIE" ? "movie" : "tv";
    const m = await this.redis.cached(`tmdb:${kind}:${dto.tmdbId}`, 24 * 3600, async () => {
      const res = await fetch(`https://api.themoviedb.org/3/${kind}/${dto.tmdbId}`, {
        headers: { Authorization: `Bearer ${requireEnv("TMDB_API_KEY")}` },
      });
      if (!res.ok) throw new BadRequestException(`TMDB returned ${res.status}`);
      return (await res.json()) as TmdbMovie;
    });
    const name = m.title ?? m.name ?? `tmdb-${dto.tmdbId}`;
    const date = m.release_date || m.first_air_date || undefined;
    const data = {
      type: dto.type,
      name,
      overview: m.overview,
      posterPath: m.poster_path,
      backdropPath: m.backdrop_path,
      releaseDate: date ? new Date(date) : undefined,
      year: date ? new Date(date).getUTCFullYear() : undefined,
      runtimeMin: m.runtime,
      genres: m.genres?.map((g) => g.name) ?? [],
      language: m.original_language ?? null,
    };
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${dto.tmdbId}`;
    const t = await this.prisma.title.upsert({
      where: { tmdbId: dto.tmdbId },
      create: { ...data, tmdbId: dto.tmdbId, slug },
      update: data,
    });
    await this.refresh(t.id);
    this.audit(req, "title.import-tmdb", t.id);
    return t;
  }

  private checkProvider(p: { slug: string; label: string; urlTemplate: string; episodeUrlTemplate?: string | null; licenseRef?: string | null; enabled?: boolean }) {
    for (const tpl of [p.urlTemplate, p.episodeUrlTemplate]) {
      const err = tpl ? validateTemplate(tpl) : null;
      if (err) throw new BadRequestException(err);
    }
  }
}
