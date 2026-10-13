import { Controller, Get, Param, Query } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { SearchService } from "../search/search.service";
import { TitlesService } from "./titles.service";

class ListDto {
  @IsOptional() @IsString() @MaxLength(50) genre?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1888) @Max(2100) year?: number;
  @IsOptional() @IsIn(["newest", "name", "year"]) sort?: "newest" | "name" | "year";
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}
class SearchDto {
  @IsString() @MaxLength(100) q: string;
}

@Controller()
export class TitlesController {
  constructor(
    private readonly titles: TitlesService,
    private readonly search_: SearchService,
  ) {}

  @Get("titles") list(@Query() d: ListDto) {
    return this.titles.list({ ...d, page: d.page ?? 1, limit: d.limit ?? 20 });
  }
  @Get("search") search(@Query() d: SearchDto) {
    return this.search_.search(d.q);
  }
  @Get("titles/:id") get(@Param("id") id: string) {
    return this.titles.get(id);
  }
  @Get("titles/:id/sources") sources(@Param("id") id: string) {
    return this.titles.sources(id);
  }
}
