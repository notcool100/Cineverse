"use client";
import type { ProviderInfo } from "./sources";
import type { ApiTitle } from "./title-map";

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

// ---- Profiles ----
const PROFILE_KEY = "cineora.profile";
export interface Profile {
  id: string;
  name: string;
  avatar: string;
  isKids: boolean;
}
export function loadProfile(): (Profile & { userId: string }) | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    const p = raw ? (JSON.parse(raw) as Profile & { userId: string }) : null;
    // A stored profile only counts for the account it was picked under.
    return p && p.userId === loadSession()?.user.id ? p : null;
  } catch {
    return null;
  }
}
export function saveProfile(p: Profile | null) {
  try {
    const uid = loadSession()?.user.id;
    if (p && uid) localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...p, userId: uid }));
    else localStorage.removeItem(PROFILE_KEY);
  } catch {}
  window.dispatchEvent(new Event("cineora-profile"));
}

async function raw(path: string, init: RequestInit & { token?: string } = {}) {
  const { token, ...rest } = init;
  return fetch(`${API}${path}`, {
    ...rest,
    headers: {
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(token && loadProfile() ? { "X-Profile-Id": loadProfile()!.id } : {}),
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
  saveProfile(null);
  return s.user;
}

export async function signOut() {
  const s = loadSession();
  saveSession(null);
  saveProfile(null);
  if (s) await raw("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken: s.refreshToken }) }).catch(() => {});
}

export type PlaybackToken =
  | { type: "hls" | "direct"; url: string }
  | { type: "youtube"; videoId: string }
  | { type: "link" | "embed"; url: string };

export const getPlaybackToken = (sourceId: string) =>
  authed<PlaybackToken>("/playback/token", { method: "POST", body: JSON.stringify({ sourceId }) });

export const getEmbedProviders = () => authed<ProviderInfo[]>("/playback/providers");
export const getEmbedToken = (slug: string, titleId: string, season?: number, episode?: number) =>
  authed<{ type: "embed"; url: string }>("/playback/embed-token", { method: "POST", body: JSON.stringify({ slug, titleId, season, episode }) });

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
/** History key for a series episode; movies use the empty string. */
export const episodeKey = (season?: number, episode?: number) => (season && episode ? `S${season}E${episode}` : "");
export const saveProgress = (titleId: string, positionSec: number, durationSec: number, episodeId = "") =>
  authed<void>("/me/history", { method: "PUT", body: JSON.stringify({ titleId, episodeId, positionSec, durationSec }) });

export interface EpisodeProgress {
  episodeId: string;
  positionSec: number;
  durationSec: number;
}
export const getTitleHistory = (titleId: string) => authed<EpisodeProgress[]>(`/me/history/${encodeURIComponent(titleId)}`);
export const markSeasonWatched = (titleId: string, season: number, watched: boolean) =>
  authed<void>(`/me/history/${encodeURIComponent(titleId)}/season/${season}`, { method: "PUT", body: JSON.stringify({ watched }) });

export const getProfiles = () => authed<Profile[]>("/me/profiles");
export const createProfile = (p: { name: string; avatar: string; isKids: boolean }) =>
  authed<Profile>("/me/profiles", { method: "POST", body: JSON.stringify(p) });
export const updateProfile = (id: string, p: Partial<Pick<Profile, "name" | "avatar" | "isKids">>) =>
  authed<Profile>(`/me/profiles/${id}`, { method: "PATCH", body: JSON.stringify(p) });
export const deleteProfile = (id: string) => authed<void>(`/me/profiles/${id}`, { method: "DELETE" });
export const getKidsHome = () =>
  fetch(`${API}/home?kids=1`).then((r) => r.json() as Promise<{ rows: { key: string; title: string; items: ApiTitle[] }[] }>);

/** 1 = liked, -1 = disliked, 0 = unrated. */
export const getRating = (titleId: string) => authed<{ value: number }>(`/me/ratings/${encodeURIComponent(titleId)}`).then((r) => r.value);
export const setRating = (titleId: string, value: 1 | -1 | 0) =>
  value === 0
    ? authed<void>(`/me/ratings/${encodeURIComponent(titleId)}`, { method: "DELETE" })
    : authed<void>(`/me/ratings/${encodeURIComponent(titleId)}`, { method: "PUT", body: JSON.stringify({ value }) });

/** Anonymous view beacon for trending; failures are irrelevant to the page. */
export const trackView = (titleId: string) =>
  fetch(`${API}/titles/${encodeURIComponent(titleId)}/view`, { method: "POST", keepalive: true }).catch(() => {});

export const getMyHome = () => authed<{ rows: { key: string; title: string; items: ApiTitle[] }[] }>("/me/home");

export interface ApiTitleLite {
  id: string;
  slug: string;
  name: string;
  year: number | null;
  genres: string[];
  posterPath: string | null;
  accent: string[];
}

// ---- Admin (requires an ADMIN user) ----
export interface AdminProviderRow {
  slug: string;
  urlTemplate: string;
  episodeUrlTemplate: string | null;
  licenseRef: string;
  languages: string[];
  enabled: boolean;
}
export interface AdminTitle {
  id: string;
  slug: string;
  name: string;
  type: "MOVIE" | "SERIES";
  tmdbId: number | null;
  published: boolean;
}
const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export const adminProviders = () => authed<AdminProviderRow[]>("/admin/embed-providers");
export const adminSaveProvider = (
  exists: boolean,
  p: { slug: string; label: string; priority: number; urlTemplate: string; episodeUrlTemplate: string; licenseRef: string; languages: string[]; enabled: boolean },
) => {
  const { slug, ...rest } = p;
  return exists
    ? authed<unknown>(`/admin/embed-providers/${encodeURIComponent(slug)}`, json("PATCH", rest))
    : authed<unknown>("/admin/embed-providers", json("POST", p));
};
export const adminHosts = () => authed<{ env: string[]; added: string[] }>("/admin/embed-hosts");
export const adminAddHost = (host: string) => authed<unknown>("/admin/embed-hosts", json("POST", { host }));
export const adminRemoveHost = (host: string) => authed<void>(`/admin/embed-hosts/${encodeURIComponent(host)}`, json("DELETE"));
export const adminTitles = () => authed<AdminTitle[]>("/admin/titles");
export const adminSetTmdbId = (id: string, tmdbId: number) => authed<unknown>(`/admin/titles/${encodeURIComponent(id)}`, json("PATCH", { tmdbId }));
export const adminSetAdmin = (email: string, password: string) => authed<unknown>("/admin/admins", json("POST", { email, password }));
