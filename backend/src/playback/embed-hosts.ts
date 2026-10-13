import { Logger } from "@nestjs/common";
import type { PrismaService } from "../common/prisma.service";
import { setDbHosts } from "./embed-template";

/** Refreshes the in-memory allow-list from the database. A missing table (db:push not run) keeps env hosts only. */
export async function loadDbHosts(prisma: PrismaService) {
  try {
    setDbHosts((await prisma.allowedHost.findMany()).map((h) => h.host));
  } catch (e) {
    new Logger("embed-hosts").warn(`Could not load allowed hosts: ${(e as Error).message.split("\n").pop()}`);
  }
}
