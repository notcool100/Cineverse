import "reflect-metadata";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

// Bulk catalog import from TMDB: popular + top-rated movies and TV, upserted by tmdbId.
// New titles are published immediately (embed providers play anything with a tmdbId); existing rows keep
// their `published` flag so an admin's unpublish sticks. TV titles get placeholder Episode rows
// (season/number only) from TMDB's season episode counts.
// Usage: pnpm db:import:tmdb [--limit=1000]   (limit = titles per type, default 1000)
config();
const key = process.env.TMDB_API_KEY;
if (!key) throw new Error("TMDB_API_KEY is required");
const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice(8) ?? 1000);
const prisma = new PrismaClient();

interface Item {
  id: number; title?: string; name?: string; overview?: string; poster_path?: string | null; backdrop_path?: string | null;
  release_date?: string; first_air_date?: string; genre_ids?: number[]; adult?: boolean;
}
interface TvDetail { seasons?: { season_number: number; episode_count: number }[]; episode_run_time?: number[] }

async function tmdb<T>(path: string, attempt = 0): Promise<T> {
  const res = await fetch(`https://api.themoviedb.org/3${path}`, { headers: { Authorization: `Bearer ${key}` } });
  if (res.status === 429 && attempt < 5) {
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    return tmdb<T>(path, attempt + 1);
  }
  if (!res.ok) throw new Error(`TMDB ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

/** Retries transient database connection failures (P1001/P1002/P1017) with backoff; rethrows anything else. */
async function db<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (!["P1001", "P1002", "P1017"].includes(code ?? "") || attempt >= 8) throw e;
      const wait = Math.min(30000, 2000 * 2 ** attempt);
      console.warn(`database unreachable (${code}); retrying in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

async function genreMap(kind: "movie" | "tv") {
  const { genres } = await tmdb<{ genres: { id: number; name: string }[] }>(`/genre/${kind}/list`);
  return new Map(genres.map((g) => [g.id, g.name]));
}

async function collect(kind: "movie" | "tv") {
  const items = new Map<number, Item>();
  for (const list of ["popular", "top_rated"]) {
    for (let page = 1; page <= 500 && items.size < limit; page++) {
      const { results } = await tmdb<{ results: Item[] }>(`/${kind}/${list}?page=${page}`);
      if (!results.length) break;
      for (const r of results) if (!r.adult && !items.has(r.id) && items.size < limit) items.set(r.id, r);
    }
  }
  return [...items.values()];
}

async function importKind(kind: "movie" | "tv") {
  const genres = await genreMap(kind);
  const items = await collect(kind);
  let done = 0;
  for (let i = 0; i < items.length; i += 8) {
    await Promise.all(items.slice(i, i + 8).map(async (m) => {
      const name = m.title ?? m.name;
      if (!name) return;
      const date = m.release_date || m.first_air_date || undefined;
      const tv = kind === "tv" ? await tmdb<TvDetail>(`/tv/${m.id}`) : null;
      const data = {
        type: kind === "movie" ? ("MOVIE" as const) : ("SERIES" as const),
        name,
        overview: m.overview || null,
        posterPath: m.poster_path ?? null,
        backdropPath: m.backdrop_path ?? null,
        releaseDate: date ? new Date(date) : undefined,
        year: date ? new Date(date).getUTCFullYear() : undefined,
        runtimeMin: tv?.episode_run_time?.[0],
        genres: (m.genre_ids ?? []).flatMap((g) => genres.get(g) ?? []),
      };
      const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "title"}-${m.id}`;
      const t = await db(() => prisma.title.upsert({ where: { tmdbId: m.id }, create: { ...data, tmdbId: m.id, slug, published: true }, update: data }));
      const eps = (tv?.seasons ?? []).filter((s) => s.season_number > 0).flatMap((s) =>
        Array.from({ length: s.episode_count }, (_, n) => ({ titleId: t.id, season: s.season_number, number: n + 1 })));
      if (eps.length) await db(() => prisma.episode.createMany({ data: eps, skipDuplicates: true }));
      done++;
    }));
    if ((i / 8) % 10 === 0) console.log(`${kind}: ${Math.min(i + 8, items.length)}/${items.length}`);
  }
  console.log(`${kind}: imported ${done}`);
}

async function main() {
  await importKind("movie");
  await importKind("tv");
  console.log("Done. Restart the API (or trigger a reindex) so search picks up the new titles.");
}

main().finally(() => prisma.$disconnect());
