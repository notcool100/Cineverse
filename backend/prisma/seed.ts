import "reflect-metadata";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { config } from "dotenv";

config();
const prisma = new PrismaClient();

// Public-domain / Creative Commons seed content only (PROJECT.md §1, §13).
const SEED: (Prisma.TitleCreateInput & { sourceLabel: string; stream: string })[] = JSON.parse(
  readFileSync(join(__dirname, "seed-titles.json"), "utf8"),
);

async function main() {
  for (const { stream, sourceLabel, ...t } of SEED) {
    const title = await prisma.title.upsert({
      where: { slug: t.slug },
      create: { ...t, type: "MOVIE", published: true },
      update: { ...t, published: true },
    });
    await prisma.source.deleteMany({ where: { titleId: title.id, kind: "PUBLIC_DOMAIN" } });
    await prisma.source.create({
      data: { titleId: title.id, kind: "PUBLIC_DOMAIN", label: sourceLabel, priority: 0, externalUrl: stream },
    });
  }
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    const passwordHash = await argon2.hash(ADMIN_PASSWORD, { type: argon2.argon2id });
    await prisma.user.upsert({
      where: { email: ADMIN_EMAIL.toLowerCase() },
      create: { email: ADMIN_EMAIL.toLowerCase(), passwordHash, role: "ADMIN" },
      update: { passwordHash, role: "ADMIN" },
    });
  }
}

main().finally(() => prisma.$disconnect());
