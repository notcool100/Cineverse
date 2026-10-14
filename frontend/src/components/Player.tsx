"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type shaka from "shaka-player";
import type { Source, TitleType } from "@/lib/types";
import { getEmbedProviders, getEmbedToken, getUnavailableProviders, episodeKey, getHistory, getPlaybackToken, saveProgress, type PlaybackToken } from "@/lib/client-api";
import { probeProviders } from "@/lib/latency";
import { buildEntries, initialIndex, nextPlayable, type PickerEntry, type ProviderInfo } from "@/lib/sources";
import { CineoraLoader } from "./CineoraLoader";
import { useUser } from "./useSession";
import { useProfilePrefs } from "./useProfilePrefs";
import { saveProfilePrefs } from "@/lib/profile-prefs";
import { VideoControls, type TrackMenu } from "./VideoControls";
import { useCast } from "./useCast";
import { EmptyState } from "./EmptyState";
import { ReportSource } from "./ReportSource";
import { PartyOverlay, PartyPanel } from "./PartyPanel";
import { useParty, type RemoteState } from "./useParty";
import { describeSync, partyWatchUrl, planSync } from "@/lib/party-sync";

const PREF_KEY = "cineora.preferredSource";
/** How long an iframe may take to fire `load` before we suggest another source. */
const SLOW_MS = 12_000;
const AUTO_SWITCH_MS = 3_000;
const NEXT_COUNTDOWN = 8;
/** Seconds before the intro window ends during which the "Skip intro" button is still offered. */
const SKIP_GRACE = 5;

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
  /** Watch-party room this page belongs to; `nav` means the viewer deliberately navigated here, so others follow. */
  party?: { code: string; nav: boolean };
  /** Admin-set playback markers (seconds). Skip intro shows only when both intro bounds exist. */
  markers?: { introStart?: number; introEnd?: number; creditsStart?: number };
}

/** Loads the provider registry, then hands the merged source list to the player. */
export function Player(props: Props) {
  const user = useUser();
  const prefs = useProfilePrefs();
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [latency, setLatency] = useState<Record<string, number> | null>(null);
  const [missing, setMissing] = useState<string[] | null>(null);
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
    // Servers that don't carry this title are hidden; a failed check hides nothing.
    getUnavailableProviders(props.titleId, props.season, props.episode)
      .then((r) => live && setMissing(r.unavailable))
      .catch(() => live && setMissing([]));
    return () => {
      live = false;
    };
  }, [providers, props.titleId, props.season, props.episode]);
  if (user && (!providers || ((!latency || !missing) && !failed))) return <Stage label={providers ? "Finding the best server" : "Loading"} />;
  if (failed && props.sources.length === 0)
    return <Notice>Couldn&apos;t reach the streaming API. Check your connection and reload; if it persists, the site&apos;s API URL or CORS settings are misconfigured.</Notice>;
  // If every server was flagged, keep them all rather than leave the viewer with nothing to try.
  const all = providers ?? [];
  const available = all.filter((p) => !missing?.includes(p.slug));
  const shown = available.some((p) => p.state === "enabled") ? available : all;
  return <PlayerInner {...props} entries={buildEntries(props.sources, shown, props.titleType, latency ?? {}, prefs.audioLang)} />;
}

/** Plays the chosen source; on failure falls back to the next playable source in order. */
function PlayerInner({ titleId, titleName, entries: ordered, initialSourceId, season, episode, nextHref, markers, party }: Props & { entries: PickerEntry[] }) {
  const user = useUser();
  const router = useRouter();
  const epKey = episodeKey(season, episode);
  const prefs = useProfilePrefs();
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  });
  const [showSkip, setShowSkip] = useState(false);
  const [upNext, setUpNext] = useState(false);
  const shakaRef = useRef<shaka.Player | null>(null);
  const [tracks, setTracks] = useState<TrackMenu | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  // URL choice wins, then the remembered source (matched by label, since ids are per-title).
  const [index, setIndex] = useState(() => initialIndex(ordered, initialSourceId, readPref()));
  const [token, setToken] = useState<PlaybackToken | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<"loading" | "loaded" | "slow">("loading");
  const videoRef = useRef<HTMLVideoElement>(null);
  const source = ordered[index];
  // Only direct/HLS streams can be cast; embedded iframes and YouTube cannot.
  const cast = useCast(videoRef, token && (token.type === "hls" || token.type === "direct") ? token.url : undefined, titleName);

  // ---- Watch party: keep this <video> in step with the room, and follow its navigation ----
  const partyCode = party?.code ?? null;
  const [indicator, setIndicator] = useState<string | null>(null);
  const [countdownAt, setCountdownAt] = useState<number | null>(null);
  const applying = useRef(0); // remote-driven changes in flight: don't echo them back
  const pending = useRef<{ playing: boolean; position: number } | null>(null); // room state to apply once the video is ready
  const indicatorTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const applyRemote = (st: { playing: boolean; position: number }) => {
    const v = videoRef.current;
    if (!v || v.readyState < 1) {
      pending.current = st;
      return;
    }
    const plan = planSync({ playing: !v.paused, position: v.currentTime }, st);
    if (!plan) return;
    applying.current = Date.now() + 1000;
    if (plan.seek !== undefined) v.currentTime = plan.seek;
    // Browsers refuse unmuted autoplay until the viewer has interacted with the page: fall back to muted.
    if (plan.play === true)
      v.play().catch(() => {
        v.muted = true;
        v.play().catch(() => {});
        setIndicator("Playing muted: use the volume control to unmute.");
      });
    if (plan.play === false) v.pause();
  };
  const inParty = useRef(false);
  useEffect(() => {
    inParty.current = !!partyCode;
  });
  const room = useParty(partyCode, {
    onState: (st: RemoteState) => {
      clearTimeout(indicatorTimer.current);
      setIndicator(describeSync(st.byName, st));
      indicatorTimer.current = setTimeout(() => setIndicator(null), 6000);
      applyRemote(st);
    },
    onJoined: (r) => {
      // Arriving by deliberate navigation (next episode…) moves the room here and restarts it; the old episode's position is irrelevant.
      const moved = party?.nav && (r.titleId !== titleId || r.season !== season || r.episode !== episode);
      if (!moved) applyRemote(r.state);
    },
    onNav: (n) => router.push(partyWatchUrl(n, partyCode, false)),
    onCountdown: (c) => setCountdownAt(c.startsAt),
  });
  useEffect(() => () => clearTimeout(indicatorTimer.current), []);
  // After joining: a deliberate navigation (next episode, episode list) moves the room; a plain invite adopts the room's episode.
  const joinedRoom = room.status === "joined" ? room.room : undefined;
  useEffect(() => {
    if (!joinedRoom || !partyCode) return;
    const differs = joinedRoom.titleId !== titleId || joinedRoom.season !== season || joinedRoom.episode !== episode;
    if (!differs) return;
    if (party?.nav) room.sendNav({ titleId, season, episode });
    else router.replace(partyWatchUrl(joinedRoom, partyCode, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinedRoom]);

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
  // A frame that never fired `load` is dead: move on automatically (the manual button stays as a fallback).
  useEffect(() => {
    if (frame !== "slow" || nextPlayable(ordered, index) < 0) return;
    const t = setTimeout(() => select(nextPlayable(ordered, index)), AUTO_SWITCH_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, index]);
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

    const { introStart, introEnd, creditsStart } = markers ?? {};
    let autoSkipped = false;
    const onTime = () => {
      const t = video.currentTime;
      const inIntro = introStart !== undefined && introEnd !== undefined && t >= introStart && t < introEnd - SKIP_GRACE;
      // Profile setting: jump past the intro once, then leave seeking alone so the viewer can go back.
      if (inIntro && prefsRef.current.autoSkipIntro && !autoSkipped && introEnd !== undefined) {
        autoSkipped = true;
        video.currentTime = introEnd;
        return;
      }
      setShowSkip(introStart !== undefined && introEnd !== undefined && t >= introStart && t < introEnd - SKIP_GRACE);
      setUpNext(!!nextHref && creditsStart !== undefined && t >= creditsStart);
    };
    const onEnded = () => {
      save();
      // The profile can turn auto-advance off; the "Next episode" button stays available.
      if (nextHref && prefsRef.current.autoplayNext) setCountdown(NEXT_COUNTDOWN);
      else if (nextHref) setUpNext(true);
    };

    (async () => {
      const shaka = (await import("shaka-player")).default;
      shaka.polyfill.installAll();
      if (cancelled) return;
      player = new shaka.Player();
      await player.attach(video);
      player.addEventListener("error", () => next());
      // In a watch party the room decides where playback is and whether it is playing, not this viewer's history.
      const resume = inParty.current ? undefined : (await getHistory().catch(() => [])).find((h) => h.title.slug === titleId && h.episodeId === epKey);
      const pos = resume && resume.positionSec < resume.durationSec - 10 ? resume.positionSec : undefined;
      await player.load(url, pos);
      if (cancelled) return;
      shakaRef.current = player;
      const sync = () => setTracks(readTracks(player!));
      for (const ev of ["trackschanged", "textchanged", "variantchanged"]) player.addEventListener(ev, sync);
      try {
        applyTrackPrefs(player, prefsRef.current);
      } catch {}
      sync();
      if (!inParty.current) video.play().catch(() => {});
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
      shakaRef.current = null;
      setTracks(null);
      player?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideo, url, titleId]);

  // Local play/pause/seek go to the room, but only once the video is ready (so joining doesn't drag everyone to 0:00).
  useEffect(() => {
    const v = videoRef.current;
    if (!isVideo || !v || room.status !== "joined") return;
    let armed = false;
    let armTimer: ReturnType<typeof setTimeout> | undefined;
    const ready = () => {
      if (pending.current) {
        applyRemote(pending.current);
        pending.current = null;
      }
      armTimer = setTimeout(() => (armed = true), 300);
    };
    const local = () => {
      if (!armed || Date.now() < applying.current) return;
      room.sendState(!v.paused, v.currentTime);
    };
    if (v.readyState >= 1) ready();
    else v.addEventListener("loadedmetadata", ready, { once: true });
    const events = ["play", "pause", "seeked"] as const;
    events.forEach((e) => v.addEventListener(e, local));
    return () => {
      clearTimeout(armTimer);
      v.removeEventListener("loadedmetadata", ready);
      events.forEach((e) => v.removeEventListener(e, local));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideo, url, room.status]);

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
        <Stage label={`Connecting to ${source.label}`} />
      ) : (
        <div className="on-dark relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
          {partyCode && <PartyOverlay party={room} countdownAt={countdownAt} />}
          {isVideo && (
            <>
              <video ref={videoRef} playsInline data-cue={prefs.subtitleSize} className="size-full" />
              <VideoControls
                videoRef={videoRef}
                cast={cast}
                sources={ordered}
                activeSourceId={source.id}
                onSelectSource={(i) => select(i, true)}
                previewSrc={token.type === "direct" ? token.url : undefined}
                tracks={tracks ?? undefined}
                onSubtitle={(id, lang) => {
                  const p = shakaRef.current;
                  if (!p) return;
                  if (id === null) p.selectTextTrack(null);
                  else {
                    const t = p.getTextTracks().find((x) => x.id === id);
                    if (t) p.selectTextTrack(t);
                  }
                  saveProfilePrefs({ subtitleLang: id === null ? "" : lang }).catch(() => {});
                }}
                onAudio={(lang) => {
                  const p = shakaRef.current;
                  const track = p?.getAudioTracks().find((t) => t.language === lang);
                  if (p && track) p.selectAudioTrack(track);
                  saveProfilePrefs({ audioLang: lang }).catch(() => {});
                }}
              />
              {showSkip && countdown === null && (
                <button
                  onClick={() => {
                    if (videoRef.current && markers?.introEnd !== undefined) videoRef.current.currentTime = markers.introEnd;
                  }}
                  className="glass absolute bottom-20 right-4 rounded-full px-4 py-2 text-sm font-semibold"
                >
                  Skip intro
                </button>
              )}
              {upNext && countdown === null && nextHref && (
                <div className="glass absolute bottom-20 right-4 flex items-center gap-3 rounded-2xl p-2 pl-4">
                  <span className="text-sm text-white/80">Up next</span>
                  <button onClick={() => router.push(nextHref)} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black">Next episode</button>
                </div>
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
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/80">
              <CineoraLoader label={`Loading ${source.label}`} />
            </div>
          )}
          {isFrame && frame === "loaded" && nextPlayable(ordered, index) >= 0 && (
            <button
              onClick={() => select(nextPlayable(ordered, index), true)}
              className="glass absolute right-3 top-3 z-10 rounded-full px-3 py-1 text-xs font-medium text-white/80 opacity-60 transition hover:opacity-100 focus:opacity-100"
            >
              Not playing? Switch server
            </button>
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
      <PartyPanel party={room} code={partyCode} page={{ titleId, season, episode }} indicator={indicator} controllable={isVideo} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ReportSource
          key={`${source.id}|${season}|${episode}`}
          titleId={titleId}
          sourceKey={source.providerSlug ? `provider:${source.providerSlug}` : source.id}
          sourceLabel={source.label}
          season={season}
          episode={episode}
          onReported={() => nextPlayable(ordered, index) >= 0 && select(nextPlayable(ordered, index))}
        />
      </div>
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

/** Snapshot of the subtitle and audio choices the stream offers, for the controls' menu. */
function readTracks(player: shaka.Player): TrackMenu {
  const text = player.getTextTracks();
  const audio = player.getAudioTracks();
  return {
    subtitles: text.map((t) => ({ id: t.id, lang: t.language, label: t.label || langLabel(t.language) })),
    subtitleId: text.find((t) => t.active)?.id ?? null,
    audio: [...new Set(audio.map((t) => t.language))].filter(Boolean).map((l) => ({ lang: l, label: langLabel(l) })),
    audioLang: audio.find((t) => t.active)?.language ?? "",
  };
}

const sameLang = (track: string, want: string) => track === want || track.startsWith(`${want}-`);

/** Applies the profile's language choices: preferred audio when the stream has it, subtitles on (matching language) or off. */
function applyTrackPrefs(player: shaka.Player, p: { audioLang: string; subtitleLang: string }) {
  const audio = p.audioLang ? player.getAudioTracks().find((t) => sameLang(t.language, p.audioLang)) : undefined;
  if (audio && !audio.active) player.selectAudioTrack(audio);
  const text = p.subtitleLang ? player.getTextTracks().find((t) => sameLang(t.language, p.subtitleLang)) : undefined;
  player.selectTextTrack(text ?? null);
}

function langLabel(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid aspect-video w-full place-items-center rounded-2xl border border-white/10 bg-black/60 text-white/70">
      <p>{children}</p>
    </div>
  );
}

function Stage({ label }: { label: string }) {
  return (
    <div className="on-dark grid aspect-video w-full place-items-center rounded-2xl border border-white/10 bg-[#050507]">
      <CineoraLoader label={label} />
    </div>
  );
}
