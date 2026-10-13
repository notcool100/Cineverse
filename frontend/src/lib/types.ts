// Mirrors the Prisma model in PROJECT.md §5. Move to packages/types once the monorepo exists.
export type TitleType = "MOVIE" | "SERIES";

export type SourceKind =
  | "HLS_OWNED"
  | "PUBLIC_DOMAIN"
  | "YOUTUBE_OFFICIAL"
  | "WATCH_LINK"
  | "EMBED_PROVIDER";

export interface Source {
  id: string;
  kind: SourceKind;
  label: string;
  priority: number;
  externalUrl?: string;
}

export interface Title {
  id: string;
  type: TitleType;
  name: string;
  overview: string;
  year: number;
  runtimeMin: number;
  genres: string[];
  rating: string;
  /** Path under /public. */
  poster: string;
  /** Attribution for the poster (license + author), required for CC BY artwork. */
  posterCredit: string;
  /** 16:9 still under /public, used for hero banners. */
  backdrop: string;
  backdropCredit: string;
  /** YouTube video id of the trailer, when known. */
  trailerKey?: string;
  /** CSS gradient stand-in until real posters come from TMDB/R2. */
  accent: [string, string];
  sources: Source[];
  /** Continue-watching rows only: 0..1 watched fraction (null when the player can't report it). */
  progress?: number | null;
  /** Continue-watching rows only: the card resumes playback instead of opening the detail page. */
  resume?: boolean;
  /** Continue-watching series cards: the episode to resume (or advance to). */
  resumeSeason?: number;
  resumeEpisode?: number;
  /** TMDB cast and crew; present on the single-title response only. */
  credits?: Credits;
  /** Series only: season/number pairs, present on the single-title response. */
  episodes?: Episode[];
}

export interface Episode {
  season: number;
  number: number;
  name?: string;
  overview?: string;
  /** Full still URL, or "" when TMDB has none. */
  still: string;
  runtimeMin?: number;
}

export interface Credits {
  cast: { name: string; character: string; photo: string }[];
  crew: { name: string; job: string; photo: string }[];
}
