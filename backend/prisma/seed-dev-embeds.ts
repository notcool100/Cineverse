import "reflect-metadata";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

// Development-only fixtures for the multi-source picker. Every item is Creative Commons / public domain
// and hosted by its official owner (archive.org embeds, Blender Foundation YouTube uploads).
// Hosts must be in EMBED_ALLOWED_HOSTS; the dev default already includes archive.org and youtube-nocookie.
config();
if (process.env.NODE_ENV === "production") throw new Error("seed-dev-embeds is development-only");
const prisma = new PrismaClient();

const LICENSE = "Dev fixture: Creative Commons / public domain test item";

const ARCHIVE_EMBEDS = [
  { slug: "dev-archive-sintel", label: "Archive.org embed", title: "sintel", item: "Sintel" },
  { slug: "dev-archive-elephants-dream", label: "Archive.org embed", title: "elephants-dream", item: "ElephantsDream" },
  { slug: "dev-archive-notld", label: "Archive.org embed", title: "night-of-the-living-dead", item: "Night_of_the_Living_Dead_AVI" },
];
const YOUTUBE_OFFICIAL = [
  { title: "big-buck-bunny", id: "aqz-KE-bpKQ" },
  { title: "sintel", id: "eRsGyueVLvQ" },
  { title: "tears-of-steel", id: "R6MlUcmOul8" },
];

async function main() {
  for (const e of ARCHIVE_EMBEDS) {
    const title = await prisma.title.findUnique({ where: { slug: e.title } });
    if (!title) continue; // run `pnpm db:seed` first
    await prisma.embedProvider.upsert({
      where: { slug: e.slug },
      create: { slug: e.slug, label: e.label, urlTemplate: `https://archive.org/embed/${e.item}`, licenseRef: LICENSE, enabled: true, priority: 10 },
      update: { urlTemplate: `https://archive.org/embed/${e.item}`, licenseRef: LICENSE, enabled: true },
    });
    await prisma.source.deleteMany({ where: { titleId: title.id, kind: "EMBED_PROVIDER" } });
    await prisma.source.create({ data: { titleId: title.id, kind: "EMBED_PROVIDER", label: e.label, priority: 20, externalUrl: e.slug } });
  }
  for (const y of YOUTUBE_OFFICIAL) {
    const title = await prisma.title.findUnique({ where: { slug: y.title } });
    if (!title) continue;
    await prisma.source.deleteMany({ where: { titleId: title.id, kind: "YOUTUBE_OFFICIAL" } });
    await prisma.source.create({ data: { titleId: title.id, kind: "YOUTUBE_OFFICIAL", label: "YouTube (Blender)", priority: 30, externalUrl: y.id } });
  }
}

main().finally(() => prisma.$disconnect());
