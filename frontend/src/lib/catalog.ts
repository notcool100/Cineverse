"use cache";

import { cacheLife } from "next/cache";
import type { Source, Title } from "./types";

// Server-side catalog reads from the Cineora API (GET /titles, /titles/:id). Cached for a few minutes.
const API_URL = process.env.API_URL ?? "http://localhost:4000";

interface ApiTitle {
  slug: string;
  type: Title["type"];
  name: string;
  overview: string | null;
  year: number | null;
  runtimeMin: number | null;
  rating: string | null;
  genres: string[];
  posterPath: string | null;
  backdropPath: string | null;
  posterCredit: string | null;
  backdropCredit: string | null;
  accent: string[];
  sources: Source[];
}

function toTitle(t: ApiTitle): Title {
  return {
    id: t.slug,
    type: t.type,
    name: t.name,
    overview: t.overview ?? "",
    year: t.year ?? 0,
    runtimeMin: t.runtimeMin ?? 0,
    genres: t.genres,
    rating: t.rating ?? "NR",
    poster: t.posterPath ?? "",
    posterCredit: t.posterCredit ?? "",
    backdrop: t.backdropPath ?? "",
    backdropCredit: t.backdropCredit ?? "",
    accent: [t.accent[0] ?? "#333333", t.accent[1] ?? "#0a0a0a"],
    sources: t.sources,
  };
}

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
  return [...new Set((await getTitles()).flatMap((t) => t.genres))].sort();
}

export async function getTitlesByGenre(genre: string): Promise<Title[]> {
  return (await getTitles()).filter((t) => t.genres.includes(genre));
}

export async function getRelated(id: string, limit = 12): Promise<Title[]> {
  const all = await getTitles();
  const base = all.find((t) => t.id === id);
  const shared = (t: Title) => t.genres.filter((g) => base?.genres.includes(g)).length;
  return all
    .filter((t) => t.id !== id)
    .sort((a, b) => shared(b) - shared(a))
    .slice(0, limit);
}
