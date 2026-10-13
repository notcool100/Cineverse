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
  /** CSS gradient stand-in until real posters come from TMDB/R2. */
  accent: [string, string];
  sources: Source[];
  /** Series only: season/number pairs, present on the single-title response. */
  episodes?: { season: number; number: number }[];
}
