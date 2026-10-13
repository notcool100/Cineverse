import { Module } from "@nestjs/common";
import { TitlesController } from "./titles.controller";
import { SearchService } from "../search/search.service";
import { TitlesService } from "./titles.service";

@Module({ controllers: [TitlesController], providers: [TitlesService, SearchService], exports: [TitlesService, SearchService] })
export class TitlesModule {}
