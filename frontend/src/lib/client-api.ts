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
  /** Undefined for sessions stored before verification existed; false means a reminder is shown. */
  emailVerified?: boolean;
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
  /** The profile is PIN-locked; the server wants a token from verifyProfilePin on every request. */
  hasPin?: boolean;
}
/** The stored active profile also carries its unlock token (never sent anywhere but the API). */
export type ActiveProfile = Profile & { userId: string; pinToken?: string };
export function loadProfile(): ActiveProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    const p = raw ? (JSON.parse(raw) as ActiveProfile) : null;
    // A stored profile only counts for the account it was picked under.
    return p && p.userId === loadSession()?.user.id ? p : null;
  } catch {
    return null;
  }
}
export function saveProfile(p: (Profile & { pinToken?: string }) | null) {
  try {
    const uid = loadSession()?.user.id;
    // Keep the unlock token across background profile refreshes (the server list never includes it).
    const keep = p && !p.pinToken && loadProfile()?.id === p.id ? loadProfile()?.pinToken : undefined;
    if (p && uid) localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...p, ...(keep && { pinToken: keep }), userId: uid }));
    else localStorage.removeItem(PROFILE_KEY);
  } catch {}
  window.dispatchEvent(new Event("cineora-profile"));
}

async function raw(path: string, init: RequestInit & { token?: string } = {}) {
  const { token, ...rest } = init;
  const profile = token ? loadProfile() : null;
  return fetch(`${API}${path}`, {
    ...rest,
    headers: {
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(profile ? { "X-Profile-Id": profile.id } : {}),
      ...(profile?.pinToken ? { "X-Profile-Token": profile.pinToken } : {}),
      // Per-request headers win (e.g. an unlock token for editing a different locked profile).
      ...(rest.headers as Record<string, string> | undefined),
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
  try {
    return await parse<T>(res);
  } catch (e) {
    // The active profile is PIN-locked and the unlock expired (or was never given): back to the picker.
    if (e instanceof ApiError && e.status === 403 && e.message === "PIN required" && !path.startsWith("/me/profiles") && loadProfile()) {
      saveProfile(null);
      // Full navigation on purpose: every per-profile fetch on the page must start over.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/profiles");
    }
    throw e;
  }
}

/** A usable access token, refreshed first when it is about to expire (sockets can't retry a 401 like fetch can). */
export async function freshAccessToken(): Promise<string | null> {
  let s = loadSession();
  if (!s) return null;
  try {
    const exp = JSON.parse(atob(s.accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp as number;
    if (exp * 1000 - Date.now() < 60_000) s = (await refresh()) ?? s;
  } catch {
    s = (await refresh()) ?? s;
  }
  return s.accessToken;
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

export const getUnavailableProviders = (titleId: string, season?: number, episode?: number) =>
  authed<{ unavailable: string[] }>("/playback/availability", { method: "POST", body: JSON.stringify({ titleId, season, episode }) });

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

/** Drops a title (or one episode) from history, which also removes it from Continue watching. */
export const removeFromHistory = (titleId: string, episodeId?: string) =>
  authed<void>(`/me/history/${encodeURIComponent(titleId)}${episodeId !== undefined ? `?episodeId=${encodeURIComponent(episodeId)}` : ""}`, { method: "DELETE" });
export const clearHistory = () => authed<void>("/me/history", { method: "DELETE" });

export interface EpisodeProgress {
  episodeId: string;
  positionSec: number;
  durationSec: number;
}
export const getTitleHistory = (titleId: string) => authed<EpisodeProgress[]>(`/me/history/${encodeURIComponent(titleId)}`);
export const markSeasonWatched = (titleId: string, season: number, watched: boolean) =>
  authed<void>(`/me/history/${encodeURIComponent(titleId)}/season/${season}`, { method: "PUT", body: JSON.stringify({ watched }) });

export const getProfiles = () => authed<Profile[]>("/me/profiles");
export const createProfile = (p: { name: string; avatar: string; isKids: boolean; pin?: string }) =>
  authed<Profile>("/me/profiles", { method: "POST", body: JSON.stringify(p) });
/** `pin`: 4 digits sets the lock, null removes it. Editing a locked profile needs its unlock `token`. */
export const updateProfile = (id: string, p: Partial<Pick<Profile, "name" | "avatar" | "isKids">> & { pin?: string | null }, token?: string) =>
  authed<Profile>(`/me/profiles/${id}`, { method: "PATCH", body: JSON.stringify(p), ...(token && { headers: { "X-Profile-Token": token } }) });
export const deleteProfile = (id: string, token?: string) =>
  authed<void>(`/me/profiles/${id}`, { method: "DELETE", ...(token && { headers: { "X-Profile-Token": token } }) });
/** Exchanges a profile's PIN for a 12-hour unlock token. */
export const verifyProfilePin = (id: string, pin: string) =>
  authed<{ token: string | null }>(`/me/profiles/${id}/verify-pin`, { method: "POST", body: JSON.stringify({ pin }) }).then((r) => r.token);
export const getKidsHome = () =>
  fetch(`${API}/home?kids=1`).then((r) => r.json() as Promise<{ rows: { key: string; title: string; items: ApiTitle[] }[] }>);

/** 1 = liked, -1 = disliked, 0 = unrated. */
export const getRating = (titleId: string) => authed<{ value: number }>(`/me/ratings/${encodeURIComponent(titleId)}`).then((r) => r.value);
export const setRating = (titleId: string, value: 1 | -1 | 0) =>
  value === 0
    ? authed<void>(`/me/ratings/${encodeURIComponent(titleId)}`, { method: "DELETE" })
    : authed<void>(`/me/ratings/${encodeURIComponent(titleId)}`, { method: "PUT", body: JSON.stringify({ value }) });

/** Taste match 0-100 per title for the active profile; titles without a score are absent from the result. */
export const getMatches = (ids: string[]) => authed<Record<string, number>>(`/me/match?ids=${ids.map(encodeURIComponent).join(",")}`);

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

export interface AdminEpisode {
  id: string;
  season: number;
  number: number;
  name: string | null;
  runtimeMin: number | null;
  introStartSec: number | null;
  introEndSec: number | null;
  creditsStartSec: number | null;
}
export type Markers = Pick<AdminEpisode, "introStartSec" | "introEndSec" | "creditsStartSec">;
export const adminEpisodes = (titleId: string) => authed<AdminEpisode[]>(`/admin/titles/${encodeURIComponent(titleId)}/episodes`);
export const adminSetEpisodeMarkers = (episodeId: string, m: Markers) => authed<unknown>(`/admin/episodes/${encodeURIComponent(episodeId)}/markers`, json("PATCH", m));
export const adminSetSeasonMarkers = (titleId: string, season: number, m: Markers) =>
  authed<{ updated: number }>(`/admin/titles/${encodeURIComponent(titleId)}/seasons/${season}/markers`, json("PUT", m));

// ---- Notifications and reminders ----
export interface AppNotification {
  id: string;
  type: "SOURCE_ADDED" | "EPISODE_ADDED" | "RELEASED";
  message: string;
  read: boolean;
  createdAt: string;
  title: { slug: string; name: string; posterPath: string | null };
}
export const getNotifications = () => authed<{ unread: number; items: AppNotification[] }>("/me/notifications");
/** Marks the given notifications read, or all of them when no ids are passed. */
export const markNotificationsRead = (ids?: string[]) => authed<void>("/me/notifications/read", { method: "POST", body: JSON.stringify(ids ? { ids } : {}) });
export const getReminders = () => authed<string[]>("/me/reminders");
export const setReminder = (titleId: string, on: boolean) => authed<void>(`/me/reminders/${encodeURIComponent(titleId)}`, { method: on ? "PUT" : "DELETE" });

// ---- Reports and requests ----
export type ReportReason = "BROKEN" | "WRONG_TITLE" | "NO_AUDIO" | "BAD_QUALITY" | "OTHER";
export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "BROKEN", label: "Won't play / error" },
  { value: "WRONG_TITLE", label: "Wrong movie or episode" },
  { value: "NO_AUDIO", label: "No audio or out of sync" },
  { value: "BAD_QUALITY", label: "Poor quality / buffering" },
  { value: "OTHER", label: "Something else" },
];
/** `sourceKey` is a source id, or `provider:<slug>` for built-in servers. */
export const reportSource = (r: { titleId: string; sourceKey: string; season?: number; episode?: number; reason: ReportReason; note?: string }) =>
  authed<{ flagged: boolean }>("/playback/report", json("POST", r));

export interface TitleRequest {
  id: string;
  name: string;
  type: "MOVIE" | "SERIES";
  tmdbId: number | null;
  note: string | null;
  status: "OPEN" | "ADDED" | "REJECTED";
  titleId: string | null;
  createdAt: string;
  votes: number;
  voted: boolean;
  mine: boolean;
}
export const getRequests = (sort: "top" | "new", status: TitleRequest["status"] = "OPEN") => authed<TitleRequest[]>(`/requests?sort=${sort}&status=${status}`);
export const createRequest = (r: { name: string; type: "MOVIE" | "SERIES"; tmdbId?: number; note?: string }) =>
  authed<{ id: string; duplicate: boolean }>("/requests", json("POST", r));
export const voteRequest = (id: string, on: boolean) => authed<void>(`/requests/${encodeURIComponent(id)}/vote`, json(on ? "PUT" : "DELETE"));
export const deleteRequest = (id: string) => authed<void>(`/requests/${encodeURIComponent(id)}`, json("DELETE"));

export interface AdminReportGroup {
  titleId: string;
  slug: string;
  title: string;
  sourceKey: string;
  episodeKey: string;
  sourceLabel: string;
  kind: "source" | "provider";
  sourceStatus: "UPLOADING" | "PROCESSING" | "READY" | "FAILED" | null;
  reporters: number;
  reasons: Record<string, number>;
  notes: string[];
  lastReportedAt: string;
}
export const adminReports = () => authed<AdminReportGroup[]>("/admin/reports");
export const adminResolveReport = (g: Pick<AdminReportGroup, "titleId" | "sourceKey" | "episodeKey">) => authed<void>("/admin/reports/resolve", json("POST", g));
export const adminRestoreSource = (id: string) => authed<void>(`/admin/sources/${encodeURIComponent(id)}/restore`, json("POST"));
export interface AdminRequest extends Omit<TitleRequest, "voted" | "mine"> {
  requester: string;
}
export const adminRequests = (status?: TitleRequest["status"]) => authed<AdminRequest[]>(`/admin/requests${status ? `?status=${status}` : ""}`);
export const adminDecideRequest = (id: string, status: TitleRequest["status"], title?: string) => authed<unknown>(`/admin/requests/${encodeURIComponent(id)}`, json("PATCH", { status, title }));

// ---- Custom lists ----
export interface ListSummary {
  id: string;
  name: string;
  count: number;
  posters: string[];
  /** Present when requested for a specific title. */
  hasTitle?: boolean;
}
export const getLists = (titleId?: string) => authed<ListSummary[]>(`/me/lists${titleId ? `?titleId=${encodeURIComponent(titleId)}` : ""}`);
export const createList = (name: string) => authed<ListSummary>("/me/lists", json("POST", { name }));
export const renameList = (id: string, name: string) => authed<void>(`/me/lists/${encodeURIComponent(id)}`, json("PATCH", { name }));
export const deleteList = (id: string) => authed<void>(`/me/lists/${encodeURIComponent(id)}`, json("DELETE"));
export const getList = (id: string) => authed<{ id: string; name: string; items: ApiTitle[] }>(`/me/lists/${encodeURIComponent(id)}`);
export const setListItem = (listId: string, titleId: string, on: boolean) =>
  authed<void>(`/me/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(titleId)}`, json(on ? "PUT" : "DELETE"));

// ---- Collections (public) ----
export interface CollectionCard {
  key: string;
  title: string;
  blurb: string;
  accent: [string, string];
  total: number;
  posters: string[];
}
export const getCollectionCards = () => fetch(`${API}/collections`).then((r) => (r.ok ? (r.json() as Promise<CollectionCard[]>) : []));
export const getCollectionItems = (key: string, kids: boolean, page = 1) =>
  fetch(`${API}/collections/${encodeURIComponent(key)}?page=${page}${kids ? "&kids=1" : ""}`).then((r) => {
    if (!r.ok) throw new ApiError(r.status, "Collection not found");
    return r.json() as Promise<{ collection: { key: string; title: string; blurb: string; accent: [string, string] }; items: ApiTitle[]; total: number; page: number; limit: number }>;
  });

// ---- Viewing activity ----
export interface ActivityItem {
  titleId: string;
  episodeId: string;
  positionSec: number;
  durationSec: number;
  updatedAt: string;
  title: { slug: string; name: string; type: "MOVIE" | "SERIES"; year: number | null; posterPath: string | null; accent: string[] };
}
export const getActivity = (before?: string) =>
  authed<{ items: ActivityItem[]; next: string | null }>(`/me/activity${before ? `?before=${encodeURIComponent(before)}` : ""}`);

// ---- Email verification and password reset ----
const postJson = (path: string, body: unknown) => raw(path, { method: "POST", body: JSON.stringify(body) }).then((r) => parse<void>(r));
export const forgotPassword = (email: string) => postJson("/auth/forgot-password", { email });
export const resetPassword = (token: string, password: string) => postJson("/auth/reset-password", { token, password });
export const verifyEmail = (token: string) => postJson("/auth/verify-email", { token });
export const requestVerification = () => authed<{ sent?: boolean; alreadyVerified?: boolean }>("/auth/verify-email/request", { method: "POST" });
/** Re-reads the account from the server and updates the stored session (e.g. after verifying in another tab). */
export async function refreshMe(): Promise<User | null> {
  const s = loadSession();
  if (!s) return null;
  const user = await authed<User>("/auth/me");
  const cur = loadSession();
  if (cur) saveSession({ ...cur, user });
  return user;
}

// ---- Admin analytics ----
export interface DayPoint {
  date: string;
  value: number;
}
export interface AdminAnalytics {
  days: number;
  totals: { users: number; verifiedUsers: number; profiles: number; titles: number; publishedTitles: number; sources: number; failedSources: number; openRequests: number; openReports: number };
  series: { views: DayPoint[]; watches: DayPoint[]; signups: DayPoint[] };
  topTitles: { slug: string; name: string; type: "MOVIE" | "SERIES"; views: number; watches: number; saves: number }[];
  deadSources: AdminReportGroup[];
}
export const adminAnalytics = (days = 14) => authed<AdminAnalytics>(`/admin/analytics?days=${days}`);
