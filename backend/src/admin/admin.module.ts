import { Module } from "@nestjs/common";
import { TitlesModule } from "../titles/titles.module";
import { AdminController } from "./admin.controller";

@Module({ imports: [TitlesModule], controllers: [AdminController] })
export class AdminModule {}
