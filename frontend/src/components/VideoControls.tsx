"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
const HIDE_MS = 2800;
const DOUBLE_TAP_MS = 280;
const PREFS_KEY = "cineora.player";

/** Volume, mute and speed persist across titles and visits. */
function loadPlayerPrefs(): { volume?: number; muted?: boolean; rate?: number } {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function savePlayerPrefs(v: HTMLVideoElement) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ volume: v.volume, muted: v.muted, rate: v.playbackRate }));
  } catch {}
}

/** h:mm:ss always, e.g. 0:00:06 / 2:10:08. */
const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  return `${h}:${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

function Svg({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {children}
    </svg>
  );
}
const Play = () => <Svg><polygon points="6 3 20 12 6 21 6 3" /></Svg>;
const Pause = () => <Svg><rect x="14" y="4" width="4" height="16" rx="1" /><rect x="6" y="4" width="4" height="16" rx="1" /></Svg>;
const Skip = ({ back }: { back?: boolean }) => (
  <Svg>
    {back ? <><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></> : <><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></>}
    <text x="12" y="15.5" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor" stroke="none">10</text>
  </Svg>
);
const Vol = ({ level }: { level: 0 | 1 | 2 }) => (
  <Svg>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    {level === 0 && <><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" /></>}
    {level >= 1 && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
    {level === 2 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
  </Svg>
);
const Server = () => <Svg><rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" /></Svg>;
const Gear = () => <Svg><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></Svg>;
const Pip = () => <Svg><path d="M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8" /><rect x="2" y="13" width="10" height="8" rx="2" /></Svg>;
const Maximize = ({ exit }: { exit?: boolean }) => (
  <Svg>
    {exit ? <><path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" /></> : <><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></>}
  </Svg>
);

export interface ControlSource {
  id: string;
  label: string;
  state: "enabled" | "disabled" | "unconfigured";
}

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  sources?: ControlSource[];
  activeSourceId?: string;
  onSelectSource?: (index: number) => void;
  /** Plain video file URL; enables a frame preview while scrubbing (not possible for segmented HLS). */
  previewSrc?: string;
}

/** Overlay controls for a <video> inside a relatively positioned parent (which is also the full-screen target). */
export function VideoControls({ videoRef, sources = [], activeSourceId, onSelectSource, previewSrc }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [s, setS] = useState({ playing: false, time: 0, duration: 0, buffered: 0, volume: 1, muted: false, rate: 1 });
  const [waiting, setWaiting] = useState(false);
  const [shown, setShown] = useState(true);
  const [fs, setFs] = useState(false);
  const [menu, setMenu] = useState<null | "settings" | "sources">(null);
  const [osd, setOsd] = useState<{ text: string; n: number } | null>(null);
  const [scrub, setScrub] = useState<{ x: number; t: number; w: number } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const osdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastTap = useRef<{ t: number; x: number } | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pointerType = useRef("mouse");

  const flash = useCallback((text: string) => {
    setOsd((o) => ({ text, n: (o?.n ?? 0) + 1 }));
    clearTimeout(osdTimer.current);
    osdTimer.current = setTimeout(() => setOsd(null), 700);
  }, []);

  const wake = useCallback(() => {
    setShown(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setShown(false);
        setMenu(null);
      }
    }, HIDE_MS);
  }, [videoRef]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const saved = loadPlayerPrefs();
    if (typeof saved.volume === "number") v.volume = Math.min(1, Math.max(0, saved.volume));
    if (typeof saved.muted === "boolean") v.muted = saved.muted;
    if (typeof saved.rate === "number" && RATES.includes(saved.rate)) v.playbackRate = saved.rate;
    const persist = () => savePlayerPrefs(v);
    v.addEventListener("volumechange", persist);
    v.addEventListener("ratechange", persist);
    const sync = () =>
      setS({
        playing: !v.paused && !v.ended,
        time: v.currentTime,
        duration: v.duration || 0,
        buffered: v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0,
        volume: v.volume,
        muted: v.muted,
        rate: v.playbackRate,
      });
    const wait = () => setWaiting(true);
    const ready = () => setWaiting(false);
    const evs = ["play", "pause", "ended", "timeupdate", "durationchange", "progress", "volumechange", "ratechange", "seeked"];
    evs.forEach((e) => v.addEventListener(e, sync));
    v.addEventListener("waiting", wait);
    v.addEventListener("playing", ready);
    v.addEventListener("canplay", ready);
    sync();
    return () => {
      evs.forEach((e) => v.removeEventListener(e, sync));
      v.removeEventListener("waiting", wait);
      v.removeEventListener("playing", ready);
      v.removeEventListener("canplay", ready);
      v.removeEventListener("volumechange", persist);
      v.removeEventListener("ratechange", persist);
      clearTimeout(hideTimer.current);
      clearTimeout(osdTimer.current);
      clearTimeout(tapTimer.current);
    };
  }, [videoRef]);

  useEffect(() => {
    const onFs = () => setFs(document.fullscreenElement === rootRef.current?.parentElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
    wake();
  };
  const skip = (d: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = Math.max(0, Math.min(v.duration || Infinity, v.currentTime + d));
    flash(`${d > 0 ? "+" : "−"}${Math.abs(d)}s`);
    wake();
  };
  const setVolume = (x: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = Math.min(1, Math.max(0, x));
    v.muted = v.volume === 0;
  };
  const nudgeVolume = (d: number) => {
    const v = videoRef.current;
    if (!v) return;
    setVolume((v.muted ? 0 : v.volume) + d);
    flash(`Volume ${Math.round(v.volume * 100)}%`);
    wake();
  };
  const mute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    flash(v.muted ? "Muted" : `Volume ${Math.round(v.volume * 100)}%`);
  };
  const fullscreen = () => {
    const el = rootRef.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen?.().catch(() => {});
  };
  const pip = () => {
    const v = videoRef.current;
    if (!v || !document.pictureInPictureEnabled) return;
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
    else v.requestPictureInPicture().catch(() => {});
  };

  // Shortcuts work anywhere on the page while the player is mounted, except when typing or on a control that owns the key.
  const keyRef = useRef<(e: KeyboardEvent) => void>(undefined);
  const onShortcut = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target as HTMLElement;
    if (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) {
      // The seek/volume sliders handle arrows themselves; everything else is theirs too.
      return;
    }
    if ((e.key === " " || e.key === "Enter") && ["BUTTON", "A"].includes(el.tagName)) return;
    const k = e.key.toLowerCase();
    const keys: Record<string, () => void> = {
      " ": toggle,
      k: toggle,
      arrowleft: () => skip(-5),
      arrowright: () => skip(5),
      j: () => skip(-10),
      l: () => skip(10),
      arrowup: () => nudgeVolume(0.1),
      arrowdown: () => nudgeVolume(-0.1),
      m: mute,
      f: fullscreen,
      p: pip,
    };
    const digit = /^[0-9]$/.test(k) ? Number(k) : -1;
    if (digit >= 0) {
      const v = videoRef.current;
      if (v?.duration) v.currentTime = (v.duration * digit) / 10;
      flash(`${digit * 10}%`);
      wake();
    } else if (keys[k]) keys[k]();
    else return;
    e.preventDefault();
  };
  useEffect(() => {
    keyRef.current = onShortcut;
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current?.(e);
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  /** Touch: single tap shows/hides controls, double tap on either side seeks 10s, centre toggles play. Mouse: click plays, double-click goes full screen. */
  const onSurfaceClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (pointerType.current !== "touch") {
      if (e.detail >= 2) fullscreen();
      else toggle();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const now = Date.now();
    const prev = lastTap.current;
    clearTimeout(tapTimer.current);
    if (prev && now - prev.t < DOUBLE_TAP_MS) {
      lastTap.current = null;
      if (x < 0.35) skip(-10);
      else if (x > 0.65) skip(10);
      else toggle();
      return;
    }
    lastTap.current = { t: now, x };
    tapTimer.current = setTimeout(() => {
      lastTap.current = null;
      if (shown && s.playing) setShown(false);
      else wake();
    }, DOUBLE_TAP_MS);
  };

  const onScrubMove = (e: React.PointerEvent) => {
    const bar = barRef.current;
    if (!bar || !s.duration) return;
    const r = bar.getBoundingClientRect();
    const x = Math.min(r.width, Math.max(0, e.clientX - r.left));
    const t = (x / r.width) * s.duration;
    setScrub({ x, t, w: r.width });
    if (previewRef.current && Number.isFinite(t)) previewRef.current.currentTime = t;
  };

  const visible = shown || !s.playing;
  const pct = (n: number) => (s.duration ? Math.min(100, (n / s.duration) * 100) : 0);
  const btn = "grid place-items-center rounded-full p-2.5 text-3xl text-white/90 transition duration-100 hover:bg-white/15 hover:text-white active:scale-110 focus-visible:outline-2 focus-visible:outline-accent sm:text-4xl";
  const fade = `transition-opacity duration-200 ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`;
  const volLevel = s.muted || s.volume === 0 ? 0 : s.volume < 0.5 ? 1 : 2;

  return (
    <div
      ref={rootRef}
      onMouseMove={wake}
      onTouchStart={wake}
      onFocus={wake}
      className={`absolute inset-0 select-none text-white outline-none ${visible ? "" : "cursor-none"}`}
    >
      {/* Click surface + centre button / buffering spinner */}
      <button
        type="button"
        aria-label={s.playing ? "Pause" : "Play"}
        onPointerDown={(e) => (pointerType.current = e.pointerType)}
        onClick={onSurfaceClick}
        className="absolute inset-0 grid place-items-center"
      >
        {waiting ? (
          <span className="size-14 animate-spin rounded-full border-4 border-white/30 border-t-white" role="status" aria-label="Buffering" />
        ) : (
          !s.playing && <span className="rounded-full p-3 text-6xl transition hover:bg-white/15"><Play /></span>
        )}
      </button>

      {osd && (
        <div key={osd.n} role="status" className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 rounded-full bg-black/70 px-5 py-2 text-lg font-semibold tabular-nums">
          {osd.text}
        </div>
      )}

      {/* Top bar: sources */}
      <div className={`pointer-events-none absolute inset-x-0 top-0 flex justify-end bg-gradient-to-b from-black/80 to-transparent px-4 pb-20 pt-4 sm:px-8 ${fade}`}>
        {sources.length > 1 && (
          <div className="pointer-events-auto relative">
            <button type="button" aria-label="Sources" aria-expanded={menu === "sources"} onClick={() => setMenu(menu === "sources" ? null : "sources")} className={btn}>
              <Server />
            </button>
            {menu === "sources" && (
              <ul role="menu" aria-label="Sources" className="glass absolute right-0 top-14 z-10 max-h-72 w-60 overflow-y-auto rounded-xl p-1">
                {sources.map((src, i) => (
                  <li key={src.id} role="none">
                    <button
                      role="menuitemradio"
                      aria-checked={src.id === activeSourceId}
                      disabled={src.state !== "enabled"}
                      onClick={() => {
                        setMenu(null);
                        onSelectSource?.(i);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${src.id === activeSourceId ? "text-accent" : ""}`}
                    >
                      <span>{src.label}</span>
                      {src.state !== "enabled" && <span className="text-xs">{src.state === "unconfigured" ? "not configured" : "disabled"}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Bottom bar: progress, then controls */}
      <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-4 pb-3 pt-24 sm:px-8 ${fade}`}>
        <div
          ref={barRef}
          onPointerMove={onScrubMove}
          onPointerLeave={() => setScrub(null)}
          className="group relative flex h-8 items-center"
        >
          {scrub && (
            <div
              className="pointer-events-none absolute bottom-9 -translate-x-1/2 text-center"
              style={{ left: Math.min(Math.max(scrub.x, 80), scrub.w - 80) }}
            >
              {previewSrc && (
                <video ref={previewRef} src={previewSrc} muted preload="auto" playsInline tabIndex={-1} aria-hidden className="mb-1 aspect-video w-40 rounded-lg border border-white/20 bg-black object-cover" />
              )}
              <span className="rounded bg-black/80 px-2 py-0.5 text-xs tabular-nums">{fmt(scrub.t)}</span>
            </div>
          )}
          <div className="relative h-1 w-full rounded-full bg-white/25 transition-[height] duration-100 group-hover:h-1.5">
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/40" style={{ width: `${pct(s.buffered)}%` }} />
            <div className="absolute inset-y-0 left-0 flex items-center justify-end rounded-full bg-accent" style={{ width: `${pct(s.time)}%` }}>
              <div className="size-4 min-w-4 translate-x-1/2 scale-0 rounded-full bg-white transition-transform duration-100 group-hover:scale-100" />
            </div>
          </div>
          <input
            type="range"
            aria-label="Seek"
            aria-valuetext={`${fmt(s.time)} of ${fmt(s.duration)}`}
            min={0}
            max={s.duration || 0}
            step={1}
            value={s.time}
            onChange={(e) => videoRef.current && (videoRef.current.currentTime = Number(e.target.value))}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 sm:gap-3">
            <button type="button" aria-label={s.playing ? "Pause" : "Play"} onClick={toggle} className={btn}>{s.playing ? <Pause /> : <Play />}</button>
            <button type="button" aria-label="Back 10 seconds" title="Back 10 seconds (J)" onClick={() => skip(-10)} className={btn}><Skip back /></button>
            <button type="button" aria-label="Forward 10 seconds" title="Forward 10 seconds (L)" onClick={() => skip(10)} className={btn}><Skip /></button>
            <div className="group/vol flex items-center">
              <button type="button" aria-label={volLevel === 0 ? "Unmute" : "Mute"} onClick={mute} className={`${btn} !text-2xl`}><Vol level={volLevel} /></button>
              <input
                type="range"
                aria-label="Volume"
                min={0}
                max={1}
                step={0.05}
                value={s.muted ? 0 : s.volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="-ml-1 hidden w-0 opacity-0 transition-[width,opacity] duration-300 accent-[var(--accent)] focus:w-20 focus:opacity-100 group-hover/vol:w-20 group-hover/vol:opacity-100 sm:block"
              />
            </div>
            <span className="ml-1 hidden whitespace-nowrap text-sm tabular-nums text-white/85 sm:block">{fmt(s.time)} / {fmt(s.duration)}</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-3">
            <div className="relative">
              <button type="button" aria-label="Settings" aria-expanded={menu === "settings"} onClick={() => setMenu(menu === "settings" ? null : "settings")} className={btn}><Gear /></button>
              {menu === "settings" && (
                <div role="group" aria-label="Playback speed" className="glass absolute bottom-16 right-0 z-10 w-36 rounded-xl p-1">
                  <p className="px-3 pb-1 pt-2 text-xs uppercase tracking-wider text-white/50">Speed</p>
                  {RATES.map((r) => (
                    <button
                      key={r}
                      role="menuitemradio"
                      aria-checked={r === s.rate}
                      onClick={() => {
                        if (videoRef.current) videoRef.current.playbackRate = r;
                        setMenu(null);
                      }}
                      className={`w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-white/10 ${r === s.rate ? "text-accent" : ""}`}
                    >
                      {r === 1 ? "Normal" : `${r}×`}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" aria-label="Picture in picture" onClick={pip} className={btn}><Pip /></button>
            <button type="button" aria-label={fs ? "Exit full screen" : "Full screen"} onClick={fullscreen} className={btn}><Maximize exit={fs} /></button>
          </div>
        </div>
        <span className="mt-1 block text-center text-xs tabular-nums text-white/70 sm:hidden">{fmt(s.time)} / {fmt(s.duration)}</span>
      </div>
    </div>
  );
}
