"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createList, getLists, setListItem, type ListSummary } from "@/lib/client-api";
import { useUser } from "./useSession";

/** "Add to list" popover: tick the custom lists that should hold this title, or start a new one. */
export function AddToList({ titleId }: { titleId: string }) {
  const user = useUser();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<ListSummary[] | null>(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();

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

  function toggleOpen() {
    if (!user) return router.push(`/login?next=${encodeURIComponent(`/title/${titleId}`)}`);
    const next = !open;
    setOpen(next);
    if (next) {
      setErr(null);
      getLists(titleId).then(setLists).catch(() => setErr("Couldn't load your lists"));
    }
  }

  async function toggle(l: ListSummary) {
    const on = !l.hasTitle;
    setLists((ls) => ls && ls.map((x) => (x.id === l.id ? { ...x, hasTitle: on, count: x.count + (on ? 1 : -1) } : x)));
    try {
      await setListItem(l.id, titleId, on);
    } catch (e) {
      setLists((ls) => ls && ls.map((x) => (x.id === l.id ? { ...x, hasTitle: !on, count: x.count + (on ? -1 : 1) } : x)));
      setErr(e instanceof Error ? e.message : "Couldn't update the list");
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setErr(null);
    try {
      const l = await createList(name);
      await setListItem(l.id, titleId, true);
      setLists((ls) => [{ ...l, count: 1, hasTitle: true }, ...(ls ?? [])]);
      setName("");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Couldn't create the list");
    }
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-controls={id}
        aria-label="Add to a list"
        title="Add to a list"
        className="grid size-12 place-items-center rounded-full bg-white/20 backdrop-blur-md transition hover:bg-white/30"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 6h12M4 12h8M4 18h8M17 14v6M14 17h6" />
        </svg>
      </button>
      {open && (
        <div id={id} role="dialog" aria-label="Add to list" className="on-dark glass-menu absolute left-0 top-full z-30 mt-2 w-64 rounded-2xl p-2 text-sm">
          {!lists && !err && <p className="px-2 py-3 text-white/50">Loading…</p>}
          {lists?.length === 0 && <p className="px-2 py-2 text-white/50">No lists yet. Create your first below.</p>}
          <ul className="max-h-56 overflow-y-auto">
            {lists?.map((l) => (
              <li key={l.id}>
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-white/8">
                  <span className="min-w-0 truncate">{l.name} <span className="text-xs text-white/40">{l.count}</span></span>
                  <input type="checkbox" checked={!!l.hasTitle} onChange={() => toggle(l)} className="size-4 accent-[var(--accent)]" />
                </label>
              </li>
            ))}
          </ul>
          <form onSubmit={create} className="mt-1 flex gap-2 border-t border-white/10 p-1 pt-2">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="New list name" aria-label="New list name" className="w-full rounded-lg border border-white/10 bg-white/8 px-2 py-1.5 text-sm text-white outline-none focus:border-accent" />
            <button disabled={!name.trim()} className="rounded-full bg-white px-3 text-sm font-semibold text-black disabled:opacity-40">Add</button>
          </form>
          {err && <p role="alert" className="px-2 pt-1 text-xs text-red-300">{err}</p>}
        </div>
      )}
    </div>
  );
}
