import { Injectable } from "@nestjs/common";
import { randomInt } from "node:crypto";

// No 0/O/1/I so codes can be read aloud.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const MAX_MEMBERS = 6; // WebRTC mesh: every member uploads to every other member.

export interface Member {
  socketId: string;
  userId: string;
  name: string;
}
export interface PlayState {
  playing: boolean;
  position: number;
  /** Server time (ms) when `position` was valid; lets late joiners extrapolate. */
  at: number;
}
export interface ChatMessage {
  id: string;
  from: string;
  name: string;
  text: string;
  at: number;
}

export interface Room {
  code: string;
  titleId: string;
  season?: number;
  episode?: number;
  members: Map<string, Member>;
  state: PlayState;
  /** Last CHAT_HISTORY messages, replayed to people who join late. */
  chat: ChatMessage[];
  emptySince?: number;
}

export const CHAT_HISTORY = 50;
export const MAX_CHAT_LENGTH = 300;
/** Reactions a member may send; anything else is dropped. */
export const REACTIONS = ["👍", "😂", "😮", "😢", "❤️", "👏", "🔥"] as const;
export const isReaction = (v: unknown): v is (typeof REACTIONS)[number] => typeof v === "string" && (REACTIONS as readonly string[]).includes(v);

/** Trims, collapses control characters and enforces length; returns undefined for empty/invalid chat text. */
export function cleanChat(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return t.length > 0 && t.length <= MAX_CHAT_LENGTH ? t : undefined;
}

/** Allows `limit` events per `windowMs` per key (sliding window). In-memory, per API instance. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}
  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
  forget(key: string) {
    this.hits.delete(key);
  }
}

/** In-memory rooms. Single API instance only; use the socket.io Redis adapter + Redis store to scale out. */
@Injectable()
export class PartyService {
  private readonly rooms = new Map<string, Room>();

  create(titleId: string, season?: number, episode?: number): Room {
    let code: string;
    do code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    while (this.rooms.has(code));
    const room: Room = {
      code,
      titleId,
      season,
      episode,
      members: new Map(),
      state: { playing: false, position: 0, at: Date.now() },
      chat: [],
      emptySince: Date.now(),
    };
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  join(room: Room, m: Member): "ok" | "full" {
    if (!room.members.has(m.socketId) && room.members.size >= MAX_MEMBERS) return "full";
    room.members.set(m.socketId, m);
    room.emptySince = undefined;
    return "ok";
  }

  leave(room: Room, socketId: string) {
    room.members.delete(socketId);
    if (room.members.size === 0) room.emptySince = Date.now();
  }

  addChat(room: Room, msg: ChatMessage) {
    room.chat.push(msg);
    if (room.chat.length > CHAT_HISTORY) room.chat.splice(0, room.chat.length - CHAT_HISTORY);
  }

  /** Current position, extrapolated if playing. */
  snapshot(room: Room): PlayState {
    const { playing, position, at } = room.state;
    const now = Date.now();
    return { playing, position: playing ? position + (now - at) / 1000 : position, at: now };
  }

  /** Drop rooms that have been empty for `graceMs` (lets a refresh or navigation reconnect). */
  sweep(graceMs = 5 * 60_000) {
    const now = Date.now();
    for (const [code, r] of this.rooms) if (r.emptySince && now - r.emptySince > graceMs) this.rooms.delete(code);
  }
}
