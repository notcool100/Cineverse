"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type shaka from "shaka-player";
import type { Source } from "@/lib/types";
import { getHistory, getPlaybackToken, saveProgress, type PlaybackToken } from "@/lib/client-api";
import { useUser } from "./useSession";

interface Props {
  titleId: string;
  titleName: string;
  sources: Source[];
  initialSourceId?: string;
}

/** Plays the chosen source; on failure falls back to the next source in priority order. */
export function Player({ titleId, titleName, sources, initialSourceId }: Props) {
  const user = useUser();
  const ordered = [...sources].sort((a, b) => a.priority - b.priority);
  const start = Math.max(0, ordered.findIndex((s) => s.id === initialSourceId));
  const [index, setIndex] = useState(start);
  const [token, setToken] = useState<PlaybackToken | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const source = ordered[index];

  const select = (i: number) => {
    setToken(null);
    setError(null);
    setIndex(i);
  };
  const next = () => {
    if (index + 1 < ordered.length) select(index + 1);
    else setError("This title couldn't be played from any source.");
  };

  useEffect(() => {
    if (!user || !source) return;
    let live = true;
    getPlaybackToken(source.id)
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
  if (error) return <Notice>{error}</Notice>;
  if (!token) return <Notice>Loading…</Notice>;

  return (
    <div>
      <div className="aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
        {isVideo && <video ref={videoRef} controls playsInline className="size-full" />}
        {token.type === "youtube" && (
          <iframe
            title={titleName}
            src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(token.videoId)}`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="size-full"
          />
        )}
        {token.type === "embed" && (
          <iframe
            title={titleName}
            src={token.url}
            sandbox="allow-scripts allow-same-origin allow-presentation"
            allow="autoplay; fullscreen; encrypted-media"
            allowFullScreen
            referrerPolicy="no-referrer"
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
      </div>
      {ordered.length > 1 && (
        <div role="radiogroup" aria-label="Source" className="mt-4 flex flex-wrap gap-2">
          {ordered.map((s, i) => (
            <button
              key={s.id}
              role="radio"
              aria-checked={i === index}
              onClick={() => select(i)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                i === index ? "border-accent bg-accent text-white" : "glass-soft text-white/75 hover:text-white"
              }`}
            >
              {s.label}
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
