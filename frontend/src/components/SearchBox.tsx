"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { imageUrl } from "@/lib/image-url";
import { loadRecent, pushRecent, saveRecent } from "@/lib/recent-searches";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface Hit {
  slug: string;
  name: string;
  year: number | null;
  type: "MOVIE" | "SERIES";
  posterPath: string | null;
}
interface Suggest {
  titles: Hit[];
  people: { name: string; titles: number }[];
  genres: string[];
}
const EMPTY: Suggest = { titles: [], people: [], genres: [] };

/** One keyboard-navigable row in the dropdown. */
type Item =
  | { kind: "recent"; q: string }
  | { kind: "title"; hit: Hit }
  | { kind: "person"; name: string; titles: number }
  | { kind: "genre"; name: string };

const itemHref = (it: Item) =>
  it.kind === "title" ? `/title/${it.hit.slug}` : it.kind === "genre" ? `/browse?genre=${encodeURIComponent(it.name)}` : `/browse?q=${encodeURIComponent(it.kind === "recent" ? it.q : it.name)}`;

/** Expanding search field: live suggestions (titles, people, genres), recent searches, Enter for full results. */
export function SearchBox() {
  const router = useRouter();
  const params = useSearchParams();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [found, setFound] = useState<{ q: string; data: Suggest }>({ q: "", data: EMPTY });
  const [recent, setRecent] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const q = value.trim();

  useEffect(() => {
    if (q.length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/search/suggest?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        if (res.ok) {
          setFound({ q, data: (await res.json()) as Suggest });
          setActive(-1);
        }
      } catch {}
    }, 200);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const remember = (text: string) => {
    const next = pushRecent(loadRecent(), text);
    saveRecent(next);
    setRecent(next);
  };
  const forget = (text?: string) => {
    const next = text ? loadRecent().filter((x) => x !== text) : [];
    saveRecent(next);
    setRecent(next);
  };
  const submit = (text = q) => {
    if (!text) return;
    remember(text);
    setOpen(false);
    router.push(`/browse?q=${encodeURIComponent(text)}`);
  };
  const choose = (it: Item) => {
    setOpen(false);
    if (it.kind === "recent") return submit(it.q);
    remember(it.kind === "title" ? it.hit.name : it.kind === "person" ? it.name : it.name);
    router.push(itemHref(it));
  };

  // Suggestions only count for the query they were fetched for.
  const data = q.length >= 2 && found.q === q ? found.data : EMPTY;
  const items: Item[] =
    q.length >= 2
      ? [
          ...data.titles.map((hit): Item => ({ kind: "title", hit })),
          ...data.people.map((p): Item => ({ kind: "person", ...p })),
          ...data.genres.map((name): Item => ({ kind: "genre", name })),
        ]
      : recent.map((r): Item => ({ kind: "recent", q: r }));

  return (
    <div ref={box} className="relative ml-1 flex items-center">
      <div className={`flex items-center rounded-full transition-all ${open ? "bg-white/10 pr-3" : ""}`}>
        <button
          type="button"
          aria-label={open ? "Search" : "Open search"}
          onClick={() => {
            if (open && q) return submit();
            setValue(params.get("q") ?? "");
            setRecent(loadRecent());
            setOpen(true);
            requestAnimationFrame(() => input.current?.focus());
          }}
          className="grid size-9 shrink-0 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </button>
        <input
          ref={input}
          role="combobox"
          aria-expanded={open && items.length > 0}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-label="Search titles, people and genres"
          autoComplete="off"
          placeholder="Titles, people, genres…"
          value={value}
          tabIndex={open ? 0 : -1}
          onFocus={() => setRecent(loadRecent())}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, -1));
            } else if (e.key === "Enter") {
              if (active >= 0 && items[active]) choose(items[active]);
              else submit();
            }
          }}
          className={`bg-transparent text-sm text-white outline-none placeholder:text-white/40 transition-all duration-300 ${
            open ? "w-36 sm:w-60" : "w-0"
          }`}
        />
      </div>
      {open && items.length > 0 && (
        <ul id={listId} role="listbox" className="glass-menu absolute right-0 top-full mt-3 max-h-[70vh] w-72 overflow-y-auto rounded-2xl p-1.5 sm:w-80">
          {q.length < 2 && (
            <li role="presentation" className="flex items-center justify-between px-2.5 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wider text-white/45">
              Recent searches
              <button type="button" onClick={() => forget()} className="font-normal normal-case tracking-normal text-white/55 underline hover:text-white">Clear</button>
            </li>
          )}
          {items.map((it, i) => {
            const prev = items[i - 1];
            const heading = q.length >= 2 && it.kind !== prev?.kind ? (it.kind === "title" ? "Titles" : it.kind === "person" ? "People" : "Genres") : null;
            return (
              <li key={`${it.kind}-${i}`} role="presentation">
                {heading && <p className="px-2.5 pb-0.5 pt-2 text-xs font-semibold uppercase tracking-wider text-white/45">{heading}</p>}
                <div id={`${listId}-${i}`} role="option" aria-selected={i === active} className={`group flex items-center rounded-xl ${i === active ? "bg-white/12" : "hover:bg-white/8"}`}>
                  <Link href={itemHref(it)} onClick={(e) => { e.preventDefault(); choose(it); }} className="flex min-w-0 flex-1 items-center gap-3 p-2 text-sm">
                    {it.kind === "title" && (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {it.hit.posterPath && <img src={imageUrl(it.hit.posterPath, "w500")} alt="" className="h-12 w-8 rounded object-cover" />}
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{it.hit.name}</span>
                          <span className="text-xs text-white/50">{it.hit.type === "MOVIE" ? "Movie" : "TV Show"}{it.hit.year ? ` · ${it.hit.year}` : ""}</span>
                        </span>
                      </>
                    )}
                    {it.kind === "person" && (
                      <>
                        <Glyph d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9c1-4 4-6 8-6s7 2 8 6" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{it.name}</span>
                          <span className="text-xs text-white/50">{it.titles} {it.titles === 1 ? "title" : "titles"}</span>
                        </span>
                      </>
                    )}
                    {it.kind === "genre" && (
                      <>
                        <Glyph d="M4 7h16M4 12h16M4 17h10" />
                        <span className="font-medium">{it.name}</span>
                      </>
                    )}
                    {it.kind === "recent" && (
                      <>
                        <Glyph d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2" />
                        <span className="truncate">{it.q}</span>
                      </>
                    )}
                  </Link>
                  {it.kind === "recent" && (
                    <button type="button" aria-label={`Remove ${it.q} from recent searches`} onClick={() => forget(it.q)} className="mr-1 grid size-7 place-items-center rounded-full text-white/45 hover:bg-white/10 hover:text-white">
                      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
                    </button>
                  )}
                </div>
              </li>
            );
          })}
          {q.length >= 2 && (
            <li role="presentation">
              <button type="button" onClick={() => submit()} className="w-full rounded-xl p-2 text-left text-xs text-white/60 hover:bg-white/8 hover:text-white">
                See all results for “{q}”
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function Glyph({ d }: { d: string }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/8 text-white/70">
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={d} />
      </svg>
    </span>
  );
}
