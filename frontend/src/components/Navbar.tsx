"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/lib/client-api";
import { useUser } from "./useSession";

const baseLinks = [
  { href: "/", label: "Home" },
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
        className="glass pointer-events-auto flex items-center gap-1 rounded-full py-1.5 pl-5 pr-1.5"
      >
        <Link
          href="/"
          className="mr-3 text-[15px] font-bold tracking-[0.28em] text-white"
          aria-label="Cineora home"
        >
          CINEORA<span className="text-accent">.</span>
        </Link>
        <ul className="flex items-center gap-0.5">
          {links.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-full px-4 py-1.5 text-sm transition-colors ${
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
        <Link
          href="/browse"
          aria-label="Search"
          className="ml-1 grid size-9 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </Link>
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
