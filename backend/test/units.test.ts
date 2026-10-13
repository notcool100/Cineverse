import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildEmbedUrl, validateTemplate } from "../src/playback/embed-template";
import { PROVIDER_REGISTRY, describeProviders } from "../src/playback/provider-registry";
import { signUrl } from "../src/playback/playback.service";

describe("signUrl", () => {
  it("produces an expiring HMAC signature", () => {
    const { url } = signUrl("https://cdn.example/", "media/a/master.m3u8", "k", 1_000_000);
    const q = new URL(url).searchParams;
    expect(q.get("exp")).toBe("1300");
    expect(q.get("sig")).toBe(createHmac("sha256", "k").update("/media/a/master.m3u8:1300").digest("hex"));
  });
});

describe("embed templates", () => {
  const hosts = ["player.example"];
  it("accepts https templates on allowed hosts", () => {
    expect(validateTemplate("https://player.example/embed/movie/{tmdbId}", hosts)).toBeNull();
    expect(validateTemplate("https://player.example/tv/{tmdbId}/{season}/{episode}?x=1", hosts)).toBeNull();
  });
  it("rejects bad schemes, hosts, placeholders and credentials", () => {
    expect(validateTemplate("http://player.example/{tmdbId}", hosts)).toMatch(/https/);
    expect(validateTemplate("javascript:alert(1)", hosts)).not.toBeNull();
    expect(validateTemplate("https://evil.example/{tmdbId}", hosts)).toMatch(/not an allowed/);
    expect(validateTemplate("https://{tmdbId}.player.example/x", hosts)).not.toBeNull();
    expect(validateTemplate("https://player.example/{foo}", hosts)).toMatch(/Unknown placeholder/);
    expect(validateTemplate("https://u:p@player.example/x", hosts)).toMatch(/Credentials/);
    expect(validateTemplate("https://player.example:8443/x", hosts)).toMatch(/ports/);
  });
  it("expands only with integer values and requires the ones the template uses", () => {
    process.env.EMBED_ALLOWED_HOSTS = "player.example";
    expect(buildEmbedUrl("https://player.example/m/{tmdbId}", { tmdbId: 7 })).toBe("https://player.example/m/7");
    expect(buildEmbedUrl("https://player.example/m/{tmdbId}", {})).toBeNull();
    expect(buildEmbedUrl("https://player.example/t/{tmdbId}/{season}/{episode}", { tmdbId: 1, season: 2 })).toBeNull();
    expect(buildEmbedUrl("https://player.example/t/{tmdbId}/{season}/{episode}", { tmdbId: 1, season: 2, episode: 3 })).toBe("https://player.example/t/1/2/3");
    delete process.env.EMBED_ALLOWED_HOSTS;
  });
});

describe("provider registry", () => {
  const NAMES = [
    "Cinezo (No Ads)", "CineSrc (No Ads)", "PeeStream (No Ads)", "FlaxMovies (No Ads)", "MoviesAPI (No Ads)",
    "VidLink", "VidSrc Embed", "VidEasy", "111Movies", "VidZee", "VidSrc", "2Embed", "Mapple", "PrimeSrc", "MultiEmbed",
    "AutoEmbed", "VixSrc", "VidLove", "VidFast", "Filmu", "VidCore", "VAPlayer", "Vares", "VidKing", "VidBolt", "VidNest",
    "VidSrc.su", "VidGod", "VidSrc.me", "1Embed",
  ];
  const valid = (tpl: string) => validateTemplate(tpl, ["player.example"]) === null;
  const row = (slug: string, o: object = {}) => ({
    slug, urlTemplate: "https://player.example/m/{tmdbId}", episodeUrlTemplate: null, licenseRef: "contract-1", enabled: true, ...o,
  });

  it("has all 30 entries in the requested order with unique slugs", () => {
    expect(PROVIDER_REGISTRY.map((p) => p.label)).toEqual(NAMES);
    expect(new Set(PROVIDER_REGISTRY.map((p) => p.slug)).size).toBe(30);
    expect(PROVIDER_REGISTRY.filter((p) => p.noAds).map((p) => p.label)).toEqual(NAMES.slice(0, 5));
  });
  it("lists every provider as unconfigured until a valid template is stored", () => {
    const list = describeProviders([], valid);
    expect(list).toHaveLength(30);
    expect(list.every((p) => p.state === "unconfigured" && p.types.length === 0)).toBe(true);
    expect(list.map((p) => p.order)).toEqual([...Array(30).keys()]);
  });
  it("treats off-allowlist or non-https templates as unconfigured", () => {
    const rows = [row("vidlink", { urlTemplate: "https://evil.example/{tmdbId}" }), row("vidsrc", { urlTemplate: "http://player.example/{tmdbId}" })];
    const by = Object.fromEntries(describeProviders(rows, valid).map((p) => [p.slug, p.state]));
    expect(by.vidlink).toBe("unconfigured");
    expect(by.vidsrc).toBe("unconfigured");
  });
  it("reports enabled, disabled and content types", () => {
    const rows = [
      row("cinezo", { episodeUrlTemplate: "https://player.example/t/{tmdbId}/{season}/{episode}" }),
      row("cinesrc", { enabled: false }),
      row("peestream", { licenseRef: " " }),
    ];
    const by = Object.fromEntries(describeProviders(rows, valid).map((p) => [p.slug, p]));
    expect(by.cinezo.state).toBe("enabled");
    expect(by.cinezo.types).toEqual(["movie", "tv"]);
    expect(by.cinesrc.state).toBe("disabled");
    expect(by.peestream.state).toBe("disabled");
    expect(by.flaxmovies.state).toBe("unconfigured");
  });
});

describe("allowed hosts", () => {
  it("accepts plain DNS names only", async () => {
    const { isValidHost } = await import("../src/playback/embed-template");
    expect(isValidHost("player.example.com")).toBe(true);
    for (const bad of ["localhost", "127.0.0.1", "a.com:8443", "https://a.com", "a.com/x", "*.a.com", "a..com", ""]) expect(isValidHost(bad)).toBe(false);
  });
  it("merges admin-added hosts with env hosts", async () => {
    const { allowedEmbedHosts, setDbHosts } = await import("../src/playback/embed-template");
    setDbHosts(["Added.example.com"]);
    expect(allowedEmbedHosts("env.example.com")).toEqual(["env.example.com", "added.example.com"]);
    setDbHosts([]);
  });
});
