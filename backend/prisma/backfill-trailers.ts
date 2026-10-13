import "reflect-metadata";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

// Stores the best YouTube trailer id per title from TMDB's /videos endpoint.
// Defaults to the most popular titles first; re-running skips titles that already have a trailer.
// Usage: pnpm db:backfill:trailers [--limit=2000]
config();
const key = process.env.TMDB_API_KEY;
if (!key) throw new Error("TMDB_API_KEY is required");
const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice(8) ?? 2000);
const prisma = new PrismaClient();

interface Video { key: string; site: string; type: string; official?: boolean; iso_639_1?: string; published_at?: string }

async function videos(kind: "movie" | "tv", id: number, attempt = 0): Promise<Video[]> {
  const res = await fetch(`https://api.themoviedb.org/3/${kind}/${id}/videos`, { headers: { Authorization: `Bearer ${key}` } });
  if (res.status === 429 && attempt < 6) {
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    return videos(kind, id, attempt + 1);
  }
  if (!res.ok) return [];
  return ((await res.json()) as { results?: Video[] }).results ?? [];
}

/** Official English trailer first, then any official trailer, then any trailer; newest wins ties. */
function pick(vs: Video[]): string | null {
  const score = (v: Video) => (v.official ? 2 : 0) + (v.iso_639_1 === "en" ? 1 : 0);
  const best = vs
    .filter((v) => v.site === "YouTube" && v.type === "Trailer")
    .sort((a, b) => score(b) - score(a) || (b.published_at ?? "").localeCompare(a.published_at ?? ""))[0];
  return best?.key ?? null;
}

async function main() {
  const rows = await prisma.title.findMany({
    where: { trailerKey: null, tmdbId: { not: null }, published: true },
    orderBy: { popularity: "desc" },
    take: limit,
    select: { id: true, tmdbId: true, type: true },
  });
  console.log(`${rows.length} titles to check`);
  let found = 0;
  const started = Date.now();
  const BATCH = 15;
  for (let i = 0; i < rows.length; i += BATCH) {
    await Promise.all(
      rows.slice(i, i + BATCH).map(async (r) => {
        const k = pick(await videos(r.type === "MOVIE" ? "movie" : "tv", r.tmdbId!));
        if (!k) return;
        await prisma.title.update({ where: { id: r.id }, data: { trailerKey: k } });
        found++;
      }),
    );
    if ((i / BATCH) % 20 === 19 || i + BATCH >= rows.length) {
      const done = Math.min(rows.length, i + BATCH);
      const eta = Math.round((((Date.now() - started) / done) * (rows.length - done)) / 60000);
      console.log(`${done}/${rows.length} checked, ${found} trailers, ~${eta} min left`);
    }
  }
  console.log(`stored ${found} trailers`);
}

main().finally(() => prisma.$disconnect());
