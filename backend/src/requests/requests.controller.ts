import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from "class-validator";
import { RequestStatus, TitleType } from "@prisma/client";
import { AuthGuard, Roles, type AuthedRequest } from "../auth/auth.guard";
import { RequestsService } from "./requests.service";

class CreateRequestDto {
  @IsString() @Length(1, 120) name: string;
  @IsEnum(TitleType) type: TitleType;
  @IsOptional() @IsInt() @Min(1) @Max(99_999_999) tmdbId?: number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
class ListDto {
  @IsOptional() @IsIn(["top", "new"]) sort?: "top" | "new";
  @IsOptional() @IsEnum(RequestStatus) status?: RequestStatus;
}
class DecideDto {
  @IsEnum(RequestStatus) status: RequestStatus;
  /** Slug or id of the catalog title that fulfils the request (required for ADDED). */
  @IsOptional() @IsString() @MaxLength(120) title?: string;
}

@Controller()
@UseGuards(AuthGuard)
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get("requests") list(@Req() req: AuthedRequest, @Query() q: ListDto) {
    return this.requests.list(req.user.id, { sort: q.sort ?? "top", status: q.status });
  }
  @Post("requests") @Throttle({ default: { ttl: 60_000, limit: 10 } }) create(@Req() req: AuthedRequest, @Body() dto: CreateRequestDto) {
    return this.requests.create(req.user.id, dto);
  }
  @Put("requests/:id/vote") @HttpCode(204) async vote(@Req() req: AuthedRequest, @Param("id") id: string) {
    await this.requests.vote(req.user.id, id);
  }
  @Delete("requests/:id/vote") @HttpCode(204) async unvote(@Req() req: AuthedRequest, @Param("id") id: string) {
    await this.requests.unvote(req.user.id, id);
  }
  @Delete("requests/:id") @HttpCode(204) async remove(@Req() req: AuthedRequest, @Param("id") id: string) {
    await this.requests.remove(req.user.id, id);
  }

  @Get("admin/requests") @Roles("ADMIN") adminList(@Query() q: ListDto) {
    return this.requests.adminList(q.status);
  }
  @Patch("admin/requests/:id") @Roles("ADMIN") decide(@Param("id") id: string, @Body() dto: DecideDto) {
    return this.requests.decide(id, dto.status, dto.title);
  }
}
