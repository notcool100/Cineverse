import { Module } from "@nestjs/common";
import { PartyController } from "./party.controller";
import { PartyGateway } from "./party.gateway";
import { PartyService } from "./party.service";

@Module({ controllers: [PartyController], providers: [PartyService, PartyGateway] })
export class PartyModule {}
