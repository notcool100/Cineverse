import Link from "next/link";
import { redirect } from "next/navigation";
import { browseTitles, getGenres, type BrowseQuery } from "@/lib/catalog";
import type { TitleType } from "@/lib/types";
import { Pagination } from "./Pagination";
import { TitleCard } from "./TitleCard";

type Params = Record<string, string | string[] | undefined>;
const PAGE_SIZE = 20;
const SORTS = [
  { value: "newest", label: "Recently added" },
  { value: "year", label: "Release year" },
  { value: "name", label: "A–Z" },
] as const;
const TYPES: { value: TitleType | undefined; label: string; path: string }[] = [
  { value: undefined, label: "All", path: "/browse" },
  { value: "MOVIE", label: "Movies", path: "/movies" },
  { value: "SERIES", label: "TV Shows", path: "/series" },
];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Filterable, paginated grid shared by /browse, /movies, /series and /new. State lives in the URL. */
export async function BrowseView({
  basePath,
  heading,
  type,
  defaultSort = "newest",
  searchParams,
}: {
  basePath: string;
  heading: string;
  type?: TitleType;
  defaultSort?: BrowseQuery["sort"];
  searchParams: Promise<Params>;
}) {
  const sp = await searchParams;
  const q = one(sp.q)?.trim().slice(0, 100) || undefined;
  const genre = one(sp.genre) || undefined;
  const sortParam = one(sp.sort);
  const sort = SORTS.find((s) => s.value === sortParam)?.value ?? defaultSort;
  const typeParam = type ?? (one(sp.type) === "MOVIE" || one(sp.type) === "SERIES" ? (one(sp.type) as TitleType) : undefined);
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1);

  const [result, genres] = await Promise.all([
    browseTitles({ q, type: typeParam, genre, sort, page, limit: PAGE_SIZE }),
    getGenres(),
  ]);
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  const href = (over: Record<string, string | number | undefined>) => {
    const next: Record<string, string | undefined> = {
      q,
      genre,
      sort: sort === defaultSort ? undefined : sort,
      type: type ? undefined : typeParam,
      page: undefined,
      ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, v === undefined ? undefined : String(v)])),
    };
    const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]).toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-4 py-1.5 text-sm transition-colors ${
      active ? "border-white bg-white font-semibold text-black" : "border-white/12 text-white/65 hover:border-white/30 hover:text-white"
    }`;

  if (page > totalPages) redirect(href({ page: totalPages === 1 ? undefined : totalPages }));

  return (
    <div className="mx-auto max-w-7xl px-5 pb-8 pt-28 sm:px-10">
      <h1 className="text-4xl font-bold tracking-tight">{q ? `Results for “${q}”` : heading}</h1>
      <p className="mb-6 mt-2 text-white/50" aria-live="polite">
        {result.total} {result.total === 1 ? "title" : "titles"}
        {totalPages > 1 && ` · page ${Math.min(page, totalPages)} of ${totalPages}`}
      </p>

      <div className="mb-8 space-y-4">
        {!type && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {TYPES.map((t) => (
              <Link key={t.label} href={href({ type: t.value, page: undefined })} className={chip(typeParam === t.value)}>
                {t.label}
              </Link>
            ))}
          </div>
        )}
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          <Link href={href({ genre: undefined })} className={chip(!genre)}>All genres</Link>
          {genres.map((g) => (
            <Link key={g} href={href({ genre: g })} className={chip(genre === g)}>{g}</Link>
          ))}
        </div>
        {!q && (
          <div className="flex items-center gap-2 text-sm text-white/50">
            <span>Sort by</span>
            {SORTS.map((s) => (
              <Link
                key={s.value}
                href={href({ sort: s.value === defaultSort ? undefined : s.value })}
                className={`rounded-full px-3 py-1 transition-colors ${sort === s.value ? "bg-white/12 text-white" : "hover:text-white"}`}
              >
                {s.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      {result.items.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-lg font-medium">No titles found</p>
          <p className="mt-2 text-white/50">
            {q ? `Nothing matched “${q}”. Check the spelling or try fewer filters.` : "Try a different genre."}
          </p>
          <Link href={basePath} className="glass mt-6 inline-block rounded-full px-6 py-2.5 text-sm font-semibold hover:bg-white/15">
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 justify-items-center gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {result.items.map((t) => (
            <TitleCard key={t.id} title={t} />
          ))}
        </div>
      )}

      <Pagination page={Math.min(page, totalPages)} totalPages={totalPages} hrefFor={(n) => href({ page: n === 1 ? undefined : n })} />
    </div>
  );
}
