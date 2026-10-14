import { Module } from "@nestjs/common";
import { TitlesModule } from "../titles/titles.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ReportsModule } from "../reports/reports.module";
import { AdminController } from "./admin.controller";
import { AnalyticsService } from "./analytics.service";

@Module({ imports: [TitlesModule, NotificationsModule, ReportsModule], controllers: [AdminController], providers: [AnalyticsService] })
export class AdminModule {}
