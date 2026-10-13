"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/lib/client-api";
import { SearchBox } from "./SearchBox";
import { useUser } from "./useSession";

const baseLinks = [
  { href: "/", label: "Home" },
  { href: "/movies", label: "Movies" },
  { href: "/series", label: "TV Shows" },
  { href: "/new", label: "New" },
  { href: "/browse", label: "Browse" },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useUser();
  const links = user ? [...baseLinks, { href: "/watchlist", label: "My List" }] : baseLinks;

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4">
      <nav
        aria-label="Primary"
        className="glass pointer-events-auto flex max-w-full items-center gap-1 rounded-full py-1.5 pl-5 pr-1.5"
      >
        <Link
          href="/"
          className="mr-3 hidden text-[15px] sm:block font-bold tracking-[0.28em] text-white"
          aria-label="Cineora home"
        >
          CINEORA<span className="text-accent">.</span>
        </Link>
        <ul className="no-scrollbar flex items-center gap-0.5 overflow-x-auto">
          {links.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`block whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-white/12 text-white"
                      : "text-white/60 hover:bg-white/8 hover:text-white"
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <SearchBox />
        {user ? (
          <button
            type="button"
            onClick={async () => {
              await signOut();
              router.push("/");
            }}
            className="ml-1 rounded-full px-4 py-1.5 text-sm text-white/60 transition-colors hover:bg-white/8 hover:text-white"
          >
            Sign out
          </button>
        ) : (
          <Link
            href="/login"
            className="ml-1 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
