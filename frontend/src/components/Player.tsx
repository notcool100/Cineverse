"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type shaka from "shaka-player";
import type { Source, TitleType } from "@/lib/types";
import { getEmbedProviders, getEmbedToken, episodeKey, getHistory, getPlaybackToken, saveProgress, type PlaybackToken } from "@/lib/client-api";
import { probeProviders } from "@/lib/latency";
import { buildEntries, initialIndex, nextPlayable, type PickerEntry, type ProviderInfo } from "@/lib/sources";
import { useUser } from "./useSession";
import { VideoControls } from "./VideoControls";
import { EmptyState } from "./EmptyState";

const PREF_KEY = "cineora.preferredSource";
/** How long an iframe may take to fire `load` before we suggest another source. */
const SLOW_MS = 12_000;
/** No per-title intro markers exist, so "Skip intro" is a fixed window: shown early in an episode, jumps to INTRO_END. */
const INTRO_SHOW_FROM = 3;
const INTRO_END = 90;
const NEXT_COUNTDOWN = 8;

const readPref = (): string | null => {
  try {
    return localStorage.getItem(PREF_KEY);
  } catch {
    return null;
  }
};
const writePref = (label: string) => {
  try {
    localStorage.setItem(PREF_KEY, label);
  } catch {}
};

interface Props {
  titleId: string;
  titleName: string;
  sources: Source[];
  initialSourceId?: string;
  titleType?: TitleType;
  /** Episode to play for series; providers need both to build a TV URL. */
  season?: number;
  episode?: number;
  /** Series only: the next episode's watch URL; enables autoplay-next. */
  nextHref?: string;
}

/** Loads the provider registry, then hands the merged source list to the player. */
export function Player(props: Props) {
  const user = useUser();
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [latency, setLatency] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    if (!user) return;
    let live = true;
    getEmbedProviders()
      .then((p) => live && setProviders(p))
      .catch((e) => {
        if (!live) return;
        console.error("Failed to load /playback/providers", e);
        setFailed(true);
        setProviders([]);
      });
    return () => {
      live = false;
    };
  }, [user]);
  // Rank providers by measured latency before choosing the starting source.
  useEffect(() => {
    if (!providers) return;
    let live = true;
    probeProviders(providers)
      .then((ms) => live && setLatency(ms))
      .catch(() => live && setLatency({}));
    return () => {
      live = false;
    };
  }, [providers]);
  if (user && (!providers || (!latency && !failed))) return <Notice>{providers ? "Finding the fastest server…" : "Loading…"}</Notice>;
  if (failed && props.sources.length === 0)
    return <Notice>Couldn&apos;t reach the streaming API. Check your connection and reload; if it persists, the site&apos;s API URL or CORS settings are misconfigured.</Notice>;
  return <PlayerInner {...props} entries={buildEntries(props.sources, providers ?? [], props.titleType, latency ?? {})} />;
}

/** Plays the chosen source; on failure falls back to the next playable source in order. */
function PlayerInner({ titleId, titleName, entries: ordered, initialSourceId, season, episode, nextHref }: Props & { entries: PickerEntry[] }) {
  const user = useUser();
  const router = useRouter();
  const epKey = episodeKey(season, episode);
  const [showSkip, setShowSkip] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  // URL choice wins, then the remembered source (matched by label, since ids are per-title).
  const [index, setIndex] = useState(() => initialIndex(ordered, initialSourceId, readPref()));
  const [token, setToken] = useState<PlaybackToken | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<"loading" | "loaded" | "slow">("loading");
  const videoRef = useRef<HTMLVideoElement>(null);
  const source = ordered[index];

  const select = (i: number, remember = false) => {
    setToken(null);
    setError(null);
    setFrame("loading");
    setIndex(i);
    if (remember && ordered[i]) writePref(ordered[i].label);
  };

  // Cross-origin iframes can't report X-Frame-Options/CSP blocks, so a missing `load` is only a hint.
  const isFrame = token?.type === "embed" || token?.type === "youtube";
  useEffect(() => {
    if (!isFrame) return;
    const t = setTimeout(() => setFrame((f) => (f === "loading" ? "slow" : f)), SLOW_MS);
    return () => clearTimeout(t);
  }, [isFrame, token]);
  const next = () => {
    const n = nextPlayable(ordered, index);
    if (n >= 0) select(n);
    else setError("This title couldn't be played from any source.");
  };

  useEffect(() => {
    if (!user || !source) return;
    let live = true;
    (source.providerSlug ? getEmbedToken(source.providerSlug, titleId, season, episode) : getPlaybackToken(source.id))
      .then((t) => live && setToken(t))
      .catch(() => live && next());
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, source?.id]);

  // Iframes and external links can't report progress; record that playback started so it counts as a watch.
  const startedType = token && token.type !== "hls" && token.type !== "direct" ? token.type : null;
  useEffect(() => {
    if (startedType) saveProgress(titleId, 0, 0, epKey).catch(() => {});
  }, [startedType, titleId, epKey]);

  const isVideo = token?.type === "hls" || token?.type === "direct";
  const url = token && "url" in token ? token.url : undefined;
  useEffect(() => {
    const video = videoRef.current;
    if (!isVideo || !video || !url) return;
    let player: shaka.Player | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    const save = () => {
      if (video.duration > 0 && video.currentTime > 0)
        saveProgress(titleId, Math.floor(video.currentTime), Math.floor(video.duration), epKey).catch(() => {});
    };

    const onTime = () => setShowSkip(!!season && video.currentTime >= INTRO_SHOW_FROM && video.currentTime < INTRO_END - 5);
    const onEnded = () => {
      save();
      if (nextHref) setCountdown(NEXT_COUNTDOWN);
    };

    (async () => {
      const shaka = (await import("shaka-player")).default;
      shaka.polyfill.installAll();
      if (cancelled) return;
      player = new shaka.Player();
      await player.attach(video);
      player.addEventListener("error", () => next());
      const resume = (await getHistory().catch(() => [])).find((h) => h.title.slug === titleId && h.episodeId === epKey);
      const pos = resume && resume.positionSec < resume.durationSec - 10 ? resume.positionSec : undefined;
      await player.load(url, pos);
      if (cancelled) return;
      video.play().catch(() => {});
      timer = setInterval(save, 15_000);
      video.addEventListener("pause", save);
      video.addEventListener("timeupdate", onTime);
      video.addEventListener("ended", onEnded);
    })().catch(() => !cancelled && next());

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      video.removeEventListener("pause", save);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("ended", onEnded);
      save();
      player?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideo, url, titleId]);

  useEffect(() => {
    if (countdown === null || !nextHref) return;
    if (countdown <= 0) {
      router.push(nextHref);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? c : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, nextHref, router]);

  if (!user)
    return (
      <Notice>
        <Link href={`/login?next=/watch/${titleId}`} className="text-accent underline">Sign in</Link> to watch {titleName}.
      </Notice>
    );
  if (!source) return <Notice>No sources available.</Notice>;
  if (!ordered.some((s) => s.state === "enabled")) return <Notice>No sources are configured yet.</Notice>;

  const kindHint =
    token?.type === "embed"
      ? "Some providers refuse to be embedded, or are slow right now."
      : "The video may be unavailable or blocked in your region.";

  return (
    <div>
      {error ? (
        <div className="grid aspect-video w-full place-items-center rounded-2xl border border-white/10 bg-black/40 p-4">
          <EmptyState
            art="source"
            title="This source failed"
            className="py-6"
            actions={[
              { label: "Try the first source again", primary: true, onClick: () => select(Math.max(0, ordered.findIndex((e) => e.state === "enabled"))) },
              { label: "Back to title", href: `/title/${titleId}` },
            ]}
          >
            None of the sources could play this right now. Pick a different one below, or try again in a moment.
          </EmptyState>
        </div>
      ) : !token ? (
        <div role="status" aria-label="Loading player" className="skeleton grid aspect-video w-full place-items-center rounded-2xl">
          <span className="text-sm text-white/55">Loading {source.label}…</span>
        </div>
      ) : (
        <div className="on-dark relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
          {isVideo && (
            <>
              <video ref={videoRef} playsInline className="size-full" />
              <VideoControls videoRef={videoRef} sources={ordered} activeSourceId={source.id} onSelectSource={(i) => select(i, true)} previewSrc={token.type === "direct" ? token.url : undefined} />
              {showSkip && countdown === null && (
                <button
                  onClick={() => {
                    if (videoRef.current) videoRef.current.currentTime = INTRO_END;
                  }}
                  className="glass absolute bottom-20 right-4 rounded-full px-4 py-2 text-sm font-semibold"
                >
                  Skip intro
                </button>
              )}
              {countdown !== null && nextHref && (
                <div className="absolute inset-0 grid place-items-center bg-black/70">
                  <div className="text-center">
                    <p className="mb-4 text-white/80">Next episode in {countdown}s</p>
                    <div className="flex justify-center gap-3">
                      <button onClick={() => router.push(nextHref)} className="rounded-full bg-white px-5 py-2 font-semibold text-black">Play now</button>
                      <button onClick={() => setCountdown(null)} className="glass rounded-full px-5 py-2">Cancel</button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          {token.type === "youtube" && (
            <iframe
              title={titleName}
              src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(token.videoId)}`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              onLoad={() => setFrame("loaded")}
              className="size-full"
            />
          )}
          {token.type === "embed" && (
            <iframe
              title={titleName}
              src={token.url}
              // sandbox="allow-scripts allow-same-origin allow-presentation"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              referrerPolicy="no-referrer"
              onLoad={() => setFrame("loaded")}
              className="size-full"
            />
          )}
          {token.type === "link" && (
            <div className="grid size-full place-items-center">
              <a href={token.url} target="_blank" rel="noopener noreferrer" className="rounded-full bg-white px-7 py-3 font-semibold text-black">
                Watch on provider ↗
              </a>
            </div>
          )}
          {isFrame && frame === "loading" && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/60 text-white/70">
              Loading {source.label}…
            </div>
          )}
          {isFrame && frame === "slow" && (
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-black/80 px-4 py-2 text-sm text-white/80">
              <span>This source failed to load ({source.label}). {kindHint}</span>
              {nextPlayable(ordered, index) >= 0 && (
                <button onClick={() => select(nextPlayable(ordered, index), true)} className="shrink-0 rounded-full bg-white px-3 py-1 font-medium text-black">
                  Try another source
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {nextHref && (
        <Link href={nextHref} className="mt-4 inline-block rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium hover:bg-white/20">
          Next episode →
        </Link>
      )}
      {ordered.length > 1 && (
        <div role="radiogroup" aria-label="Source" className="mt-4 flex flex-wrap gap-2">
          {ordered.map((s, i) => (
            <button
              key={s.id}
              role="radio"
              aria-checked={i === index}
              aria-disabled={s.state !== "enabled"}
              disabled={s.state !== "enabled"}
              title={s.state === "unconfigured" ? "Not configured" : s.state === "disabled" ? "Disabled" : undefined}
              onClick={() => select(i, true)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                i === index ? "border-accent bg-accent text-white" : "glass-soft text-white/75 hover:text-white"
              } ${s.state !== "enabled" ? "cursor-not-allowed opacity-40 hover:text-white/75" : ""}`}
            >
              {s.label}
              {s.latencyMs !== undefined && s.state === "enabled" && (
                <span className="ml-1.5 text-xs opacity-60">
                  {i === ordered.findIndex((e) => e.latencyMs !== undefined && e.state === "enabled") ? "Fastest · " : ""}
                  {s.latencyMs} ms
                </span>
              )}
              {s.state !== "enabled" && <span className="ml-1.5 text-xs">· {s.state === "unconfigured" ? "not configured" : "disabled"}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid aspect-video w-full place-items-center rounded-2xl border border-white/10 bg-black/60 text-white/70">
      <p>{children}</p>
    </div>
  );
}
