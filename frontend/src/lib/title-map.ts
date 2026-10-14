import type { Source, Title } from "./types";
import { imageUrl } from "./image-url";

export interface ApiTitle {
  slug: string;
  type: Title["type"];
  name: string;
  overview: string | null;
  year: number | null;
  runtimeMin: number | null;
  rating: string | null;
  genres: string[];
  posterPath: string | null;
  backdropPath: string | null;
  posterCredit: string | null;
  backdropCredit: string | null;
  accent: string[];
  sources: Source[];
  episodes?: { season: number; number: number; name?: string | null; overview?: string | null; stillPath?: string | null; runtimeMin?: number | null; introStartSec?: number | null; introEndSec?: number | null; creditsStartSec?: number | null }[];
  trailerKey?: string | null;
  credits?: { cast: { name: string; character?: string; profilePath: string | null }[]; crew: { name: string; job: string; profilePath: string | null }[] } | null;
  progress?: number | null;
  resume?: boolean;
  resumeSeason?: number;
  resumeEpisode?: number;
}

export function toTitle(t: ApiTitle): Title {
  return {
    id: t.slug,
    type: t.type,
    name: t.name,
    overview: t.overview ?? "",
    year: t.year ?? 0,
    runtimeMin: t.runtimeMin ?? 0,
    genres: t.genres,
    rating: t.rating ?? "NR",
    poster: imageUrl(t.posterPath, "w500"),
    posterCredit: t.posterCredit ?? "",
    backdrop: imageUrl(t.backdropPath, "w1280"),
    backdropCredit: t.backdropCredit ?? "",
    accent: [t.accent[0] ?? "#333333", t.accent[1] ?? "#0a0a0a"],
    sources: t.sources,
    ...(t.trailerKey && { trailerKey: t.trailerKey }),
    ...(t.credits && {
      credits: {
        cast: t.credits.cast.map((p) => ({ name: p.name, character: p.character ?? "", photo: imageUrl(p.profilePath, "w185") })),
        crew: t.credits.crew.map((p) => ({ name: p.name, job: p.job, photo: imageUrl(p.profilePath, "w185") })),
      },
    }),
    episodes: t.episodes?.map((e) => ({
      season: e.season,
      number: e.number,
      name: e.name ?? undefined,
      overview: e.overview ?? undefined,
      still: imageUrl(e.stillPath ?? null, "w500"),
      runtimeMin: e.runtimeMin ?? undefined,
      introStartSec: e.introStartSec ?? undefined,
      introEndSec: e.introEndSec ?? undefined,
      creditsStartSec: e.creditsStartSec ?? undefined,
    })),
    ...(t.resume && { resume: true, progress: t.progress ?? null, resumeSeason: t.resumeSeason, resumeEpisode: t.resumeEpisode }),
  };
}
