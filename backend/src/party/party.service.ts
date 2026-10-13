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
export interface Room {
  code: string;
  titleId: string;
  season?: number;
  episode?: number;
  members: Map<string, Member>;
  state: PlayState;
  emptySince?: number;
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
