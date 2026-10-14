import { Module } from "@nestjs/common";
import { TitlesModule } from "../titles/titles.module";
import { MeController } from "./me.controller";
import { ListsController } from "./lists.controller";
import { ListsService } from "./lists.service";
import { ProfilesController } from "./profiles.controller";
import { ProfilesService } from "./profiles.service";

@Module({ imports: [TitlesModule], controllers: [MeController, ProfilesController, ListsController], providers: [ProfilesService, ListsService], exports: [ProfilesService] })
export class MeModule {}
