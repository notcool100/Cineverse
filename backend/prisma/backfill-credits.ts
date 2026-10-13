import "reflect-metadata";
import { Prisma, PrismaClient } from "@prisma/client";
import { config } from "dotenv";

// Stores top-billed cast and key crew (director, writers, creators) per title from TMDB.
// Defaults to the most popular titles first; re-running skips titles that already have credits.
// Usage: pnpm db:backfill:credits [--limit=2000]
config();
const key = process.env.TMDB_API_KEY;
if (!key) throw new Error("TMDB_API_KEY is required");
const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice(8) ?? 2000);
const prisma = new PrismaClient();

interface Person { name: string; profile_path?: string | null; character?: string; job?: string; roles?: { character?: string }[]; jobs?: { job?: string }[]; order?: number; total_episode_count?: number }
interface Credits { cast?: Person[]; crew?: Person[] }

async function credits(kind: "movie" | "tv", id: number, attempt = 0): Promise<Credits | null> {
  // TV uses aggregate credits so the whole run's cast shows up, not just the latest season.
  const path = kind === "movie" ? "credits" : "aggregate_credits";
  const res = await fetch(`https://api.themoviedb.org/3/${kind}/${id}/${path}`, { headers: { Authorization: `Bearer ${key}` } });
  if (res.status === 429 && attempt < 6) {
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    return credits(kind, id, attempt + 1);
  }
  return res.ok ? ((await res.json()) as Credits) : null;
}

const KEY_JOBS = ["Director", "Screenplay", "Writer", "Story", "Creator", "Novel"];

function shape(c: Credits) {
  const cast = (c.cast ?? [])
    .slice(0, 20)
    .map((p) => ({ name: p.name, character: p.character ?? p.roles?.[0]?.character ?? "", profilePath: p.profile_path ?? null }));
  // One entry per person, with all their key jobs joined ("Director, Screenplay").
  const crew = new Map<string, { name: string; jobs: string[]; profilePath: string | null }>();
  for (const p of c.crew ?? []) {
    for (const job of p.jobs?.map((j) => j.job) ?? [p.job]) {
      if (!job || !KEY_JOBS.includes(job)) continue;
      const e = crew.get(p.name) ?? { name: p.name, jobs: [], profilePath: p.profile_path ?? null };
      if (!e.jobs.includes(job)) e.jobs.push(job);
      crew.set(p.name, e);
    }
  }
  const rank = (jobs: string[]) => Math.min(...jobs.map((j) => KEY_JOBS.indexOf(j)));
  return {
    cast,
    crew: [...crew.values()].sort((a, b) => rank(a.jobs) - rank(b.jobs)).slice(0, 8).map((e) => ({ name: e.name, job: e.jobs.join(", "), profilePath: e.profilePath })),
  };
}

async function main() {
  const rows = await prisma.title.findMany({
    where: { credits: { equals: Prisma.DbNull }, tmdbId: { not: null }, published: true },
    orderBy: { popularity: "desc" },
    take: limit,
    select: { id: true, tmdbId: true, type: true },
  });
  console.log(`${rows.length} titles to check`);
  let stored = 0;
  const started = Date.now();
  const BATCH = 25;
  for (let i = 0; i < rows.length; i += BATCH) {
    await Promise.all(
      rows.slice(i, i + BATCH).map(async (r) => {
        const c = await credits(r.type === "MOVIE" ? "movie" : "tv", r.tmdbId!);
        if (!c) return;
        await prisma.title.update({ where: { id: r.id }, data: { credits: shape(c) } });
        stored++;
      }),
    );
    if ((i / BATCH) % 20 === 19 || i + BATCH >= rows.length) {
      const done = Math.min(rows.length, i + BATCH);
      const eta = Math.round(((Date.now() - started) / done) * (rows.length - done) / 60000);
      console.log(`${done}/${rows.length} checked, ${stored} stored, ~${eta} min left`);
    }
  }
  console.log(`stored credits for ${stored} titles`);
}

main().finally(() => prisma.$disconnect());
