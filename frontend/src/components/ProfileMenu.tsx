"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Profile } from "@/lib/client-api";
import { Avatar } from "./ProfilePicker";

/** Navbar profile chip: shows who is watching and opens switch / manage actions. */
export function ProfileMenu({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div ref={box} className="relative ml-1 shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Profile: ${profile.name}`}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-white/10 sm:pr-3"
      >
        <Avatar profile={profile} size="sm" />
        <span className="hidden max-w-24 truncate text-sm text-white/80 sm:block">{profile.name}</span>
        {profile.isKids && <span className="rounded bg-accent px-1 text-[10px] font-bold uppercase text-white">Kids</span>}
      </button>
      {open && (
        <div role="menu" className="glass-menu absolute right-0 top-full z-50 mt-3 w-52 rounded-2xl p-1.5 text-sm">
          <p className="truncate px-3 py-2 text-xs text-white/50">Watching as {profile.name}</p>
          <Link role="menuitem" href="/profiles" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2 hover:bg-white/10">
            Switch profile
          </Link>
          <Link role="menuitem" href="/profiles?manage=1" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2 hover:bg-white/10">
            Manage profiles
          </Link>
        </div>
      )}
    </div>
  );
}
