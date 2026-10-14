"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { freshAccessToken } from "@/lib/client-api";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface PartyMember {
  id: string;
  name: string;
}
export interface ChatMsg {
  id: string;
  from: string;
  name: string;
  text: string;
  at: number;
}
export interface Reaction {
  id: string;
  from: string;
  name: string;
  emoji: string;
  at: number;
}
export interface RemoteState {
  playing: boolean;
  position: number;
  by: string;
  byName?: string;
}
export interface RoomInfo {
  code: string;
  titleId: string;
  season?: number;
  episode?: number;
  state: { playing: boolean; position: number };
}
export interface PartyHandlers {
  onState?: (s: RemoteState) => void;
  onNav?: (n: { titleId: string; season?: number; episode?: number }) => void;
  onCountdown?: (c: { startsAt: number; by: string }) => void;
  /** Fired once after (re)joining with the room's current state. */
  onJoined?: (room: RoomInfo) => void;
}

type Conn = { code: string; room?: RoomInfo; you?: string; error?: string };

/**
 * Live connection to a watch-party room: members, chat, reactions and the play-state relay.
 * Pass `code = null` for no room. Handlers are read through a ref, so changing them never reconnects.
 */
export function useParty(code: string | null, handlers: PartyHandlers = {}) {
  const socket = useRef<Socket | null>(null);
  const h = useRef(handlers);
  useEffect(() => {
    h.current = handlers;
  });
  const [conn, setConn] = useState<Conn | null>(null);
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);

  useEffect(() => {
    if (!code) return;
    let closed = false;
    (async () => {
      const token = await freshAccessToken();
      if (closed) return;
      if (!token) return setConn({ code, error: "Sign in to join the party" });
      const s = io(`${API}/party`, { auth: { token }, transports: ["websocket", "polling"] });
      socket.current = s;
      const join = () =>
        s.emit("party:join", { code }, (res: { error?: string } & Partial<RoomInfo> & { you?: string; peers?: PartyMember[]; chat?: ChatMsg[]; state?: RoomInfo["state"] }) => {
          if (closed) return;
          if (res.error || !res.code || !res.titleId || !res.state) return setConn({ code, error: res.error ?? "Couldn't join the party" });
          const room: RoomInfo = { code: res.code, titleId: res.titleId, season: res.season, episode: res.episode, state: res.state };
          setConn({ code, room, you: res.you });
          setMembers(res.peers ?? []);
          setChat(res.chat ?? []);
          h.current.onJoined?.(room);
        });
      s.on("connect", join);
      s.on("connect_error", (e: Error) => setConn({ code, error: e.message === "unauthorized" ? "Your session expired. Sign in again." : "Can't reach the party server. Retrying…" }));
      s.on("party:error", (m: string) => setConn({ code, error: m === "unauthorized" ? "Your session expired. Sign in again." : String(m) }));
      s.on("party:peer-joined", (p: PartyMember) => setMembers((m) => (m.some((x) => x.id === p.id) ? m : [...m, p])));
      s.on("party:peer-left", (p: { id: string }) => setMembers((m) => m.filter((x) => x.id !== p.id)));
      s.on("party:chat", (m: ChatMsg) => setChat((c) => [...c.slice(-99), m]));
      s.on("party:reaction", (r: Reaction) => {
        setReactions((rs) => [...rs.slice(-19), r]);
        setTimeout(() => setReactions((rs) => rs.filter((x) => x.id !== r.id)), 4000);
      });
      s.on("party:state", (st: RemoteState) => h.current.onState?.(st));
      s.on("party:nav", (n: { titleId: string; season?: number; episode?: number }) => h.current.onNav?.(n));
      s.on("party:countdown", (c: { startsAt: number; by: string }) => h.current.onCountdown?.(c));
    })();
    return () => {
      closed = true;
      socket.current?.emit("party:leave");
      socket.current?.close();
      socket.current = null;
    };
  }, [code]);

  const mine = conn && conn.code === code ? conn : null;
  const status: "idle" | "connecting" | "joined" | "error" = !code ? "idle" : mine?.error ? "error" : mine?.room ? "joined" : "connecting";

  const sendChat = useCallback(
    (text: string) =>
      new Promise<string | null>((resolve) => {
        const s = socket.current;
        if (!s) return resolve("Not connected");
        s.emit("party:chat", { text }, (r: { error?: string }) => resolve(r?.error ?? null));
      }),
    [],
  );
  const react = useCallback((emoji: string) => socket.current?.emit("party:reaction", { emoji }), []);
  const sendState = useCallback((playing: boolean, position: number) => socket.current?.emit("party:state", { playing, position }), []);
  const sendNav = useCallback((n: { titleId: string; season?: number; episode?: number }) => socket.current?.emit("party:nav", n), []);
  const countdown = useCallback(() => socket.current?.emit("party:countdown"), []);
  /** Creates a room for the given title/episode and resolves with its invite code. */
  const create = useCallback(async (n: { titleId: string; season?: number; episode?: number }) => {
    const token = await freshAccessToken();
    if (!token) throw new Error("Sign in first");
    const s = io(`${API}/party`, { auth: { token }, transports: ["websocket", "polling"] });
    try {
      await new Promise<void>((res, rej) => {
        s.once("connect", () => res());
        s.once("connect_error", () => rej(new Error("Couldn't reach the party server")));
      });
      const r = await new Promise<{ code?: string; error?: string }>((res) => s.emit("party:create", n, res));
      if (!r.code) throw new Error(r.error ?? "Couldn't start a party");
      return r.code;
    } finally {
      s.close();
    }
  }, []);

  return { status, error: mine?.error, you: mine?.you, room: mine?.room, members, chat, reactions, sendChat, react, sendState, sendNav, countdown, create };
}

export type Party = ReturnType<typeof useParty>;
