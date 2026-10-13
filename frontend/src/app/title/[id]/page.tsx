import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRelated, getTitle, getTitles } from "@/lib/catalog";
import { TitleActions } from "@/components/TitleActions";
import { BackdropImage, posterStyle } from "@/components/Poster";
import { TitleRow } from "@/components/TitleRow";

export async function generateStaticParams() {
  return (await getTitles()).map((t) => ({ id: t.id }));
}

export async function generateMetadata(props: PageProps<"/title/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const title = await getTitle(id);
  return { title: title?.name ?? "Not found" };
}

export default function TitlePage(props: PageProps<"/title/[id]">) {
  // params are URL data: resolve them inside Suspense so the App Shell can render instantly.
  return (
    <Suspense fallback={<TitleSkeleton />}>
      <TitleContent params={props.params} />
    </Suspense>
  );
}

function TitleSkeleton() {
  return (
    <section aria-busy className="flex min-h-[92vh] items-end">
      <div className="mx-auto w-full max-w-7xl px-5 pb-24 pt-40 sm:px-10">
        <div className="max-w-xl animate-pulse space-y-5">
          <div className="h-3 w-20 rounded bg-white/10" />
          <div className="h-16 w-4/5 rounded-xl bg-white/10" />
          <div className="h-4 w-2/3 rounded bg-white/10" />
          <div className="h-20 rounded bg-white/5" />
          <div className="h-12 w-48 rounded-md bg-white/10" />
        </div>
      </div>
    </section>
  );
}

async function TitleContent({ params }: { params: PageProps<"/title/[id]">["params"] }) {
  const { id } = await params;
  const title = await getTitle(id);
  if (!title) notFound();
  const related = await getRelated(id);

  return (
    <article>
      <section className="relative isolate flex min-h-[92vh] items-end overflow-hidden">
        <div className="absolute inset-0 -z-10" style={posterStyle(title)} />
        {/* Artwork hugs the right edge; the left fades out so text stays legible */}
        <div className="absolute inset-y-0 right-0 -z-10 w-full lg:w-[78%]">
          <BackdropImage title={title} priority />
        </div>
        <div className="grain absolute inset-0 -z-10" aria-hidden />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-background from-24% via-background/55 via-45% to-transparent" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-background from-3% via-background/25 via-35% to-black/10" />

        <div className="mx-auto w-full max-w-7xl px-5 pb-24 pt-40 sm:px-10">
          <div className="max-w-xl">
            <p className="rise mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
              <span className="text-lg font-black leading-none text-accent">C</span>
              {title.type === "MOVIE" ? "Film" : "Series"}
            </p>
            <h1 className="rise rise-2 text-5xl font-extrabold leading-[0.98] tracking-tight drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)] sm:text-6xl lg:text-7xl">
              {title.name}
            </h1>
            <p className="rise rise-3 mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/70">
              <span className="rounded border border-white/40 px-1.5 py-px text-xs font-medium">
                {title.rating}
              </span>
              <span>{title.year}</span>
              <span>{title.runtimeMin} min</span>
              <span className="text-white/45">{title.genres.join(" · ")}</span>
            </p>
            <p className="rise rise-3 mt-5 text-base leading-relaxed text-white/85 sm:text-lg">
              {title.overview}
            </p>

            <TitleActions titleId={title.id} sources={title.sources} />
          </div>
        </div>
      </section>

      <div className="-mt-10 space-y-10 pb-6">
        <TitleRow heading="More like this" titles={related} />
        <p className="px-5 text-center text-[11px] text-white/30 sm:px-10">
          {title.posterCredit} · {title.backdropCredit}
        </p>
      </div>
    </article>
  );
}
