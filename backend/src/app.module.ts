import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import { RedisService } from "./common/redis.service";
import { AuthModule } from "./auth/auth.module";
import { TitlesModule } from "./titles/titles.module";
import { MeModule } from "./me/me.module";
import { PlaybackModule } from "./playback/playback.module";
import { AdminModule } from "./admin/admin.module";
import { HealthController } from "./common/health.controller";
import { GlobalModule } from "./common/global.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        throttlers: [{ ttl: 60_000, limit: 120 }],
        // Shared limits across API instances when Redis is available; in-memory otherwise.
        ...(redis.client && { storage: new ThrottlerStorageRedisService(redis.client) }),
      }),
    }),
    GlobalModule,
    AuthModule,
    TitlesModule,
    MeModule,
    PlaybackModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
