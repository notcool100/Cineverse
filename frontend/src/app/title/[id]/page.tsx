import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRelated, getTitle, getTitles } from "@/lib/catalog";
import { TitleActions } from "@/components/TitleActions";
import { BackdropImage, posterStyle } from "@/components/Poster";
import { ViewBeacon } from "@/components/ViewBeacon";
import { EpisodeBrowser } from "@/components/EpisodeBrowser";
import { CastCrew } from "@/components/CastCrew";
import { TitleCard } from "@/components/TitleCard";
import { HeroSkeleton, RowSkeleton } from "@/components/Skeleton";

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
    <>
      <HeroSkeleton />
      <RowSkeleton />
    </>
  );
}

const runtime = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

function Chip({ children, outline }: { children: React.ReactNode; outline?: boolean }) {
  return (
    <li className={`rounded-md px-2.5 py-1 text-xs font-medium ${outline ? "border border-white/40" : "bg-white/10"}`}>{children}</li>
  );
}

async function TitleContent({ params }: { params: PageProps<"/title/[id]">["params"] }) {
  const { id } = await params;
  const title = await getTitle(id);
  if (!title) notFound();
  const related = await getRelated(id);

  return (
    <article>
      <ViewBeacon titleId={title.id} />
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
            <ul aria-label="Details" className="rise rise-3 mt-5 flex flex-wrap items-center gap-2">
              <Chip outline>{title.rating}</Chip>
              {title.year > 0 && <Chip>{title.year}</Chip>}
              {title.runtimeMin > 0 && <Chip>{runtime(title.runtimeMin)}</Chip>}
              {title.type === "SERIES" && title.episodes && <Chip>{new Set(title.episodes.map((e) => e.season)).size} seasons</Chip>}
              {title.genres.slice(0, 3).map((g) => (
                <Chip key={g}>{g}</Chip>
              ))}
            </ul>
            <p className="rise rise-3 mt-5 text-base leading-relaxed text-white/85 sm:text-lg">
              {title.overview}
            </p>

            <TitleActions titleId={title.id} titleName={title.name} sources={title.sources} titleType={title.type} />
          </div>
        </div>
      </section>

      {title.type === "SERIES" && title.episodes && title.episodes.length > 0 && (
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-10">
          <EpisodeBrowser titleId={title.id} episodes={title.episodes} />
        </div>
      )}

      {title.credits && (
        <div className="mt-10">
          <CastCrew credits={title.credits} />
        </div>
      )}

      <div className="mt-10 space-y-10 pb-6">
        {related.length > 0 && (
          <section aria-labelledby="more-like-this" className="mx-auto w-full max-w-7xl px-5 sm:px-10">
            <h2 id="more-like-this" className="mb-5 flex items-center gap-3 text-xl font-semibold tracking-tight">
              <span className="h-4 w-1 rounded-full bg-accent" aria-hidden />
              More like this
            </h2>
            <div className="grid grid-cols-2 justify-items-center gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {related.map((t) => (
                <TitleCard key={t.id} title={t} />
              ))}
            </div>
          </section>
        )}
        <p className="px-5 text-center text-[11px] text-white/30 sm:px-10">
          {title.posterCredit} · {title.backdropCredit}
        </p>
      </div>
    </article>
  );
}
