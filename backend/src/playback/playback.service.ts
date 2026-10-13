import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { PrismaService } from "../common/prisma.service";
import { requireEnv } from "../common/secrets";

const TTL_SEC = 300;

export function signUrl(base: string, key: string, secret: string, now = Date.now()) {
  const exp = Math.floor(now / 1000) + TTL_SEC;
  const path = `/${key}`;
  const sig = createHmac("sha256", secret).update(`${path}:${exp}`).digest("hex");
  return { url: `${base.replace(/\/$/, "")}${path}?exp=${exp}&sig=${sig}`, expiresAt: new Date(exp * 1000).toISOString() };
}

@Injectable()
export class PlaybackService {
  constructor(private readonly prisma: PrismaService) {}

  async token(sourceId: string, episodeId?: string) {
    const s = await this.prisma.source.findUnique({
      where: { id: sourceId },
      include: { title: true, episode: { include: { title: true } } },
    });
    const title = s?.title ?? s?.episode?.title;
    if (!s || !title?.published || s.status !== "READY") throw new NotFoundException();

    switch (s.kind) {
      case "HLS_OWNED":
      case "PUBLIC_DOMAIN": {
        if (s.externalUrl) return { type: "direct" as const, url: s.externalUrl };
        const base = process.env.CDN_BASE_URL;
        if (!s.manifestKey || !base) throw new ServiceUnavailableException("Stream not available yet");
        return { type: "hls" as const, ...signUrl(base, s.manifestKey, requireEnv("PLAYBACK_SIGNING_KEY")) };
      }
      case "YOUTUBE_OFFICIAL":
        return { type: "youtube" as const, videoId: s.externalUrl };
      case "WATCH_LINK":
        return { type: "link" as const, url: s.externalUrl };
      case "EMBED_PROVIDER": {
        const p = await this.prisma.embedProvider.findUnique({ where: { slug: s.externalUrl ?? "" } });
        if (!p?.enabled || !p.licenseRef || !title.tmdbId) throw new NotFoundException();
        const ep = s.episode;
        const tpl = ep ? p.episodeUrlTemplate : p.urlTemplate;
        if (!tpl) throw new NotFoundException();
        const url = tpl
          .replaceAll("{tmdbId}", String(title.tmdbId))
          .replaceAll("{season}", String(ep?.season ?? ""))
          .replaceAll("{episode}", String(ep?.number ?? ""));
        return { type: "embed" as const, url };
      }
    }
  }
}
