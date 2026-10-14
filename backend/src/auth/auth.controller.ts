import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { AuthGuard, type AuthedRequest } from "./auth.guard";
import { EmailDto, LoginDto, RefreshDto, RegisterDto, ResetPasswordDto, TokenDto } from "./dto";

@Controller("auth")
@Throttle({ default: { ttl: 60_000, limit: 10 } })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register") register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }
  @Post("login") @HttpCode(200) login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }
  @Post("refresh") @HttpCode(200) refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }
  @Post("logout") @HttpCode(204) async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refreshToken);
  }

  @Get("me") @UseGuards(AuthGuard) me(@Req() req: AuthedRequest) {
    return this.auth.me(req.user.id);
  }
  /** Re-sends the verification email for the signed-in account. */
  @Post("verify-email/request") @UseGuards(AuthGuard) @HttpCode(200) requestVerification(@Req() req: AuthedRequest) {
    return this.auth.sendVerification(req.user.id);
  }
  @Post("verify-email") @HttpCode(204) async verifyEmail(@Body() dto: TokenDto) {
    await this.auth.verifyEmail(dto.token);
  }
  /** Always 204, whether or not the address has an account. */
  @Post("forgot-password") @HttpCode(204) async forgot(@Body() dto: EmailDto) {
    await this.auth.forgotPassword(dto.email);
  }
  @Post("reset-password") @HttpCode(204) async reset(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.password);
  }
}
