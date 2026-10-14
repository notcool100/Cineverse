import { Module } from "@nestjs/common";
import { TitlesModule } from "../titles/titles.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({ imports: [TitlesModule], controllers: [ReportsController], providers: [ReportsService], exports: [ReportsService] })
export class ReportsModule {}
