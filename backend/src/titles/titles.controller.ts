import { Controller, Get, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Request } from "express";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";
import { SearchService } from "../search/search.service";
import { parseRatings } from "../search/query";
import { HomeService } from "./home.service";
import { TitlesService } from "./titles.service";
import { CollectionsService } from "./collections.service";

class ListDto {
  @IsOptional() @IsString() @MaxLength(50) genre?: string;
  @IsOptional() @Matches(/^[a-z]{2,3}$/) language?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1888) @Max(2100) year?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1888) @Max(2100) yearFrom?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1888) @Max(2100) yearTo?: number;
  /** Comma-separated certifications, e.g. "PG-13,R". */
  @IsOptional() @Matches(/^[\w+,\- ]{1,60}$/) rating?: string;
  @IsOptional() @IsIn(["MOVIE", "SERIES"]) type?: "MOVIE" | "SERIES";
  @IsOptional() @IsIn(["newest", "name", "year"]) sort?: "newest" | "name" | "year";
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}
class SearchDto {
  @IsString() @MinLength(1) @MaxLength(100) q: string;
  @IsOptional() @IsIn(["MOVIE", "SERIES"]) type?: "MOVIE" | "SERIES";
  @IsOptional() @IsString() @MaxLength(50) genre?: string;
  @IsOptional() @Matches(/^[a-z]{2,3}$/) language?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1888) @Max(2100) year?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1888) @Max(2100) yearFrom?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1888) @Max(2100) yearTo?: number;
  @IsOptional() @Matches(/^[\w+,\- ]{1,60}$/) rating?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

class CollectionDto {
  @IsOptional() @IsIn(["1"]) kids?: "1";
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(60) limit?: number;
}

@Controller()
export class TitlesController {
  constructor(
    private readonly titles: TitlesService,
    private readonly search_: SearchService,
    private readonly home_: HomeService,
    private readonly collections: CollectionsService,
  ) {}

  @Get("titles") list(@Query() { rating, ...d }: ListDto) {
    return this.titles.list({ ...d, rating: parseRatings(rating), page: d.page ?? 1, limit: d.limit ?? 20 });
  }
  @Get("search") search(@Query() { q, rating, ...d }: SearchDto) {
    return this.search_.search(q.trim(), { ...d, rating: parseRatings(rating), page: d.page ?? 1, limit: d.limit ?? 20 });
  }
  /** Typeahead: `{ titles, people, genres }` for the search box. */
  @Get("search/suggest") suggest(@Query("q") q = "") {
    const t = q.trim().slice(0, 60);
    return t.length < 2 ? { titles: [], people: [], genres: [] } : this.search_.suggest(t);
  }
  @Get("ratings") ratings() {
    return this.titles.ratings();
  }
  @Get("home") home(@Query("kids") kids?: string) {
    return this.home_.home(kids === "1");
  }
  @Get("upcoming") upcoming() {
    return this.titles.upcoming();
  }
  /** Mood / genre collections (cards for the discovery page). */
  @Get("collections") collectionList() {
    return this.collections.list();
  }
  @Get("collections/:key") collection(@Param("key") key: string, @Query() q: CollectionDto) {
    return this.collections.get(key, { kids: q.kids === "1", page: q.page ?? 1, limit: q.limit ?? 40 });
  }
  @Get("genres") genres() {
    return this.titles.genres();
  }
  @Get("languages") languages() {
    return this.titles.languages();
  }
  @Get("titles/:id") get(@Param("id") id: string) {
    return this.titles.get(id);
  }
  /** Anonymous view beacon; feeds trending. Deduped per visitor, never returns an error to the page. */
  @Post("titles/:id/view") @HttpCode(204) async view(@Param("id") id: string, @Req() req: Request) {
    const visitor = createHash("sha1").update(`${req.ip}|${req.headers["user-agent"] ?? ""}`).digest("hex").slice(0, 16);
    await this.home_.recordView(id, visitor);
  }
  @Get("titles/:id/related") related(@Param("id") id: string) {
    return this.titles.related(id);
  }
  @Get("titles/:id/sources") sources(@Param("id") id: string) {
    return this.titles.sources(id);
  }
}
