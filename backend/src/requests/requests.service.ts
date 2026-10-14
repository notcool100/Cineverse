import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { RequestStatus, TitleType } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";

const MAX_OPEN_PER_USER = 5;

@Injectable()
export class RequestsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Requests with vote counts and whether `userId` voted. `top` = most votes first, `new` = newest first. */
  async list(userId: string, opts: { sort: "top" | "new"; status?: RequestStatus }) {
    const rows = await this.prisma.titleRequest.findMany({
      where: { status: opts.status ?? "OPEN" },
      orderBy: opts.sort === "new" ? { createdAt: "desc" } : [{ votes: { _count: "desc" } }, { createdAt: "desc" }],
      take: 100,
      include: { _count: { select: { votes: true } }, votes: { where: { userId }, select: { userId: true } } },
    });
    return rows.map((r) => ({
      id: r.id, name: r.name, type: r.type, tmdbId: r.tmdbId, note: r.note, status: r.status, titleId: r.titleId,
      createdAt: r.createdAt, votes: r._count.votes, voted: r.votes.length > 0, mine: r.userId === userId,
    }));
  }

  /**
   * Creates a request, or – if the same title was already requested (same TMDB id, or same name and type) –
   * adds the user's vote to it instead of creating a duplicate.
   */
  async create(userId: string, input: { name: string; type: TitleType; tmdbId?: number; note?: string }) {
    const name = input.name.trim().replace(/\s+/g, " ");
    const existing = await this.prisma.titleRequest.findFirst({
      where: {
        status: "OPEN",
        OR: [...(input.tmdbId ? [{ tmdbId: input.tmdbId }] : []), { type: input.type, name: { equals: name, mode: "insensitive" as const } }],
      },
    });
    if (existing) {
      await this.vote(userId, existing.id);
      return { id: existing.id, duplicate: true };
    }
    // Already in the catalog? Point the user there instead of asking admins for something they have.
    const inCatalog = await this.prisma.title.findFirst({
      where: { published: true, OR: [...(input.tmdbId ? [{ tmdbId: input.tmdbId }] : []), { type: input.type, name: { equals: name, mode: "insensitive" as const } }] },
      select: { slug: true },
    });
    if (inCatalog) throw new BadRequestException(`“${name}” is already on Cineora`);
    const open = await this.prisma.titleRequest.count({ where: { userId, status: "OPEN" } });
    if (open >= MAX_OPEN_PER_USER) throw new BadRequestException(`You can have ${MAX_OPEN_PER_USER} open requests at a time`);
    const r = await this.prisma.titleRequest.create({
      data: { userId, name, type: input.type, tmdbId: input.tmdbId, note: input.note?.trim() || undefined, votes: { create: { userId } } },
    });
    return { id: r.id, duplicate: false };
  }

  async vote(userId: string, requestId: string) {
    const r = await this.prisma.titleRequest.findUnique({ where: { id: requestId }, select: { status: true } });
    if (!r) throw new NotFoundException();
    if (r.status !== "OPEN") throw new BadRequestException("This request is closed");
    await this.prisma.titleRequestVote.upsert({ where: { requestId_userId: { requestId, userId } }, create: { requestId, userId }, update: {} });
  }

  async unvote(userId: string, requestId: string) {
    await this.prisma.titleRequestVote.deleteMany({ where: { requestId, userId } });
  }

  /** Deleting your own request while it is still open. */
  async remove(userId: string, requestId: string) {
    const r = await this.prisma.titleRequest.deleteMany({ where: { id: requestId, userId, status: "OPEN" } });
    if (!r.count) throw new NotFoundException();
  }

  /** Admin: all requests newest-first with vote counts, any status. */
  adminList(status?: RequestStatus) {
    return this.prisma.titleRequest
      .findMany({
        where: status ? { status } : {},
        orderBy: [{ votes: { _count: "desc" } }, { createdAt: "desc" }],
        take: 200,
        include: { _count: { select: { votes: true } }, user: { select: { email: true } } },
      })
      .then((rows) => rows.map((r) => ({ id: r.id, name: r.name, type: r.type, tmdbId: r.tmdbId, note: r.note, status: r.status, titleId: r.titleId, createdAt: r.createdAt, votes: r._count.votes, requester: r.user.email })));
  }

  /**
   * Admin decision. ADDED links the catalog title and notifies everyone who voted; REJECTED just closes it.
   * `title` is a slug or id of the title that fulfils the request.
   */
  async decide(id: string, status: RequestStatus, title?: string) {
    const req = await this.prisma.titleRequest.findUnique({ where: { id }, include: { votes: { select: { userId: true } } } });
    if (!req) throw new NotFoundException();
    let titleId: string | undefined;
    if (status === "ADDED") {
      const t = title ? await this.prisma.title.findFirst({ where: { OR: [{ id: title }, { slug: title }] }, select: { id: true, name: true } }) : null;
      if (!t) throw new BadRequestException("Choose the catalog title that fulfils this request (slug or id)");
      titleId = t.id;
      const voters = new Set([req.userId, ...req.votes.map((v) => v.userId)]);
      await this.prisma.notification.createMany({
        data: [...voters].map((userId) => ({ userId, profileId: "", titleId: t.id, type: "REQUEST_FULFILLED" as const, message: `You asked for “${req.name}” – it's on Cineora now` })),
      });
    }
    return this.prisma.titleRequest.update({ where: { id }, data: { status, titleId: status === "ADDED" ? titleId : null } });
  }
}
