import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTitle } from "@/lib/catalog";
import { Player } from "@/components/Player";
import { EpisodeBrowser } from "@/components/EpisodeBrowser";

export const metadata: Metadata = { title: "Watch" };

export default function WatchPage(props: PageProps<"/watch/[id]">) {
  return (
    <div className="mx-auto max-w-6xl px-5 pb-8 pt-28 sm:px-10">
      <Suspense fallback={<div className="aspect-video animate-pulse rounded-2xl bg-white/5" />}>
        <WatchContent params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function WatchContent({
  params,
  searchParams,
}: {
  params: PageProps<"/watch/[id]">["params"];
  searchParams: PageProps<"/watch/[id]">["searchParams"];
}) {
  const { id } = await params;
  const { source, season: s, episode: e, party: partyParam, nav } = await searchParams;
  const title = await getTitle(id);
  if (!title) notFound();

  const series = title.type === "SERIES";
  const eps = title.episodes ?? [];
  const num = (v: unknown) => (typeof v === "string" && /^\d{1,4}$/.test(v) ? Number(v) : undefined);
  const season = series ? (num(s) ?? eps[0]?.season ?? 1) : undefined;
  const episode = series ? (num(e) ?? eps.find((x) => x.season === season)?.number ?? 1) : undefined;
  const partyCode = typeof partyParam === "string" && /^[A-Za-z0-9]{4,12}$/.test(partyParam) ? partyParam.toUpperCase() : undefined;
  // Links inside a party carry the room, and mark themselves as deliberate navigation so the room follows.
  const partySuffix = partyCode ? `&party=${partyCode}&nav=1` : "";
  const href = (se: number, ep: number) => `/watch/${title.id}?season=${se}&episode=${ep}${typeof source === "string" ? `&source=${encodeURIComponent(source)}` : ""}${partySuffix}`;

  const ordered = [...eps].sort((a, b) => a.season - b.season || a.number - b.number);
  const at = ordered.findIndex((x) => x.season === season && x.number === episode);
  const nx = at >= 0 ? ordered[at + 1] : undefined;
  const nextHref = nx ? href(nx.season, nx.number) : undefined;
  const cur = at >= 0 ? ordered[at] : undefined;

  return (
    <>
      <Link href={`/title/${title.id}`} className="mb-4 inline-block text-sm text-white/60 hover:text-white">
        ← {title.name}
      </Link>
      <Player
        titleId={title.id}
        titleName={title.name}
        titleType={title.type}
        sources={title.sources}
        initialSourceId={typeof source === "string" ? source : undefined}
        season={season}
        episode={episode}
        nextHref={nextHref}
        party={partyCode ? { code: partyCode, nav: nav === "1" } : undefined}
        markers={cur && { introStart: cur.introStartSec, introEnd: cur.introEndSec, creditsStart: cur.creditsStartSec }}
        key={`${season}-${episode}`}
      />
      {series && eps.length > 0 && (
        <EpisodeBrowser
          titleId={title.id}
          episodes={eps}
          current={{ season: season!, number: episode! }}
          linkSuffix={`${typeof source === "string" ? `&source=${encodeURIComponent(source)}` : ""}${partySuffix}`}
        />
      )}
      <h1 className="mt-6 text-2xl font-bold">{title.name}</h1>
      <p className="mt-2 max-w-3xl text-white/65">{title.overview}</p>
    </>
  );
}
