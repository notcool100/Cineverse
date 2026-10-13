/** Stored paths are either local (/posters/…, /backdrops/…), full URLs, or bare TMDB paths (/abc.jpg). */
export function imageUrl(path: string | null, size: "w185" | "w500" | "w1280"): string {
  if (!path) return "";
  if (/^https?:\/\//.test(path) || /^\/(posters|backdrops)\//.test(path)) return path;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
