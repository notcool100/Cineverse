import { Injectable, NotFoundException, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { PrismaService } from "../common/prisma.service";
import { requireEnv } from "../common/secrets";
import { loadDbHosts } from "./embed-hosts";
import { buildEmbedUrl, validateTemplate } from "./embed-template";
import { PROVIDER_REGISTRY, describeProviders } from "./provider-registry";
import { ReportsService } from "../reports/reports.service";

const TTL_SEC = 300;

export function signUrl(base: string, key: string, secret: string, now = Date.now()) {
  const exp = Math.floor(now / 1000) + TTL_SEC;
  const path = `/${key}`;
  const sig = createHmac("sha256", secret).update(`${path}:${exp}`).digest("hex");
  return { url: `${base.replace(/\/$/, "")}${path}?exp=${exp}&sig=${sig}`, expiresAt: new Date(exp * 1000).toISOString() };
}

@Injectable()
export class PlaybackService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
  ) {}

  onModuleInit() {
    return loadDbHosts(this.prisma);
  }

  /** Every registry provider with its current state; unconfigured ones are listed but not playable. */
  async providers() {
    const rows = await this.prisma.embedProvider.findMany({ where: { slug: { in: PROVIDER_REGISTRY.map((p) => p.slug) } } });
    return describeProviders(rows, (tpl) => validateTemplate(tpl) === null);
  }

  /** Embed URL for a registry provider, built server-side from the stored template (never from client input). */
  async embedToken(slug: string, titleIdOrSlug: string, season?: number, episode?: number) {
    const p = PROVIDER_REGISTRY.some((r) => r.slug === slug) && (await this.prisma.embedProvider.findUnique({ where: { slug } }));
    const title = await this.prisma.title.findFirst({ where: { published: true, OR: [{ id: titleIdOrSlug }, { slug: titleIdOrSlug }] } });
    if (!p || !title || !p.enabled) throw new NotFoundException();
    const tv = title.type === "SERIES";
    const tpl = tv ? p.episodeUrlTemplate : p.urlTemplate;
    const url = tpl && buildEmbedUrl(tpl, { tmdbId: title.tmdbId, season: tv ? season : undefined, episode: tv ? episode : undefined });
    if (!url) throw new NotFoundException();
    return { type: "embed" as const, url };
  }

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
        if (!p?.enabled) throw new NotFoundException();
        const ep = s.episode;
        const tpl = ep ? p.episodeUrlTemplate : p.urlTemplate;
        if (!tpl) throw new NotFoundException();
        // Re-validated on every request so a stale or tampered row can never emit an off-allowlist URL.
        const url = buildEmbedUrl(tpl, { tmdbId: title.tmdbId, season: ep?.season, episode: ep?.number });
        if (!url) throw new NotFoundException();
        return { type: "embed" as const, url };
      }
    }
  }

  private readonly availabilityCache = new Map<string, { at: number; ok: boolean }>();

  /**
   * Slugs of enabled providers that appear not to have this title. Probes each embed URL server-side
   * (the URLs come from allow-listed templates). Heuristic: 404/410 or a "not found" page means missing;
   * anything uncertain (timeouts, errors, redirects, other statuses) counts as available.
   */
  async unavailableProviders(titleIdOrSlug: string, season?: number, episode?: number) {
    const title = await this.prisma.title.findFirst({ where: { published: true, OR: [{ id: titleIdOrSlug }, { slug: titleIdOrSlug }] } });
    if (!title) throw new NotFoundException();
    const tv = title.type === "SERIES";
    const rows = await this.prisma.embedProvider.findMany({ where: { enabled: true, slug: { in: PROVIDER_REGISTRY.map((p) => p.slug) } } });
    const checks = await Promise.all(
      rows.map(async (p) => {
        const tpl = tv ? p.episodeUrlTemplate : p.urlTemplate;
        const url = tpl && buildEmbedUrl(tpl, { tmdbId: title.tmdbId, season: tv ? season : undefined, episode: tv ? episode : undefined });
        if (!url) return null;
        const hit = this.availabilityCache.get(url);
        if (hit && Date.now() - hit.at < AVAILABILITY_TTL_MS) return hit.ok ? null : p.slug;
        const ok = await probeEmbed(url);
        this.availabilityCache.set(url, { at: Date.now(), ok });
        return ok ? null : p.slug;
      }),
    );
    // Servers that enough viewers reported as broken for this title/episode are hidden too.
    const flagged = await this.reports.flaggedProviders(title.id, tv && season && episode ? `S${season}E${episode}` : "");
    return { unavailable: [...new Set([...checks.filter((s): s is string => !!s), ...flagged])] };
  }
}

const AVAILABILITY_TTL_MS = 30 * 60_000;
const MISSING_PAGE = /(not\s+found|no\s+results?|doesn['’]t\s+exist|does\s+not\s+exist|couldn['’]t\s+find|could\s+not\s+find|not\s+available|unavailable|removed)/i;

async function probeEmbed(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(4000), headers: { "user-agent": "Mozilla/5.0 (compatible; CineoraProbe/1.0)" } });
    if (res.status === 404 || res.status === 410) return false;
    if (res.status !== 200) return true;
    const text = (await res.text()).slice(0, 65536);
    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(text)?.[1] ?? "";
    // Only the page title is matched: body copy mentions these words too often in player UI strings.
    return !MISSING_PAGE.test(title);
  } catch {
    return true;
  }
}
