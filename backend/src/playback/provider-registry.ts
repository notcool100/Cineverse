// Central registry of the embed providers shown in the source picker, in display order.
// It holds names only: a provider stays "unconfigured" until an operator stores an authorized,
// allow-listed URL template (EmbedProvider row) and enables it.

export interface RegistryProvider {
  slug: string;
  label: string;
  noAds: boolean;
}

const entry = (slug: string, name: string, noAds = false): RegistryProvider => ({
  slug,
  label: noAds ? `${name} (No Ads)` : name,
  noAds,
});

export const PROVIDER_REGISTRY: readonly RegistryProvider[] = [
  entry("cinezo", "Cinezo", true),
  entry("cinesrc", "CineSrc", true),
  entry("peestream", "PeeStream", true),
  entry("flaxmovies", "FlaxMovies", true),
  entry("moviesapi", "MoviesAPI", true),
  entry("vidlink", "VidLink"),
  entry("vidsrc-embed", "VidSrc Embed"),
  entry("videasy", "VidEasy"),
  entry("111movies", "111Movies"),
  entry("vidzee", "VidZee"),
  entry("vidsrc", "VidSrc"),
  entry("2embed", "2Embed"),
  entry("mapple", "Mapple"),
  entry("primesrc", "PrimeSrc"),
  entry("multiembed", "MultiEmbed"),
  entry("autoembed", "AutoEmbed"),
  entry("vixsrc", "VixSrc"),
  entry("vidlove", "VidLove"),
  entry("vidfast", "VidFast"),
  entry("filmu", "Filmu"),
  entry("vidcore", "VidCore"),
  entry("vaplayer", "VAPlayer"),
  entry("vares", "Vares"),
  entry("vidking", "VidKing"),
  entry("vidbolt", "VidBolt"),
  entry("vidnest", "VidNest"),
  entry("vidsrc-su", "VidSrc.su"),
  entry("vidgod", "VidGod"),
  entry("vidsrc-me", "VidSrc.me"),
  entry("1embed", "1Embed"),
];

export type ProviderState = "enabled" | "disabled" | "unconfigured";
export type ContentType = "movie" | "tv";

export interface ProviderRow {
  slug: string;
  urlTemplate: string;
  episodeUrlTemplate: string | null;
  licenseRef: string;
  enabled: boolean;
}

export interface ProviderInfo extends RegistryProvider {
  order: number;
  state: ProviderState;
  types: ContentType[];
}

/** Merges the registry with stored config. `valid` reports whether a template passes URL validation. */
export function describeProviders(rows: ProviderRow[], valid: (tpl: string) => boolean): ProviderInfo[] {
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  return PROVIDER_REGISTRY.map((p, order) => {
    const row = bySlug.get(p.slug);
    const types: ContentType[] = [];
    if (row?.urlTemplate && valid(row.urlTemplate)) types.push("movie");
    if (row?.episodeUrlTemplate && valid(row.episodeUrlTemplate)) types.push("tv");
    const state: ProviderState = !types.length ? "unconfigured" : row!.enabled ? "enabled" : "disabled";
    return { ...p, order, state, types };
  });
}
