import { Module } from "@nestjs/common";
import { TitlesModule } from "../titles/titles.module";
import { MeController } from "./me.controller";
import { ProfilesController } from "./profiles.controller";
import { ProfilesService } from "./profiles.service";

@Module({ imports: [TitlesModule], controllers: [MeController, ProfilesController], providers: [ProfilesService] })
export class MeModule {}
