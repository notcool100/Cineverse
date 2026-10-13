import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Matches, Max, Min } from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { PlaybackService } from "./playback.service";

class TokenDto {
  @IsString() sourceId: string;
}

class EmbedTokenDto {
  @Matches(/^[a-z0-9-]+$/) slug: string;
  @IsString() titleId: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(9999) season?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(99999) episode?: number;
}

@Controller("playback")
@UseGuards(AuthGuard)
export class PlaybackController {
  constructor(private readonly playback: PlaybackService) {}

  @Get("providers") providers() {
    return this.playback.providers();
  }

  @Post("embed-token") @HttpCode(200) embedToken(@Body() dto: EmbedTokenDto) {
    return this.playback.embedToken(dto.slug, dto.titleId, dto.season, dto.episode);
  }

  @Post("token") @HttpCode(200) token(@Body() dto: TokenDto) {
    return this.playback.token(dto.sourceId);
  }
}
