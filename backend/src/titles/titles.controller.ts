import { Controller, Get, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Request } from "express";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";
import { SearchService } from "../search/search.service";
import { HomeService } from "./home.service";
import { TitlesService } from "./titles.service";

class ListDto {
  @IsOptional() @IsString() @MaxLength(50) genre?: string;
  @IsOptional() @Matches(/^[a-z]{2,3}$/) language?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1888) @Max(2100) year?: number;
  @IsOptional() @IsIn(["MOVIE", "SERIES"]) type?: "MOVIE" | "SERIES";
  @IsOptional() @IsIn(["newest", "name", "year"]) sort?: "newest" | "name" | "year";
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}
class SearchDto {
  @IsString() @MaxLength(100) q: string;
  @IsOptional() @IsIn(["MOVIE", "SERIES"]) type?: "MOVIE" | "SERIES";
  @IsOptional() @IsString() @MaxLength(50) genre?: string;
  @IsOptional() @Matches(/^[a-z]{2,3}$/) language?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

@Controller()
export class TitlesController {
  constructor(
    private readonly titles: TitlesService,
    private readonly search_: SearchService,
    private readonly home_: HomeService,
  ) {}

  @Get("titles") list(@Query() d: ListDto) {
    return this.titles.list({ ...d, page: d.page ?? 1, limit: d.limit ?? 20 });
  }
  @Get("search") search(@Query() d: SearchDto) {
    return this.search_.search(d.q, { type: d.type, genre: d.genre, language: d.language, page: d.page ?? 1, limit: d.limit ?? 20 });
  }
  @Get("home") home(@Query("kids") kids?: string) {
    return this.home_.home(kids === "1");
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
