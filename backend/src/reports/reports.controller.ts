import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { AuthGuard, Roles, type AuthedRequest } from "../auth/auth.guard";
import { REASONS, type Reason } from "./autoflag";
import { ReportsService } from "./reports.service";

class ReportDto {
  @IsString() @MaxLength(100) titleId: string;
  /** Source id, or `provider:<slug>`. */
  @IsString() @MaxLength(120) sourceKey: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(9999) season?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(99999) episode?: number;
  @IsIn(REASONS) reason: Reason;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
class ResolveDto {
  @IsString() titleId: string;
  @IsString() sourceKey: string;
  @IsOptional() @IsString() episodeKey?: string;
}

@Controller()
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** "Report broken source" from the player. */
  @Post("playback/report") @HttpCode(200) @Throttle({ default: { ttl: 60_000, limit: 10 } })
  report(@Req() req: AuthedRequest, @Body() dto: ReportDto) {
    return this.reports.report(req.user.id, dto);
  }

  @Get("admin/reports") @Roles("ADMIN")
  list() {
    return this.reports.openGroups();
  }

  @Post("admin/reports/resolve") @Roles("ADMIN") @HttpCode(204)
  async resolve(@Body() dto: ResolveDto) {
    await this.reports.resolve(dto.titleId, dto.sourceKey, dto.episodeKey);
  }

  @Post("admin/sources/:id/restore") @Roles("ADMIN") @HttpCode(204)
  async restore(@Param("id") id: string) {
    await this.reports.restore(id);
  }
}
