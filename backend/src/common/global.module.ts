import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { RedisService } from "./redis.service";
import { MailerService } from "./mailer.service";

@Global()
@Module({ providers: [PrismaService, RedisService, MailerService], exports: [PrismaService, RedisService, MailerService] })
export class GlobalModule {}
