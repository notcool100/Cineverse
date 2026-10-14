import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { IsString, Length } from "class-validator";
import { AuthGuard, type AuthedRequest } from "../auth/auth.guard";
import { PrismaService } from "../common/prisma.service";
import { ListsService } from "./lists.service";
import { ProfilesService } from "./profiles.service";

class ListNameDto {
  @IsString() @Length(1, 40) name: string;
}

@Controller("me/lists")
@UseGuards(AuthGuard)
export class ListsController {
  constructor(
    private readonly lists: ListsService,
    private readonly profiles: ProfilesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get() async list(@Req() req: AuthedRequest, @Query("titleId") titleId?: string) {
    const p = await this.profiles.resolve(req);
    return this.lists.list(req.user.id, p.id, titleId ? await this.titleId(titleId) : undefined);
  }
  @Post() async create(@Req() req: AuthedRequest, @Body() dto: ListNameDto) {
    const p = await this.profiles.resolve(req);
    return this.lists.create(req.user.id, p.id, dto.name);
  }
  @Get(":id") async get(@Req() req: AuthedRequest, @Param("id") id: string) {
    const p = await this.profiles.resolve(req);
    return this.lists.get(req.user.id, p.id, id);
  }
  @Patch(":id") @HttpCode(204) async rename(@Req() req: AuthedRequest, @Param("id") id: string, @Body() dto: ListNameDto) {
    const p = await this.profiles.resolve(req);
    await this.lists.rename(req.user.id, p.id, id, dto.name);
  }
  @Delete(":id") @HttpCode(204) async remove(@Req() req: AuthedRequest, @Param("id") id: string) {
    const p = await this.profiles.resolve(req);
    await this.lists.remove(req.user.id, p.id, id);
  }
  @Put(":id/items/:titleId") @HttpCode(204) async add(@Req() req: AuthedRequest, @Param("id") id: string, @Param("titleId") titleId: string) {
    const p = await this.profiles.resolve(req);
    await this.lists.add(req.user.id, p.id, id, await this.titleId(titleId));
  }
  @Delete(":id/items/:titleId") @HttpCode(204) async removeItem(@Req() req: AuthedRequest, @Param("id") id: string, @Param("titleId") titleId: string) {
    const p = await this.profiles.resolve(req);
    await this.lists.removeItem(req.user.id, p.id, id, await this.titleId(titleId));
  }

  private async titleId(idOrSlug: string) {
    const t = await this.prisma.title.findFirst({ where: { published: true, OR: [{ id: idOrSlug }, { slug: idOrSlug }] }, select: { id: true } });
    if (!t) throw new NotFoundException("Title not found");
    return t.id;
  }
}
