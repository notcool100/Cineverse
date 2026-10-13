import "reflect-metadata";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

// Backfills popularity, voteCount and language on existing titles from TMDB list endpoints.
// Bulk-updates by tmdbId (no per-title detail calls), so it is fast and never touches other fields.
// Values are overwritten, so re-running (e.g. weekly) keeps popularity fresh.
// Usage: pnpm db:backfill:tmdb [--pages=500]   (TMDB caps list paging at 500 pages = 10k items per source)
//        pnpm db:backfill:tmdb --missing        (per-title detail fetch for titles still at popularity 0, i.e. outside every list)
config();
const key = process.env.TMDB_API_KEY;
if (!key) throw new Error("TMDB_API_KEY is required");
const pages = Number(process.argv.find((a) => a.startsWith("--pages="))?.slice(8) ?? 500);
const LANGS = ["hi", "ta", "te", "ml", "kn", "bn", "mr", "pa", "en", "ko", "ja", "es", "fr", "ur", "gu", "or", "as", "th", "zh", "tr"];
const prisma = new PrismaClient();

interface Item { id: number; popularity?: number; vote_count?: number; original_language?: string; adult?: boolean }

async function tmdb(path: string, attempt = 0): Promise<{ results: Item[] }> {
  const res = await fetch(`https://api.themoviedb.org/3${path}`, { headers: { Authorization: `Bearer ${key}` } });
  if (res.status === 429 && attempt < 6) {
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    return tmdb(path, attempt + 1);
  }
  if (!res.ok) return { results: [] };
  return res.json();
}

async function save(type: "MOVIE" | "SERIES", items: Item[]) {
  const seen = new Map(items.map((i) => [i.id, i]));
  const v = [...seen.values()];
  if (!v.length) return 0;
  return prisma.$executeRaw`
    UPDATE "Title" t SET popularity = v.p, "voteCount" = v.c, language = COALESCE(t.language, v.l)
    FROM unnest(${v.map((i) => i.id)}::int[], ${v.map((i) => i.popularity ?? 0)}::float8[], ${v.map((i) => i.vote_count ?? 0)}::int[], ${v.map((i) => i.original_language ?? null)}::text[]) AS v(id, p, c, l)
    WHERE t."tmdbId" = v.id AND t.type = ${type}::"TitleType"`;
}

async function missing() {
  const rows = await prisma.title.findMany({ where: { popularity: 0, tmdbId: { not: null } }, select: { tmdbId: true, type: true } });
  console.log(`${rows.length} titles without popularity`);
  let done = 0;
  for (let i = 0; i < rows.length; i += 10) {
    await Promise.all(
      rows.slice(i, i + 10).map(async (r) => {
        const res = await fetch(`https://api.themoviedb.org/3/${r.type === "MOVIE" ? "movie" : "tv"}/${r.tmdbId}`, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) return;
        const d = (await res.json()) as Item;
        done += await save(r.type, [{ ...d, id: r.tmdbId! }]);
      }),
    );
  }
  console.log(`updated ${done}`);
}

async function main() {
  if (process.argv.includes("--missing")) return missing();
  for (const kind of ["movie", "tv"] as const) {
    const type = kind === "movie" ? "MOVIE" : "SERIES";
    const sources = [
      `/${kind}/popular?page=`,
      `/${kind}/top_rated?page=`,
      ...LANGS.flatMap((l) => [
        `/discover/${kind}?with_original_language=${l}&sort_by=vote_count.desc&include_adult=false&page=`,
        `/discover/${kind}?with_original_language=${l}&sort_by=popularity.desc&include_adult=false&page=`,
      ]),
    ];
    for (const src of sources) {
      let updated = 0;
      for (let start = 1; start <= pages; start += 10) {
        const batch = await Promise.all(Array.from({ length: Math.min(10, pages - start + 1) }, (_, i) => tmdb(`${src}${start + i}`)));
        const items = batch.flatMap((b) => b.results);
        if (!items.length) break;
        updated += await save(type, items);
      }
      console.log(`${kind} ${src.replace("&include_adult=false&page=", "").replace("?page=", "")}: ${updated} rows updated`);
    }
  }
}

main().finally(() => prisma.$disconnect());
