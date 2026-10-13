"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useUser } from "./useSession";

const Icon = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);

const tabs = [
  { key: "home", href: "/", label: "Home", icon: <Icon><path d="m3 11 9-8 9 8" /><path d="M5 10v10h5v-6h4v6h5V10" /></Icon> },
  { key: "search", href: "", label: "Search", icon: <Icon><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon> },
  { key: "new", href: "/new", label: "New", icon: <Icon><path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" /></Icon> },
  { key: "list", href: "/watchlist", label: "My List", icon: <Icon><path d="M6 3h12v18l-6-4-6 4z" /></Icon> },
  { key: "profile", href: "/profiles", label: "Profile", icon: <Icon><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></Icon> },
];

/** Phone-only bottom navigation. Search opens a bottom sheet so the field sits under the thumb. */
export function MobileTabBar() {
  const pathname = usePathname();
  const user = useUser();
  // The sheet belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const searching = openOn === pathname;
  const setSearching = (v: boolean | ((s: boolean) => boolean)) => setOpenOn((cur) => ((typeof v === "function" ? v(cur === pathname) : v) ? pathname : null));

  return (
    <>
      {searching && <SearchSheet onClose={() => setSearching(false)} />}
      <nav aria-label="Mobile" className="glass fixed inset-x-0 bottom-0 z-50 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {tabs.map((t) => {
            const href = t.key === "list" && !user ? "/login?next=/watchlist" : t.key === "profile" && !user ? "/login" : t.href;
            const active = t.key === "search" ? searching : !searching && (t.href === "/" ? pathname === "/" : pathname.startsWith(t.href));
            const cls = `flex h-16 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${active ? "text-accent" : "text-white/65"}`;
            return (
              <li key={t.key}>
                {t.key === "search" ? (
                  <button type="button" aria-expanded={searching} onClick={() => setSearching((s) => !s)} className={cls}>
                    {t.icon}
                    {t.label}
                  </button>
                ) : (
                  <Link href={href} aria-current={active ? "page" : undefined} className={cls}>
                    {t.icon}
                    {t.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

function SearchSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    input.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-label="Search">
      <button type="button" aria-label="Close search" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const v = q.trim();
          if (v) router.push(`/browse?q=${encodeURIComponent(v)}`);
        }}
        className="glass-menu absolute inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] flex items-center gap-2 rounded-2xl p-2"
      >
        <input
          ref={input}
          type="search"
          enterKeyHint="search"
          aria-label="Search titles"
          placeholder="Search movies and shows…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="min-w-0 flex-1 bg-transparent px-3 py-3 text-base outline-none placeholder:text-white/45"
        />
        <button type="submit" className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black">Search</button>
      </form>
    </div>
  );
}
