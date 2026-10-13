"use client";

// Browser-side API client. Tokens live in localStorage (the API is bearer-token based).
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const KEY = "cineora.auth";

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN";
}
interface Session {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event("cineora-auth"));
}

async function raw(path: string, init: RequestInit & { token?: string } = {}) {
  const { token, ...rest } = init;
  return fetch(`${API}${path}`, {
    ...rest,
    headers: {
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = Array.isArray(j.message) ? j.message.join(", ") : (j.message ?? msg);
    } catch {}
    throw new ApiError(res.status, msg);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

let refreshing: Promise<Session | null> | null = null;
function refresh(): Promise<Session | null> {
  refreshing ??= (async () => {
    const s = loadSession();
    if (!s) return null;
    const res = await raw("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken: s.refreshToken }) });
    if (!res.ok) {
      saveSession(null);
      return null;
    }
    const next = (await res.json()) as Session;
    saveSession(next);
    return next;
  })().finally(() => (refreshing = null));
  return refreshing;
}

/** Authenticated call; transparently refreshes the access token once on 401. */
export async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
  let s = loadSession();
  if (!s) throw new ApiError(401, "Not signed in");
  let res = await raw(path, { ...init, token: s.accessToken });
  if (res.status === 401 && (s = await refresh())) res = await raw(path, { ...init, token: s.accessToken });
  return parse<T>(res);
}

export async function signIn(mode: "login" | "register", body: { email: string; password: string; name?: string }) {
  const s = await parse<Session>(await raw(`/auth/${mode}`, { method: "POST", body: JSON.stringify(body) }));
  saveSession(s);
  return s.user;
}

export async function signOut() {
  const s = loadSession();
  saveSession(null);
  if (s) await raw("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken: s.refreshToken }) }).catch(() => {});
}

export type PlaybackToken =
  | { type: "hls" | "direct"; url: string }
  | { type: "youtube"; videoId: string }
  | { type: "link" | "embed"; url: string };

export const getPlaybackToken = (sourceId: string) =>
  authed<PlaybackToken>("/playback/token", { method: "POST", body: JSON.stringify({ sourceId }) });

export const getWatchlist = () => authed<{ title: ApiTitleLite }[]>("/me/watchlist");
export const addToWatchlist = (titleId: string) =>
  authed<void>("/me/watchlist", { method: "POST", body: JSON.stringify({ titleId }) });
export const removeFromWatchlist = (titleId: string) => authed<void>(`/me/watchlist/${encodeURIComponent(titleId)}`, { method: "DELETE" });

export interface HistoryEntry {
  positionSec: number;
  durationSec: number;
  episodeId: string;
  title: ApiTitleLite;
}
export const getHistory = () => authed<HistoryEntry[]>("/me/history");
export const saveProgress = (titleId: string, positionSec: number, durationSec: number) =>
  authed<void>("/me/history", { method: "PUT", body: JSON.stringify({ titleId, positionSec, durationSec }) });

export interface ApiTitleLite {
  id: string;
  slug: string;
  name: string;
  year: number | null;
  genres: string[];
  posterPath: string | null;
  accent: string[];
}
