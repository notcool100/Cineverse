import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { TitlesService, toPublicTitle } from "../titles/titles.service";

export const MAX_LISTS = 20;
export const MAX_LIST_ITEMS = 500;

/** Custom lists for the active profile, on top of the single My List. */
@Injectable()
export class ListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly titles: TitlesService,
  ) {}

  /** Lists with counts and up to four posters. With `titleId`, each list also says whether it already holds that title. */
  async list(userId: string, profileId: string, titleId?: string) {
    const lists = await this.prisma.userList.findMany({
      where: { userId, profileId },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { items: true } },
        items: { orderBy: { addedAt: "desc" }, take: 4, include: { title: { select: { posterPath: true } } } },
      },
    });
    const holding = titleId
      ? new Set((await this.prisma.userListItem.findMany({ where: { titleId, listId: { in: lists.map((l) => l.id) } }, select: { listId: true } })).map((r) => r.listId))
      : null;
    return lists.map((l) => ({
      id: l.id,
      name: l.name,
      count: l._count.items,
      posters: l.items.map((i) => i.title.posterPath).filter(Boolean) as string[],
      ...(holding && { hasTitle: holding.has(l.id) }),
    }));
  }

  async create(userId: string, profileId: string, name: string) {
    const clean = name.trim().replace(/\s+/g, " ");
    if (!clean) throw new BadRequestException("Give the list a name");
    if ((await this.prisma.userList.count({ where: { userId, profileId } })) >= MAX_LISTS) throw new BadRequestException(`At most ${MAX_LISTS} lists per profile`);
    const l = await this.prisma.userList.create({ data: { userId, profileId, name: clean } });
    return { id: l.id, name: l.name, count: 0, posters: [] as string[] };
  }

  async rename(userId: string, profileId: string, id: string, name: string) {
    await this.own(userId, profileId, id);
    const clean = name.trim().replace(/\s+/g, " ");
    if (!clean) throw new BadRequestException("Give the list a name");
    await this.prisma.userList.update({ where: { id }, data: { name: clean } });
  }

  async remove(userId: string, profileId: string, id: string) {
    await this.own(userId, profileId, id);
    await this.prisma.userList.delete({ where: { id } });
  }

  /** The list with its titles, newest first. */
  async get(userId: string, profileId: string, id: string) {
    const l = await this.prisma.userList.findFirst({
      where: { id, userId, profileId },
      include: { items: { where: { title: { published: true } }, orderBy: { addedAt: "desc" }, include: { title: { include: { sources: this.titles.sourceSelect } } } } },
    });
    if (!l) throw new NotFoundException("List not found");
    const shown = await this.titles.hideDisabledEmbeds(l.items.map((i) => i.title));
    return { id: l.id, name: l.name, items: shown.map(toPublicTitle) };
  }

  async add(userId: string, profileId: string, id: string, titleId: string) {
    await this.own(userId, profileId, id);
    if ((await this.prisma.userListItem.count({ where: { listId: id } })) >= MAX_LIST_ITEMS) throw new BadRequestException(`A list holds at most ${MAX_LIST_ITEMS} titles`);
    await this.prisma.userListItem.upsert({ where: { listId_titleId: { listId: id, titleId } }, create: { listId: id, titleId }, update: {} });
    await this.prisma.userList.update({ where: { id }, data: { updatedAt: new Date() } });
  }

  async removeItem(userId: string, profileId: string, id: string, titleId: string) {
    await this.own(userId, profileId, id);
    await this.prisma.userListItem.deleteMany({ where: { listId: id, titleId } });
  }

  private async own(userId: string, profileId: string, id: string) {
    if (!(await this.prisma.userList.findFirst({ where: { id, userId, profileId }, select: { id: true } }))) throw new NotFoundException("List not found");
  }
}
