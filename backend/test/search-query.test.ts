import { describe, expect, it } from "vitest";
import { filtersToMeili, filtersToWhere, likeEscape, parseRatings } from "../src/search/query";

describe("search query helpers", () => {
  it("escapes LIKE wildcards", () => {
    expect(likeEscape("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
  it("parses rating lists", () => {
    expect(parseRatings("PG-13, R,R")).toEqual(["PG-13", "R"]);
    expect(parseRatings(undefined)).toBeUndefined();
    expect(parseRatings("")).toBeUndefined();
  });
  it("builds a Prisma where from filters", () => {
    expect(filtersToWhere({})).toEqual({});
    expect(filtersToWhere({ type: "MOVIE", genre: "Drama", language: "hi", rating: ["R"] })).toEqual({
      type: "MOVIE",
      genres: { has: "Drama" },
      language: "hi",
      rating: { in: ["R"] },
    });
    expect(filtersToWhere({ yearFrom: 2000, yearTo: 2009 })).toEqual({ year: { gte: 2000, lte: 2009 } });
    expect(filtersToWhere({ year: 1999, yearFrom: 2000 })).toEqual({ year: { equals: 1999 } });
  });
  it("builds Meilisearch filters and strips quotes", () => {
    expect(filtersToMeili({ type: "SERIES", genre: 'Sci"Fi', yearFrom: 2000, yearTo: 2010, rating: ["PG", "R"] })).toEqual([
      'type = "SERIES"',
      'genres = "SciFi"',
      "year >= 2000",
      "year <= 2010",
      '(rating = "PG" OR rating = "R")',
    ]);
    expect(filtersToMeili({})).toEqual([]);
  });
});
