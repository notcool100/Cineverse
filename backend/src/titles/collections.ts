import type { Prisma } from "@prisma/client";

/**
 * Curated mood / genre collections. Each one is a genre rule over published, released titles;
 * TMDB names the same genre differently for movies and TV ("Science Fiction" vs "Sci-Fi & Fantasy"), so rules list variants.
 */
export interface Collection {
  key: string;
  title: string;
  blurb: string;
  /** Title must have at least one of these genres. */
  any: string[];
  /** Title must have none of these. */
  none?: string[];
  /** Gradient stops for the card. */
  accent: [string, string];
}

export const COLLECTIONS: Collection[] = [
  { key: "feel-good", title: "Feel-good", blurb: "Warm, funny and easy to love", any: ["Comedy", "Family", "Romance"], none: ["Horror", "Thriller", "War", "Crime"], accent: ["#f59e0b", "#ef4444"] },
  { key: "edge-of-your-seat", title: "Edge of your seat", blurb: "Twists, tension and no spoilers", any: ["Thriller", "Mystery", "Crime"], accent: ["#ef4444", "#7f1d1d"] },
  { key: "mind-bending", title: "Mind-bending", blurb: "Big ideas that keep you thinking", any: ["Science Fiction", "Sci-Fi", "Sci-Fi & Fantasy", "Mystery"], none: ["Family", "Animation"], accent: ["#6366f1", "#0ea5e9"] },
  { key: "date-night", title: "Date night", blurb: "Romance, with or without the laughs", any: ["Romance"], none: ["Horror", "War"], accent: ["#ec4899", "#be123c"] },
  { key: "family-night", title: "Family night", blurb: "Something everyone can watch", any: ["Family", "Animation", "Kids"], none: ["Horror", "Crime", "War", "Thriller"], accent: ["#22c55e", "#0ea5e9"] },
  { key: "adrenaline", title: "Adrenaline", blurb: "Action, adventure and big set pieces", any: ["Action", "Adventure", "Action & Adventure"], accent: ["#f97316", "#dc2626"] },
  { key: "true-stories", title: "True stories", blurb: "Real people, real events", any: ["Documentary", "History", "Biography"], accent: ["#14b8a6", "#1e3a8a"] },
  { key: "after-dark", title: "After dark", blurb: "Scary, strange and best with the lights off", any: ["Horror"], accent: ["#7c3aed", "#111827"] },
];

export const collectionByKey = (key: string) => COLLECTIONS.find((c) => c.key === key);

export function collectionWhere(c: Collection): Prisma.TitleWhereInput {
  return { genres: { hasSome: c.any }, ...(c.none?.length && { NOT: { genres: { hasSome: c.none } } }) };
}
