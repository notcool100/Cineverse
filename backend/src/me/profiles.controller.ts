import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { IsBoolean, IsOptional, IsString, Length, Matches } from "class-validator";
import { AuthGuard, type AuthedRequest } from "../auth/auth.guard";
import { ProfilesService } from "./profiles.service";

class CreateProfileDto {
  @IsString() @Length(1, 24) name: string;
  @IsOptional() @Matches(/^\d{1,2}$/) avatar?: string;
  @IsOptional() @IsBoolean() isKids?: boolean;
}
class UpdateProfileDto {
  @IsOptional() @IsString() @Length(1, 24) name?: string;
  @IsOptional() @Matches(/^\d{1,2}$/) avatar?: string;
  @IsOptional() @IsBoolean() isKids?: boolean;
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
  @Patch(":id") update(@Req() req: AuthedRequest, @Param("id") id: string, @Body() dto: UpdateProfileDto) {
    return this.profiles.update(req.user.id, id, dto);
  }
  @Delete(":id") @HttpCode(204) async remove(@Req() req: AuthedRequest, @Param("id") id: string) {
    await this.profiles.remove(req.user.id, id);
  }
}
