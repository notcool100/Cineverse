import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class RegisterDto {
  @IsEmail() email: string;
  @IsString() @MinLength(8) @MaxLength(128) password: string;
  @IsOptional() @IsString() @MaxLength(80) name?: string;
}
export class LoginDto {
  @IsEmail() email: string;
  @IsString() @MaxLength(128) password: string;
}
export class RefreshDto {
  @IsString() refreshToken: string;
}
