import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { IsString } from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { PlaybackService } from "./playback.service";

class TokenDto {
  @IsString() sourceId: string;
}

@Controller("playback")
@UseGuards(AuthGuard)
export class PlaybackController {
  constructor(private readonly playback: PlaybackService) {}

  @Post("token") @HttpCode(200) token(@Body() dto: TokenDto) {
    return this.playback.token(dto.sourceId);
  }
}
