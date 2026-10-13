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
  const { source } = await searchParams;
  const title = await getTitle(id);
  if (!title) notFound();

  return (
    <>
      <Link href={`/title/${title.id}`} className="mb-4 inline-block text-sm text-white/60 hover:text-white">
        ← {title.name}
      </Link>
      <Player
        titleId={title.id}
        titleName={title.name}
        sources={title.sources}
        initialSourceId={typeof source === "string" ? source : undefined}
      />
      <h1 className="mt-6 text-2xl font-bold">{title.name}</h1>
      <p className="mt-2 max-w-3xl text-white/65">{title.overview}</p>
    </>
  );
}
