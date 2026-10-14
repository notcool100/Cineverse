"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCollectionCards, getCollectionItems, type CollectionCard } from "@/lib/client-api";
import { toTitle } from "@/lib/title-map";
import type { Title } from "@/lib/types";
import { imageUrl } from "@/lib/image-url";
import { EmptyState } from "./EmptyState";
import { RowSkeleton } from "./Skeleton";
import { TitleCard } from "./TitleCard";
import { useProfile } from "./useProfile";

/** Kids profiles only see collections that are safe by design. */
const KIDS_COLLECTIONS = new Set(["family-night", "feel-good"]);

/** Grid of mood / genre collection cards. */
export function CollectionCards() {
  const profile = useProfile();
  const [cards, setCards] = useState<CollectionCard[] | null>(null);
  useEffect(() => {
    let live = true;
    getCollectionCards().then((c) => live && setCards(c)).catch(() => live && setCards([]));
    return () => {
      live = false;
    };
  }, []);
  if (!cards) return <RowSkeleton count={4} />;
  const shown = profile?.isKids ? cards.filter((c) => KIDS_COLLECTIONS.has(c.key)) : cards;
  if (shown.length === 0) return <EmptyState art="search" title="No collections yet" actions={[{ label: "Browse", href: "/browse", primary: true }]}>Collections appear once the catalog has enough titles.</EmptyState>;
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {shown.map((c) => (
        <li key={c.key}>
          <Link
            href={`/collections/${c.key}`}
            className="on-dark group relative flex h-44 flex-col justify-end overflow-hidden rounded-2xl border border-white/10 p-5 transition hover:-translate-y-1 hover:border-white/30"
            style={{ backgroundImage: `linear-gradient(135deg, ${c.accent[0]}, ${c.accent[1]})` }}
          >
            <div aria-hidden className="absolute -right-4 top-4 flex rotate-6 gap-2 opacity-90 transition group-hover:rotate-3">
              {c.posters.slice(0, 3).map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={imageUrl(p, "w185")} alt="" className="h-28 w-[4.5rem] rounded-lg border border-white/20 object-cover shadow-xl" style={{ marginTop: i * 10 }} />
              ))}
            </div>
            <div className="relative">
              <h2 className="text-xl font-bold drop-shadow">{c.title}</h2>
              <p className="max-w-[60%] text-sm text-white/85 drop-shadow">{c.blurb}</p>
              <p className="mt-1 text-xs text-white/70">{c.total} titles</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** One collection's titles; fetched on the client so a kids profile gets the age-filtered version. */
export function CollectionGrid({ collectionKey }: { collectionKey: string }) {
  const profile = useProfile();
  const kids = !!profile?.isKids;
  const [data, setData] = useState<{ key: string; kids: boolean; meta: { title: string; blurb: string }; items: Title[]; total: number } | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true;
    getCollectionItems(collectionKey, kids)
      .then((r) => live && setData({ key: collectionKey, kids, meta: r.collection, items: r.items.map(toTitle), total: r.total }))
      .catch(() => live && setMissing(true));
    return () => {
      live = false;
    };
  }, [collectionKey, kids]);

  if (missing) return <EmptyState art="search" title="Collection not found" actions={[{ label: "All collections", href: "/collections", primary: true }]}>That collection doesn&apos;t exist.</EmptyState>;
  const ready = data && data.key === collectionKey && data.kids === kids ? data : null;
  return (
    <>
      <h1 className="text-4xl font-bold tracking-tight">{ready?.meta.title ?? " "}</h1>
      <p className="mb-8 mt-2 text-white/55">{ready ? `${ready.meta.blurb} · ${ready.total} titles` : " "}</p>
      {!ready && <RowSkeleton count={5} />}
      {ready && ready.items.length === 0 && <EmptyState art="search" title="Nothing here yet" actions={[{ label: "All collections", href: "/collections", primary: true }]}>No titles match this collection right now.</EmptyState>}
      {ready && ready.items.length > 0 && (
        <div className="grid grid-cols-2 justify-items-center gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {ready.items.map((t) => (
            <TitleCard key={t.id} title={t} />
          ))}
        </div>
      )}
    </>
  );
}

/** Quick-jump chips to the mood collections, shown on the home page. */
export function MoodChips({ cards }: { cards: { key: string; title: string }[] }) {
  if (cards.length === 0) return null;
  return (
    <nav aria-label="Browse by mood" className="mx-auto flex max-w-[96rem] flex-wrap items-center gap-2 px-5 sm:px-10">
      <span className="mr-1 text-sm text-white/50">Mood</span>
      {cards.map((c) => (
        <Link key={c.key} href={`/collections/${c.key}`} className="glass-soft rounded-full px-4 py-1.5 text-sm text-white/80 transition hover:text-white">
          {c.title}
        </Link>
      ))}
    </nav>
  );
}
