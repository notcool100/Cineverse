import "reflect-metadata";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

// Safe to run in production. Stores the Cinezo URL templates and allows its host. The provider is enabled immediately; the licence reference is optional.
// Anime (/embed/anime/{AnilistId}/{number}) is not supported: templates only know tmdbId/season/episode.
config();
const prisma = new PrismaClient();

const HOST = "player.cinezo.live";
const OPTIONS = "autoplay=false&poster=true&chromecast=true&servericon=true&setting=true&pip=true&font=Roboto&fontcolor=6f63ff&fontsize=20&opacity=0.5&primarycolor=e8b86d&secondarycolor=0a0a12&iconcolor=ffffff";
const MOVIE = `https://${HOST}/embed/movie/{tmdbId}?${OPTIONS}`;
const EPISODE = `https://${HOST}/embed/tv/{tmdbId}/{season}/{episode}?${OPTIONS}`;

async function main() {
  await prisma.allowedHost.upsert({ where: { host: HOST }, create: { host: HOST }, update: {} });
  await prisma.embedProvider.upsert({
    where: { slug: "cinezo" },
    create: { slug: "cinezo", label: "Cinezo (No Ads)", urlTemplate: MOVIE, episodeUrlTemplate: EPISODE, licenseRef: "", enabled: true, priority: 0 },
    update: { urlTemplate: MOVIE, episodeUrlTemplate: EPISODE },
  });
}

main().finally(() => prisma.$disconnect());
