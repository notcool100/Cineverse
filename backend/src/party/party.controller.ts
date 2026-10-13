import { Controller, Get, NotFoundException, Param, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { MAX_MEMBERS, PartyService } from "./party.service";

@Controller("party")
@UseGuards(AuthGuard)
export class PartyController {
  constructor(private readonly party: PartyService) {}

  /** Lets the join page resolve a code to the title being watched. */
  @Get(":code")
  find(@Param("code") code: string) {
    const r = this.party.get(code);
    if (!r) throw new NotFoundException("Room not found");
    return { code: r.code, titleId: r.titleId, season: r.season, episode: r.episode, members: r.members.size, full: r.members.size >= MAX_MEMBERS };
  }
}
