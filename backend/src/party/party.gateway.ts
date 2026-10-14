import { Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { SkipThrottle } from "@nestjs/throttler";
import type { Server, Socket } from "socket.io";
import { PrismaService } from "../common/prisma.service";
import { requireEnv } from "../common/secrets";
import { PartyService, RateLimiter, cleanChat, isReaction, type Room } from "./party.service";
import { randomUUID } from "node:crypto";

interface Ctx {
  userId: string;
  name: string;
  code?: string;
}
type Ack = (res: unknown) => void;

const int = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < 10_000 ? (v as number) : undefined);
const str = (v: unknown, max = 100) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : undefined);

// The global HTTP throttler keys on req.ip, which sockets don't have: every client would share one bucket. Limits are per socket below.
@SkipThrottle()
@WebSocketGateway({
  namespace: "/party",
  cors: { origin: (process.env.CORS_ORIGIN ?? "").split(",").filter(Boolean), credentials: true },
  maxHttpBufferSize: 64 * 1024, // SDP/ICE only
})
export class PartyGateway implements OnGatewayInit, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PartyGateway.name);
  private sweeper?: ReturnType<typeof setInterval>;
  private readonly chatLimit = new RateLimiter(6, 10_000);
  private readonly reactionLimit = new RateLimiter(8, 5_000);
  /** play/pause/seek, navigation and countdown. Human-speed events; this only stops a runaway client. */
  private readonly controlLimit = new RateLimiter(40, 10_000);
  private readonly signalLimit = new RateLimiter(200, 10_000);
  @WebSocketServer() server!: Server;

  constructor(
    private readonly party: PartyService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.sweeper = setInterval(() => this.party.sweep(), 60_000);
  }
  onModuleDestroy() {
    clearInterval(this.sweeper);
  }

  /**
   * Authenticates in a socket.io middleware, so a connection only completes once `client.data` is filled in.
   * (Doing it in handleConnection raced with fast clients that emit `party:join` the instant they connect.)
   */
  afterInit(server: Server) {
    server.use((client, next) => {
      void this.authenticate(client).then(
        () => next(),
        () => next(new Error("unauthorized")),
      );
    });
  }

  private async authenticate(client: Socket) {
    const token = str(client.handshake.auth?.token, 2000);
    if (!token) throw new Error("no token");
    const p = await this.jwt.verifyAsync<{ sub: string }>(token, { secret: requireEnv("JWT_ACCESS_SECRET") });
    const user = await this.prisma.user.findUnique({ where: { id: p.sub }, select: { name: true, email: true } });
    if (!user) throw new Error("no user");
    client.data = { userId: p.sub, name: user.name ?? user.email.split("@")[0] } satisfies Ctx;
  }

  handleDisconnect(client: Socket) {
    this.leave(client);
    for (const l of [this.chatLimit, this.reactionLimit, this.controlLimit, this.signalLimit]) l.forget(client.id);
  }

  @SubscribeMessage("party:create")
  create(@ConnectedSocket() client: Socket, @MessageBody() body: { titleId?: unknown; season?: unknown; episode?: unknown }, ) {
    const titleId = str(body?.titleId);
    if (!titleId) return { error: "titleId required" };
    const room = this.party.create(titleId, int(body.season), int(body.episode));
    return { code: room.code };
  }

  @SubscribeMessage("party:join")
  join(@ConnectedSocket() client: Socket, @MessageBody() body: { code?: unknown }) {
    const ctx = client.data as Ctx;
    const room = str(body?.code, 12) && this.party.get(body.code as string);
    if (!room) return { error: "Room not found" };
    if (ctx.code === room.code) return this.joined(room, client); // idempotent
    this.leave(client);
    if (this.party.join(room, { socketId: client.id, userId: ctx.userId, name: ctx.name }) === "full") return { error: "Room is full" };
    ctx.code = room.code;
    void client.join(room.code);
    client.to(room.code).emit("party:peer-joined", { id: client.id, name: ctx.name });
    return this.joined(room, client);
  }

  private joined(room: Room, client: Socket) {
    return {
      code: room.code,
      you: client.id,
      titleId: room.titleId,
      season: room.season,
      episode: room.episode,
      state: this.party.snapshot(room),
      chat: room.chat,
      peers: [...room.members.values()].filter((m) => m.socketId !== client.id).map((m) => ({ id: m.socketId, name: m.name })),
    };
  }

  @SubscribeMessage("party:leave")
  onLeave(@ConnectedSocket() client: Socket) {
    this.leave(client);
    return { ok: true };
  }

  /** Anyone in the room may play/pause/seek; the last writer wins. */
  @SubscribeMessage("party:state")
  state(@ConnectedSocket() client: Socket, @MessageBody() body: { playing?: unknown; position?: unknown }) {
    const room = this.roomOf(client);
    if (!room || !this.controlLimit.allow(client.id) || typeof body?.playing !== "boolean" || typeof body.position !== "number" || !Number.isFinite(body.position) || body.position < 0) return;
    room.state = { playing: body.playing, position: body.position, at: Date.now() };
    client.to(room.code).emit("party:state", { ...room.state, by: client.id, byName: (client.data as Ctx).name });
  }

  @SubscribeMessage("party:nav")
  nav(@ConnectedSocket() client: Socket, @MessageBody() body: { titleId?: unknown; season?: unknown; episode?: unknown }) {
    const room = this.roomOf(client);
    const titleId = str(body?.titleId);
    if (!room || !titleId || !this.controlLimit.allow(client.id)) return;
    room.titleId = titleId;
    room.season = int(body.season);
    room.episode = int(body.episode);
    room.state = { playing: false, position: 0, at: Date.now() };
    client.to(room.code).emit("party:nav", { titleId, season: room.season, episode: room.episode });
  }

  /** Room chat: validated, rate limited, kept in a short history, echoed to everyone including the sender. */
  @SubscribeMessage("party:chat")
  chat(@ConnectedSocket() client: Socket, @MessageBody() body: { text?: unknown }) {
    const room = this.roomOf(client);
    const text = cleanChat(body?.text);
    if (!room || !text) return { error: "Message can't be empty or longer than 300 characters" };
    if (!this.chatLimit.allow(client.id)) return { error: "You're sending messages too fast" };
    const msg = { id: randomUUID(), from: client.id, name: (client.data as Ctx).name, text, at: Date.now() };
    this.party.addChat(room, msg);
    this.server.to(room.code).emit("party:chat", msg);
    return { ok: true };
  }

  /** Quick emoji reactions shown over the video. */
  @SubscribeMessage("party:reaction")
  reaction(@ConnectedSocket() client: Socket, @MessageBody() body: { emoji?: unknown }) {
    const room = this.roomOf(client);
    if (!room || !isReaction(body?.emoji) || !this.reactionLimit.allow(client.id)) return;
    this.server.to(room.code).emit("party:reaction", { id: randomUUID(), from: client.id, name: (client.data as Ctx).name, emoji: body.emoji, at: Date.now() });
  }

  /** "Everyone press play" countdown, for embedded players we can't control. */
  @SubscribeMessage("party:countdown")
  countdown(@ConnectedSocket() client: Socket) {
    const room = this.roomOf(client);
    if (room && this.controlLimit.allow(client.id)) this.server.to(room.code).emit("party:countdown", { startsAt: Date.now() + 4000, by: client.id });
  }

  /** WebRTC signaling relay (offer/answer/ICE) between two members of the same room. */
  @SubscribeMessage("rtc:signal")
  signal(@ConnectedSocket() client: Socket, @MessageBody() body: { to?: unknown; data?: unknown }) {
    const room = this.roomOf(client);
    const to = str(body?.to, 40);
    if (!room || !to || !this.signalLimit.allow(client.id) || !room.members.has(to) || typeof body.data !== "object" || body.data === null) return;
    this.server.to(to).emit("rtc:signal", { from: client.id, data: body.data });
  }

  private roomOf(client: Socket): Room | undefined {
    const code = (client.data as Ctx).code;
    return code ? this.party.get(code) : undefined;
  }

  private leave(client: Socket) {
    const ctx = client.data as Ctx | undefined;
    const room = ctx?.code ? this.party.get(ctx.code) : undefined;
    if (!ctx || !room) return;
    this.party.leave(room, client.id);
    void client.leave(room.code);
    client.to(room.code).emit("party:peer-left", { id: client.id });
    ctx.code = undefined;
  }
}
