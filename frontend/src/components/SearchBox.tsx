"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { imageUrl } from "@/lib/image-url";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface Hit {
  slug: string;
  name: string;
  year: number | null;
  type: "MOVIE" | "SERIES";
  posterPath: string | null;
}

/** Expanding search field with live suggestions; Enter goes to the full results page. */
export function SearchBox() {
  const router = useRouter();
  const params = useSearchParams();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(-1);
  const q = value.trim();

  useEffect(() => {
    if (q.length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/search?q=${encodeURIComponent(q)}&limit=6`, { signal: ctl.signal });
        if (res.ok) {
          setHits((await res.json()).items);
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

  const submit = () => {
    if (!q) return;
    setOpen(false);
    router.push(`/browse?q=${encodeURIComponent(q)}`);
  };
  const shown = q.length >= 2 ? hits : [];

  return (
    <div ref={box} className="relative ml-1 flex items-center">
      <div className={`flex items-center rounded-full transition-all ${open ? "bg-white/10 pr-3" : ""}`}>
        <button
          type="button"
          aria-label={open ? "Search" : "Open search"}
          onClick={() => {
            if (open && q) return submit();
            setValue(params.get("q") ?? "");
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
          aria-expanded={open && shown.length > 0}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-label="Search titles"
          autoComplete="off"
          placeholder="Search titles…"
          value={value}
          tabIndex={open ? 0 : -1}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, shown.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, -1));
            } else if (e.key === "Enter") {
              if (active >= 0 && shown[active]) {
                setOpen(false);
                router.push(`/title/${shown[active].slug}`);
              } else submit();
            }
          }}
          className={`bg-transparent text-sm text-white outline-none placeholder:text-white/40 transition-all duration-300 ${
            open ? "w-36 sm:w-60" : "w-0"
          }`}
        />
      </div>
      {open && shown.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="glass absolute right-0 top-full mt-3 w-72 overflow-hidden rounded-2xl p-1.5 sm:w-80"
        >
          {shown.map((h, i) => (
            <li key={h.slug} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <Link
                href={`/title/${h.slug}`}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-xl p-2 text-sm ${i === active ? "bg-white/12" : "hover:bg-white/8"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {h.posterPath && <img src={imageUrl(h.posterPath, "w500")} alt="" className="h-12 w-8 rounded object-cover" />}
                <span className="min-w-0">
                  <span className="block truncate font-medium">{h.name}</span>
                  <span className="text-xs text-white/50">
                    {h.type === "MOVIE" ? "Movie" : "TV Show"}
                    {h.year ? ` · ${h.year}` : ""}
                  </span>
                </span>
              </Link>
            </li>
          ))}
          <li role="presentation">
            <button type="button" onClick={submit} className="w-full rounded-xl p-2 text-left text-xs text-white/60 hover:bg-white/8 hover:text-white">
              See all results for “{q}”
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
