import "reflect-metadata";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

// Fills Episode name, overview, still and runtime from TMDB season endpoints (one call per season).
// Only episodes that have no name yet are fetched, so it is cheap to re-run after new imports.
// Usage: pnpm db:backfill:episodes
config();
const key = process.env.TMDB_API_KEY;
if (!key) throw new Error("TMDB_API_KEY is required");
const prisma = new PrismaClient();

interface TmdbEpisode { episode_number: number; name?: string; overview?: string; still_path?: string | null; runtime?: number | null }

async function season(tmdbId: number, n: number, attempt = 0): Promise<TmdbEpisode[]> {
  const res = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${n}`, { headers: { Authorization: `Bearer ${key}` } });
  if (res.status === 429 && attempt < 6) {
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    return season(tmdbId, n, attempt + 1);
  }
  if (!res.ok) return [];
  return ((await res.json()) as { episodes?: TmdbEpisode[] }).episodes ?? [];
}

async function main() {
  const pending = await prisma.episode.findMany({
    where: { name: null, title: { tmdbId: { not: null } } },
    select: { season: true, title: { select: { id: true, tmdbId: true } } },
    distinct: ["titleId", "season"],
  });
  console.log(`${pending.length} seasons to fetch`);
  let updated = 0;
  for (let i = 0; i < pending.length; i += 10) {
    await Promise.all(
      pending.slice(i, i + 10).map(async ({ season: n, title }) => {
        for (const e of await season(title.tmdbId!, n)) {
          const r = await prisma.episode.updateMany({
            where: { titleId: title.id, season: n, number: e.episode_number },
            data: { name: e.name || null, overview: e.overview || null, stillPath: e.still_path ?? null, runtimeMin: e.runtime ?? null },
          });
          updated += r.count;
        }
      }),
    );
    if ((i / 10) % 20 === 0) console.log(`${Math.min(i + 10, pending.length)}/${pending.length} seasons, ${updated} episodes`);
  }
  console.log(`updated ${updated} episodes`);
}

main().finally(() => prisma.$disconnect());
