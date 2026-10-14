"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createList, deleteList, getList, getLists, renameList, setListItem, type ListSummary } from "@/lib/client-api";
import { imageUrl } from "@/lib/image-url";
import { toTitle } from "@/lib/title-map";
import type { Title } from "@/lib/types";
import { EmptyState } from "./EmptyState";
import { RowSkeleton } from "./Skeleton";
import { TitleCard } from "./TitleCard";
import { useUser } from "./useSession";

const field = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-accent";
const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

function SignIn({ next }: { next: string }) {
  return (
    <p className="text-white/60">
      <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-accent underline">Sign in</Link> to use your lists.
    </p>
  );
}

/** All custom lists of the active profile, with create, rename and delete. */
export function ListsOverview() {
  const user = useUser();
  const [lists, setLists] = useState<ListSummary[] | null>(null);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const load = useCallback(() => getLists().then(setLists).catch((e) => (setLists([]), setMsg(errText(e)))), []);
  useEffect(() => {
    if (user) void load();
  }, [user, load]);
  if (!user) return <SignIn next="/lists" />;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await createList(name);
      setName("");
      await load();
    } catch (err) {
      setMsg(errText(err));
    }
  }
  async function rename(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      await renameList(editing.id, editing.name);
      setEditing(null);
      await load();
    } catch (err) {
      setMsg(errText(err));
    }
  }
  async function remove(l: ListSummary) {
    if (!confirm(`Delete “${l.name}”? The titles stay in the catalog.`)) return;
    await deleteList(l.id).catch((e) => setMsg(errText(e)));
    await load();
  }

  return (
    <div className="space-y-8">
      <form onSubmit={create} className="glass flex flex-wrap gap-2 rounded-2xl p-4">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="New list, e.g. Weekend picks" aria-label="New list name" className={`${field} min-w-48 flex-1`} />
        <button disabled={!name.trim()} className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black disabled:opacity-40">Create list</button>
      </form>
      {msg && <p role="alert" className="text-sm text-red-300">{msg}</p>}
      {!lists && <RowSkeleton count={4} />}
      {lists?.length === 0 && <EmptyState art="search" title="No lists yet" actions={[{ label: "Browse titles", href: "/browse", primary: true }]}>Create a list above, then add titles from any title page.</EmptyState>}
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {lists?.map((l) => (
          <li key={l.id} className="glass-soft overflow-hidden rounded-2xl">
            <Link href={`/lists/${l.id}`} className="block">
              <div className="flex h-36 gap-1 bg-white/5 p-2">
                {l.posters.length === 0 && <span className="grid flex-1 place-items-center text-sm text-white/35">Empty</span>}
                {l.posters.map((p, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={imageUrl(p, "w185")} alt="" className="h-full min-w-0 flex-1 rounded-lg object-cover" />
                ))}
              </div>
            </Link>
            <div className="flex items-center justify-between gap-2 p-3">
              {editing?.id === l.id ? (
                <form onSubmit={rename} className="flex w-full gap-2">
                  <input autoFocus value={editing.name} onChange={(e) => setEditing({ id: l.id, name: e.target.value })} maxLength={40} aria-label="List name" className={field} />
                  <button className="rounded-full bg-white px-3 text-sm font-semibold text-black">Save</button>
                </form>
              ) : (
                <>
                  <Link href={`/lists/${l.id}`} className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{l.name}</p>
                    <p className="text-xs text-white/50">{l.count} {l.count === 1 ? "title" : "titles"}</p>
                  </Link>
                  <button onClick={() => setEditing({ id: l.id, name: l.name })} aria-label={`Rename ${l.name}`} className="rounded-full px-2.5 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white">Rename</button>
                  <button onClick={() => remove(l)} aria-label={`Delete ${l.name}`} className="rounded-full px-2.5 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white">Delete</button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One list's titles, each removable. */
export function ListDetail({ listId }: { listId: string }) {
  const user = useUser();
  const [list, setList] = useState<{ id: string; name: string; items: Title[] } | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!user) return;
    let live = true;
    getList(listId)
      .then((l) => live && setList({ id: l.id, name: l.name, items: l.items.map(toTitle) }))
      .catch(() => live && setMissing(true));
    return () => {
      live = false;
    };
  }, [user, listId]);
  if (!user) return <SignIn next={`/lists/${listId}`} />;
  if (missing) return <EmptyState art="search" title="List not found" actions={[{ label: "My lists", href: "/lists", primary: true }]}>It may belong to another profile or have been deleted.</EmptyState>;
  if (!list) return <RowSkeleton count={5} />;

  const remove = (t: Title) => {
    setList((l) => l && { ...l, items: l.items.filter((x) => x.id !== t.id) });
    setListItem(listId, t.id, false).catch(() => getList(listId).then((l) => setList({ id: l.id, name: l.name, items: l.items.map(toTitle) })));
  };
  return (
    <>
      <h1 className="text-4xl font-bold tracking-tight">{list.name}</h1>
      <p className="mb-8 mt-2 text-white/55">{list.items.length} {list.items.length === 1 ? "title" : "titles"}</p>
      {list.items.length === 0 ? (
        <EmptyState art="search" title="This list is empty" actions={[{ label: "Browse titles", href: "/browse", primary: true }]}>Open a title and use the list button to add it here.</EmptyState>
      ) : (
        <div className="grid grid-cols-2 justify-items-center gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {list.items.map((t) => (
            <TitleCard key={t.id} title={t} onRemove={remove} removeLabel="Remove from this list" />
          ))}
        </div>
      )}
    </>
  );
}
