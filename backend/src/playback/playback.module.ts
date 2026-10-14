import { Module } from "@nestjs/common";
import { ReportsModule } from "../reports/reports.module";
import { PlaybackController } from "./playback.controller";
import { PlaybackService } from "./playback.service";

@Module({ imports: [ReportsModule], controllers: [PlaybackController], providers: [PlaybackService] })
export class PlaybackModule {}
