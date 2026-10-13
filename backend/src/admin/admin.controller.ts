import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Req, UseGuards, Logger } from "@nestjs/common";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUrl, Matches, MaxLength, Min, MinLength } from "class-validator";
import { PartialType } from "@nestjs/swagger";
import { SourceKind, TitleType } from "@prisma/client";
import { AuthGuard, Roles, type AuthedRequest } from "../auth/auth.guard";
import { PrismaService } from "../common/prisma.service";
import { requireEnv } from "../common/secrets";
import { SearchService } from "../search/search.service";
import { TitlesService } from "../titles/titles.service";
import { RedisService } from "../common/redis.service";
import { isBlockedProvider } from "./blocklist";

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
  @IsUrl({ protocols: ["https"], require_protocol: true }) urlTemplate: string;
  @IsOptional() @IsString() episodeUrlTemplate?: string;
  @IsOptional() @IsString() licenseRef?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() priority?: number;
}

interface TmdbMovie {
  title?: string; name?: string; overview?: string; poster_path?: string; backdrop_path?: string;
  release_date?: string; first_air_date?: string; runtime?: number; genres?: { name: string }[];
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
  ) {}

  /** Keep the cache and search index consistent after a write. */
  private async refresh(titleId?: string) {
    await this.titles.invalidate();
    if (titleId) await this.search.sync(titleId);
  }

  private audit(req: AuthedRequest, action: string, target: string) {
    this.log.log(`${req.user.id} ${action} ${target}`);
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
    const t = await this.prisma.title.update({ where: { id }, data: dto }).catch(() => null);
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
    const s = await this.prisma.source.create({ data: { ...dto, titleId } });
    await this.refresh();
    this.audit(req, "source.create", s.id);
    return s;
  }

  @Delete("sources/:id") @HttpCode(204) async deleteSource(@Req() req: AuthedRequest, @Param("id") id: string) {
    await this.prisma.source.delete({ where: { id } }).catch(() => {
      throw new NotFoundException();
    });
    await this.refresh();
    this.audit(req, "source.delete", id);
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

  private checkProvider(p: { slug: string; label: string; urlTemplate: string; licenseRef?: string | null; enabled?: boolean }) {
    if (isBlockedProvider(p.slug, p.label, p.urlTemplate))
      throw new BadRequestException("This provider is on the unlicensed blocklist (PROJECT.md §2)");
    if (p.enabled && !p.licenseRef?.trim()) throw new BadRequestException("licenseRef is required to enable a provider");
  }
}
