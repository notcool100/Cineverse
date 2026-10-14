import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsBoolean, IsOptional, IsString, Length, Matches, ValidateIf } from "class-validator";
import { AuthGuard, type AuthedRequest } from "../auth/auth.guard";
import { PROFILE_TOKEN_HEADER, ProfilesService } from "./profiles.service";

class CreateProfileDto {
  @IsString() @Length(1, 24) name: string;
  @IsOptional() @Matches(/^\d{1,2}$/) avatar?: string;
  @IsOptional() @IsBoolean() isKids?: boolean;
  @IsOptional() @Matches(/^\d{4}$/, { message: "A PIN is exactly 4 digits" }) pin?: string;
}
class UpdateProfileDto {
  @IsOptional() @IsString() @Length(1, 24) name?: string;
  @IsOptional() @Matches(/^\d{1,2}$/) avatar?: string;
  @IsOptional() @IsBoolean() isKids?: boolean;
  /** 4 digits sets or changes the PIN, null removes it. */
  @ValidateIf((_o, v) => v !== undefined && v !== null) @Matches(/^\d{4}$/, { message: "A PIN is exactly 4 digits" }) pin?: string | null;
}
class VerifyPinDto {
  @IsString() @Length(1, 8) pin: string;
}

@Controller("me/profiles")
@UseGuards(AuthGuard)
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get() list(@Req() req: AuthedRequest) {
    return this.profiles.list(req.user.id);
  }
  @Post() create(@Req() req: AuthedRequest, @Body() dto: CreateProfileDto) {
    return this.profiles.create(req.user.id, dto);
  }
  @Patch(":id") update(@Req() req: AuthedRequest, @Param("id") id: string, @Body() dto: UpdateProfileDto, @Headers(PROFILE_TOKEN_HEADER) token?: string) {
    return this.profiles.update(req.user.id, id, dto, token);
  }
  @Delete(":id") @HttpCode(204) async remove(@Req() req: AuthedRequest, @Param("id") id: string, @Headers(PROFILE_TOKEN_HEADER) token?: string) {
    await this.profiles.remove(req.user.id, id, token);
  }
  /** Exchanges the profile's PIN for a 12-hour unlock token (sent as X-Profile-Token). Locks out after 5 wrong tries. */
  @Post(":id/verify-pin") @HttpCode(200) @Throttle({ default: { ttl: 60_000, limit: 20 } })
  verifyPin(@Req() req: AuthedRequest, @Param("id") id: string, @Body() dto: VerifyPinDto) {
    return this.profiles.verifyPin(req.user.id, id, dto.pin);
  }
}
