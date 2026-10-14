import Link from "next/link";
import { redirect } from "next/navigation";
import { browseTitles, getGenres, getLanguages, getRatings, type BrowseQuery } from "@/lib/catalog";
import type { TitleType } from "@/lib/types";
import { EmptyState } from "./EmptyState";
import { Pagination } from "./Pagination";
import { TitleCard } from "./TitleCard";

type Params = Record<string, string | string[] | undefined>;
const PAGE_SIZE = 20;
const SORTS = [
  { value: "newest", label: "Recently added" },
  { value: "year", label: "Release year" },
  { value: "name", label: "A–Z" },
] as const;
/** Release-year buckets; `from`/`to` are inclusive years. */
const DECADES = [
  { value: "2020", label: "2020s", from: 2020, to: 2100 },
  { value: "2010", label: "2010s", from: 2010, to: 2019 },
  { value: "2000", label: "2000s", from: 2000, to: 2009 },
  { value: "1990", label: "1990s", from: 1990, to: 1999 },
  { value: "older", label: "Before 1990", from: 1888, to: 1989 },
] as const;
const TYPES: { value: TitleType | undefined; label: string; path: string }[] = [
  { value: undefined, label: "All", path: "/browse" },
  { value: "MOVIE", label: "Movies", path: "/movies" },
  { value: "SERIES", label: "TV Shows", path: "/series" },
];

const langName = (code: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Filterable, paginated grid shared by /browse, /movies, /series and /new. State lives in the URL. */
export async function BrowseView({
  basePath,
  heading,
  type,
  defaultSort = "newest",
  tabs,
  searchParams,
}: {
  basePath: string;
  heading: string;
  type?: TitleType;
  defaultSort?: BrowseQuery["sort"];
  /** Rendered under the heading (e.g. the New / Coming soon tabs). */
  tabs?: React.ReactNode;
  searchParams: Promise<Params>;
}) {
  const sp = await searchParams;
  const q = one(sp.q)?.trim().slice(0, 100) || undefined;
  const genre = one(sp.genre) || undefined;
  const language = /^[a-z]{2,3}$/.test(one(sp.language) ?? "") ? one(sp.language) : undefined;
  const decade = DECADES.find((d) => d.value === one(sp.decade));
  const rating = /^[\w+\- ]{1,12}$/.test(one(sp.rating) ?? "") ? one(sp.rating) : undefined;
  const sortParam = one(sp.sort);
  const sort = SORTS.find((s) => s.value === sortParam)?.value ?? defaultSort;
  const typeParam = type ?? (one(sp.type) === "MOVIE" || one(sp.type) === "SERIES" ? (one(sp.type) as TitleType) : undefined);
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1);

  const [result, genres, languages, ratings] = await Promise.all([
    browseTitles({ q, type: typeParam, genre, language, yearFrom: decade?.from, yearTo: decade?.to, rating, sort, page, limit: PAGE_SIZE }),
    getGenres(),
    getLanguages(),
    getRatings(),
  ]);
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  const href = (over: Record<string, string | number | undefined>) => {
    const next: Record<string, string | undefined> = {
      q,
      genre,
      language,
      decade: decade?.value,
      rating,
      sort: sort === defaultSort ? undefined : sort,
      type: type ? undefined : typeParam,
      page: undefined,
      ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, v === undefined ? undefined : String(v)])),
    };
    const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]).toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  if (page > totalPages) redirect(href({ page: totalPages === 1 ? undefined : totalPages }));

  return (
    <div className="mx-auto max-w-[96rem] px-5 pb-8 pt-28 sm:px-10">
      <h1 className="text-4xl font-bold tracking-tight">{q ? `Results for “${q}”` : heading}</h1>
      <p className="mb-6 mt-2 text-white/50" aria-live="polite">
        {result.total} {result.total === 1 ? "title" : "titles"}
        {totalPages > 1 && ` · page ${Math.min(page, totalPages)} of ${totalPages}`}
      </p>
      {tabs}

      <div className="flex flex-col gap-8 lg:flex-row">
        <aside className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:w-60 lg:shrink-0 lg:self-start lg:overflow-y-auto">
          <details open className="group glass-soft rounded-2xl p-4 lg:[&>summary]:pointer-events-none">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold uppercase tracking-wider text-white/70">
              Filters
              <span className="text-white/40 transition-transform group-open:rotate-180 lg:hidden">▾</span>
            </summary>
            <div className="mt-4 space-y-6">
              {!type && (
                <FilterGroup title="Type">
                  {TYPES.map((t) => (
                    <Option key={t.label} href={href({ type: t.value, page: undefined })} active={typeParam === t.value}>{t.label}</Option>
                  ))}
                </FilterGroup>
              )}
              {languages.length > 0 && (
                <FilterGroup title="Language">
                  <Option href={href({ language: undefined })} active={!language}>All languages</Option>
                  {languages.map((l) => (
                    <Option key={l} href={href({ language: l })} active={language === l}>{langName(l)}</Option>
                  ))}
                </FilterGroup>
              )}
              <FilterGroup title="Release year">
                <Option href={href({ decade: undefined })} active={!decade}>Any year</Option>
                {DECADES.map((d) => (
                  <Option key={d.value} href={href({ decade: d.value })} active={decade?.value === d.value}>{d.label}</Option>
                ))}
              </FilterGroup>
              {ratings.length > 0 && (
                <FilterGroup title="Rating">
                  <Option href={href({ rating: undefined })} active={!rating}>Any rating</Option>
                  {ratings.map((r) => (
                    <Option key={r} href={href({ rating: r })} active={rating === r}>{r}</Option>
                  ))}
                </FilterGroup>
              )}
              <FilterGroup title="Genre">
                <Option href={href({ genre: undefined })} active={!genre}>All genres</Option>
                {genres.map((g) => (
                  <Option key={g} href={href({ genre: g })} active={genre === g}>{g}</Option>
                ))}
              </FilterGroup>
              {!q && (
                <FilterGroup title="Sort by">
                  {SORTS.map((s) => (
                    <Option key={s.value} href={href({ sort: s.value === defaultSort ? undefined : s.value })} active={sort === s.value}>{s.label}</Option>
                  ))}
                </FilterGroup>
              )}
              {(genre || language || decade || rating || (!type && typeParam)) && (
                <Link href={href({ genre: undefined, language: undefined, decade: undefined, rating: undefined, type: undefined })} className="block text-center text-sm text-white/55 underline hover:text-white">Clear filters</Link>
              )}
            </div>
          </details>
        </aside>

        <div className="min-w-0 flex-1">
      {result.items.length === 0 ? (
        <EmptyState
          art="search"
          title="No titles found"
          actions={[{ label: "Clear filters", href: basePath, primary: true }, { label: "Browse trending", href: "/new" }]}
        >
          {q ? `Nothing matched “${q}”. Check the spelling or try fewer filters.` : "Nothing here with those filters. Try a different genre."}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 justify-items-center gap-5 sm:grid-cols-3 xl:grid-cols-4">
          {result.items.map((t) => (
            <TitleCard key={t.id} title={t} />
          ))}
        </div>
      )}

        </div>
      </div>

      <Pagination page={Math.min(page, totalPages)} totalPages={totalPages} hrefFor={(n) => href({ page: n === 1 ? undefined : n })} />
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">{title}</h2>
      <ul className="max-h-64 space-y-0.5 overflow-y-auto pr-1 [scrollbar-width:thin]">{children}</ul>
    </section>
  );
}

function Option({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "true" : undefined}
        className={`block rounded-lg px-3 py-1.5 text-sm transition-colors ${active ? "bg-white font-semibold text-black" : "text-white/65 hover:bg-white/8 hover:text-white"}`}
      >
        {children}
      </Link>
    </li>
  );
}
