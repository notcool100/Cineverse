import { Prisma } from "@prisma/client";

/** Filters shared by the catalog list, Postgres search and the Meilisearch path. */
export interface CatalogFilters {
  type?: "MOVIE" | "SERIES";
  genre?: string;
  language?: string;
  /** Exact release year. */
  year?: number;
  yearFrom?: number;
  yearTo?: number;
  /** Certification values, e.g. ["PG-13", "R"]. */
  rating?: string[];
}

/** Escapes LIKE wildcards so user input is matched literally. */
export const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Splits `rating=PG-13,R` into clean certification values. */
export const parseRatings = (v?: string) => (v ? [...new Set(v.split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 12) : undefined);

export function filtersToWhere(f: CatalogFilters): Prisma.TitleWhereInput {
  const year: Prisma.IntNullableFilter | undefined =
    f.year !== undefined ? { equals: f.year } : f.yearFrom !== undefined || f.yearTo !== undefined ? { gte: f.yearFrom, lte: f.yearTo } : undefined;
  return {
    ...(f.type && { type: f.type }),
    ...(f.genre && { genres: { has: f.genre } }),
    ...(f.language && { language: f.language }),
    ...(year && { year }),
    ...(f.rating?.length && { rating: { in: f.rating } }),
  };
}

/** Meilisearch filter expressions equivalent to `filtersToWhere`. Values are quoted and stripped of quotes. */
export function filtersToMeili(f: CatalogFilters): string[] {
  const q = (v: string) => `"${v.replace(/["\\]/g, "")}"`;
  const out: string[] = [];
  if (f.type) out.push(`type = ${q(f.type)}`);
  if (f.genre) out.push(`genres = ${q(f.genre)}`);
  if (f.language) out.push(`language = ${q(f.language)}`);
  if (f.year !== undefined) out.push(`year = ${Number(f.year)}`);
  if (f.yearFrom !== undefined) out.push(`year >= ${Number(f.yearFrom)}`);
  if (f.yearTo !== undefined) out.push(`year <= ${Number(f.yearTo)}`);
  if (f.rating?.length) out.push(`(${f.rating.map((r) => `rating = ${q(r)}`).join(" OR ")})`);
  return out;
}

/**
 * Ranked candidate ids for a text query, best first: title prefix, title contains, genre, cast/crew name, overview.
 * Ties break on popularity. Capped so a one-letter query can't pull the whole catalog.
 */
export function rankedMatchesSql(q: string, limit = 500): Prisma.Sql {
  const exact = likeEscape(q);
  const prefix = `${exact}%`;
  const contains = `%${exact}%`;
  return Prisma.sql`
    SELECT id FROM (
      SELECT t.id, t.popularity,
        CASE
          WHEN t.name ILIKE ${prefix} THEN 0
          WHEN t.name ILIKE ${contains} THEN 1
          WHEN EXISTS (SELECT 1 FROM unnest(t.genres) g WHERE g ILIKE ${exact}) THEN 2
          WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.credits->'cast') = 'array' THEN t.credits->'cast' ELSE '[]'::jsonb END) c
            WHERE c->>'name' ILIKE ${contains}
          ) OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.credits->'crew') = 'array' THEN t.credits->'crew' ELSE '[]'::jsonb END) c
            WHERE c->>'name' ILIKE ${contains}
          ) THEN 3
          WHEN t.overview ILIKE ${contains} THEN 4
        END AS rank
      FROM "Title" t
      WHERE t.published AND t."posterPath" IS NOT NULL AND t."posterPath" <> ''
    ) s
    WHERE rank IS NOT NULL
    ORDER BY rank, popularity DESC
    LIMIT ${limit}`;
}

/** People (cast and crew) whose name matches, most-credited first; word-start matches outrank mid-word ones. */
export function peopleSql(q: string, limit = 4): Prisma.Sql {
  const exact = likeEscape(q);
  return Prisma.sql`
    SELECT name, count(DISTINCT id)::int AS titles, bool_or(starts) AS starts FROM (
      SELECT t.id, c->>'name' AS name, (c->>'name' ILIKE ${`${exact}%`} OR c->>'name' ILIKE ${`% ${exact}%`}) AS starts
      FROM "Title" t, jsonb_array_elements(
        (CASE WHEN jsonb_typeof(t.credits->'cast') = 'array' THEN t.credits->'cast' ELSE '[]'::jsonb END) ||
        (CASE WHEN jsonb_typeof(t.credits->'crew') = 'array' THEN t.credits->'crew' ELSE '[]'::jsonb END)
      ) c
      WHERE t.published AND c->>'name' ILIKE ${`%${exact}%`}
    ) p
    GROUP BY name
    ORDER BY bool_or(starts) DESC, count(DISTINCT id) DESC, name
    LIMIT ${limit}`;
}
