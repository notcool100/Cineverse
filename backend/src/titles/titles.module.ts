import { Module } from "@nestjs/common";
import { TitlesController } from "./titles.controller";
import { SearchService } from "../search/search.service";
import { HomeService } from "./home.service";
import { TitlesService } from "./titles.service";

@Module({ controllers: [TitlesController], providers: [TitlesService, SearchService, HomeService], exports: [TitlesService, SearchService, HomeService] })
export class TitlesModule {}
