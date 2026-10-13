"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type shaka from "shaka-player";
import type { Source, TitleType } from "@/lib/types";
import { getEmbedProviders, getEmbedToken, getHistory, getPlaybackToken, saveProgress, type PlaybackToken } from "@/lib/client-api";
import { buildEntries, initialIndex, nextPlayable, type PickerEntry, type ProviderInfo } from "@/lib/sources";
import { useUser } from "./useSession";
import { VideoControls } from "./VideoControls";

const PREF_KEY = "cineora.preferredSource";
/** How long an iframe may take to fire `load` before we suggest another source. */
const SLOW_MS = 12_000;

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
}

/** Loads the provider registry, then hands the merged source list to the player. */
export function Player(props: Props) {
  const user = useUser();
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);
  useEffect(() => {
    if (!user) return;
    let live = true;
    getEmbedProviders()
      .then((p) => live && setProviders(p))
      .catch(() => live && setProviders([]));
    return () => {
      live = false;
    };
  }, [user]);
  if (user && !providers) return <Notice>Loading…</Notice>;
  return <PlayerInner {...props} entries={buildEntries(props.sources, providers ?? [], props.titleType)} />;
}

/** Plays the chosen source; on failure falls back to the next playable source in order. */
function PlayerInner({ titleId, titleName, entries: ordered, initialSourceId, season, episode }: Props & { entries: PickerEntry[] }) {
  const user = useUser();
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
        saveProgress(titleId, Math.floor(video.currentTime), Math.floor(video.duration)).catch(() => {});
    };

    (async () => {
      const shaka = (await import("shaka-player")).default;
      shaka.polyfill.installAll();
      if (cancelled) return;
      player = new shaka.Player();
      await player.attach(video);
      player.addEventListener("error", () => next());
      const resume = (await getHistory().catch(() => [])).find((h) => h.title.slug === titleId);
      const pos = resume && resume.positionSec < resume.durationSec - 10 ? resume.positionSec : undefined;
      await player.load(url, pos);
      if (cancelled) return;
      video.play().catch(() => {});
      timer = setInterval(save, 15_000);
      video.addEventListener("pause", save);
    })().catch(() => !cancelled && next());

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      video.removeEventListener("pause", save);
      save();
      player?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideo, url, titleId]);

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
      {error || !token ? (
        <Notice>{error ?? "Loading…"}</Notice>
      ) : (
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
          {isVideo && (
            <>
              <video ref={videoRef} playsInline className="size-full" />
              <VideoControls videoRef={videoRef} sources={ordered} activeSourceId={source.id} onSelectSource={(i) => select(i, true)} />
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
              sandbox="allow-scripts allow-same-origin allow-presentation"
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
              <span>{source.label} hasn’t responded. {kindHint}</span>
              {nextPlayable(ordered, index) >= 0 && (
                <button onClick={() => select(nextPlayable(ordered, index), true)} className="shrink-0 rounded-full bg-white px-3 py-1 font-medium text-black">
                  Try next source
                </button>
              )}
            </div>
          )}
        </div>
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
