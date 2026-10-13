import Link from "next/link";
import { getGenres, getTitles, getTitlesByGenre } from "@/lib/catalog";
import { TitleRow } from "@/components/TitleRow";
import { BackdropImage, PlayGlyph, posterStyle } from "@/components/Poster";

export default async function Home() {
  const [titles, genres] = await Promise.all([getTitles(), getGenres()]);
  const hero = titles[0];
  const rows = (
    await Promise.all(genres.map(async (g) => ({ genre: g, titles: await getTitlesByGenre(g) })))
  ).filter((r) => r.titles.length > 1); // skip one-title genres until the catalog grows

  return (
    <>
      {hero && (
        <section className="relative isolate flex min-h-[92vh] items-end overflow-hidden">
          <div className="absolute inset-0 -z-10" style={posterStyle(hero)} />
          <div className="absolute inset-y-0 right-0 -z-10 w-full lg:w-[78%]">
            <BackdropImage title={hero} priority />
          </div>
          <div className="grain absolute inset-0 -z-10" aria-hidden />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-background from-24% via-background/55 via-45% to-transparent" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-background from-3% via-background/25 via-35% to-black/10" />

          <div className="mx-auto w-full max-w-7xl px-5 pb-24 pt-40 sm:px-10">
            <div>
              <p className="rise glass-soft mb-5 inline-flex rounded-full border px-3.5 py-1 text-xs tracking-wide text-white/80">
                Featured · {hero.genres.join(" · ")}
              </p>
              <h1 className="rise rise-2 max-w-2xl text-5xl font-extrabold leading-[1] tracking-tight sm:text-7xl lg:text-8xl">
                {hero.name}
              </h1>
              <p className="rise rise-3 mt-6 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
                {hero.overview}
              </p>
              <div className="rise rise-3 mt-9 flex flex-wrap items-center gap-3">
                <Link
                  href={`/title/${hero.id}`}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-black transition hover:scale-[1.03] hover:bg-white/90"
                >
                  <PlayGlyph className="size-4" /> Watch now
                </Link>
                <Link
                  href="/browse"
                  className="glass rounded-full px-7 py-3.5 text-sm font-semibold transition hover:bg-white/15"
                >
                  Browse all
                </Link>
                <span className="ml-2 text-sm text-white/50">
                  {hero.year} · {hero.rating} · {hero.runtimeMin} min
                </span>
              </div>
            </div>

          </div>
        </section>
      )}

      <div className="relative space-y-4 pb-4">
        <TitleRow heading="Featured" titles={titles} />
        {rows.map((r) => (
          <TitleRow key={r.genre} heading={r.genre} titles={r.titles} />
        ))}
      </div>
    </>
  );
}
