import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTitle } from "@/lib/catalog";
import { Player } from "@/components/Player";

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
  const { source, season: s, episode: e } = await searchParams;
  const title = await getTitle(id);
  if (!title) notFound();

  const series = title.type === "SERIES";
  const eps = title.episodes ?? [];
  const num = (v: unknown) => (typeof v === "string" && /^\d{1,4}$/.test(v) ? Number(v) : undefined);
  const season = series ? (num(s) ?? eps[0]?.season ?? 1) : undefined;
  const episode = series ? (num(e) ?? eps.find((x) => x.season === season)?.number ?? 1) : undefined;
  const seasons = [...new Set(eps.map((x) => x.season))];
  const href = (se: number, ep: number) => `/watch/${title.id}?season=${se}&episode=${ep}${typeof source === "string" ? `&source=${encodeURIComponent(source)}` : ""}`;

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
        key={`${season}-${episode}`}
      />
      {series && eps.length > 0 && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-white/70">Season {season} · Episode {episode}</p>
          <div className="flex flex-wrap gap-2">
            {seasons.map((se) => (
              <Link key={se} href={href(se, 1)} className={`rounded-full px-3 py-1 text-xs ${se === season ? "bg-white text-black" : "bg-white/10 text-white/70 hover:bg-white/20"}`}>
                S{se}
              </Link>
            ))}
          </div>
          <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {eps.filter((x) => x.season === season).map((x) => (
              <Link key={x.number} href={href(x.season, x.number)} className={`rounded-md px-2.5 py-1 text-xs ${x.number === episode ? "bg-white text-black" : "bg-white/10 text-white/70 hover:bg-white/20"}`}>
                {x.number}
              </Link>
            ))}
          </div>
        </div>
      )}
      <h1 className="mt-6 text-2xl font-bold">{title.name}</h1>
      <p className="mt-2 max-w-3xl text-white/65">{title.overview}</p>
    </>
  );
}
