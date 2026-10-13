"use cache";

import { cacheLife } from "next/cache";
import type { Title } from "./types";
import { toTitle, type ApiTitle } from "./title-map";

// Server-side catalog reads from the Cineora API (GET /titles, /titles/:id). Cached for a few minutes.
const API_URL = process.env.API_URL ?? "http://localhost:4000";

async function api<T>(path: string): Promise<T | undefined> {
  const res = await fetch(`${API_URL}${path}`);
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json();
}

export async function getTitles(): Promise<Title[]> {
  cacheLife("minutes");
  const data = await api<{ items: ApiTitle[] }>("/titles?limit=50");
  return (data?.items ?? []).map(toTitle);
}

export async function getTitle(id: string): Promise<Title | undefined> {
  cacheLife("minutes");
  const t = await api<ApiTitle>(`/titles/${encodeURIComponent(id)}`);
  return t && toTitle(t);
}

export async function getGenres(): Promise<string[]> {
  cacheLife("minutes");
  return (await api<string[]>("/genres")) ?? [];
}

export async function getLanguages(): Promise<string[]> {
  cacheLife("minutes");
  return (await api<string[]>("/languages")) ?? [];
}

export interface BrowseQuery {
  q?: string;
  language?: string;
  type?: Title["type"];
  genre?: string;
  sort?: "newest" | "name" | "year";
  page: number;
  limit: number;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/** Paginated catalog listing; goes through /search when a text query is present. */
export async function browseTitles(q: BrowseQuery): Promise<Page<Title>> {
  cacheLife("minutes");
  const p = new URLSearchParams({ page: String(q.page), limit: String(q.limit) });
  if (q.type) p.set("type", q.type);
  if (q.genre) p.set("genre", q.genre);
  if (q.language) p.set("language", q.language);
  if (q.q) p.set("q", q.q);
  else if (q.sort) p.set("sort", q.sort);
  const data = await api<Page<ApiTitle>>(`${q.q ? "/search" : "/titles"}?${p}`);
  return { ...(data ?? { total: 0, page: q.page, limit: q.limit }), items: (data?.items ?? []).map(toTitle) };
}

export interface HomeRow {
  key: string;
  title: string;
  items: Title[];
}
export interface Home {
  hero: Title | null;
  rows: HomeRow[];
}

/** Ranked home page: hero plus de-duplicated rows (trending, series, movies, languages, genres). */
export async function getHome(): Promise<Home> {
  cacheLife("minutes");
  const data = await api<{ hero: ApiTitle | null; rows: { key: string; title: string; items: ApiTitle[] }[] }>("/home");
  return {
    hero: data?.hero ? toTitle(data.hero) : null,
    rows: (data?.rows ?? []).map((r) => ({ ...r, items: r.items.map(toTitle) })),
  };
}

export async function getRelated(id: string): Promise<Title[]> {
  cacheLife("minutes");
  const data = await api<ApiTitle[]>(`/titles/${encodeURIComponent(id)}/related`);
  return (data ?? []).map(toTitle);
}
