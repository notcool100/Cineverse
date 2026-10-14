"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { castableUrl, castContentType, loadCast, type RemotePlayer, type RemotePlayerController } from "@/lib/cast";

export type CastState = {
  /** A Cast session or a remote-playback target can be started from here. */
  available: boolean;
  /** Currently playing on another screen. */
  casting: boolean;
  deviceName: string | null;
  remotePaused: boolean;
  toggle: () => void;
  playPause: () => void;
  stop: () => void;
};

/**
 * Cast the <video> to a Chromecast (Google Cast SDK) or, where Cast isn't available, to an AirPlay / remote-playback
 * target. `url` is the stream the receiver should fetch; embedded players can't be cast, so pass undefined for them.
 */
export function useCast(videoRef: RefObject<HTMLVideoElement | null>, url: string | undefined, title: string): CastState {
  const [sdk, setSdk] = useState(false);
  const [remoteAvailable, setRemoteAvailable] = useState(false);
  const [device, setDevice] = useState<string | null>(null);
  const [remotePaused, setRemotePaused] = useState(false);
  const player = useRef<RemotePlayer | null>(null);
  const controller = useRef<RemotePlayerController | null>(null);
  const resumeAt = useRef<number | null>(null);
  const ok = !!url && castableUrl(url);

  // Cast SDK: only worth loading when this stream can actually be cast.
  useEffect(() => {
    if (!ok) return;
    let live = true;
    loadCast().then((v) => live && setSdk(v));
    return () => {
      live = false;
    };
  }, [ok]);

  // Remote Playback API availability (Safari AirPlay; Chromium without Cast).
  useEffect(() => {
    const v = videoRef.current as HTMLVideoElement | null;
    if (!ok || !v?.remote) return;
    let id: number | undefined;
    v.remote.watchAvailability((a) => setRemoteAvailable(a)).then((i) => (id = i)).catch(() => {});
    return () => {
      if (id !== undefined) v.remote?.cancelWatchAvailability(id).catch(() => {});
    };
  }, [ok, url, videoRef]);

  useEffect(() => {
    if (!sdk || !window.cast) return;
    const { framework } = window.cast;
    const ctx = framework.CastContext.getInstance();
    const p = new framework.RemotePlayer();
    const c = new framework.RemotePlayerController(p);
    player.current = p;
    controller.current = c;
    const onPause = () => setRemotePaused(p.isPaused);
    c.addEventListener(framework.RemotePlayerEventType.IS_PAUSED_CHANGED, onPause);
    const onSession = (e: { sessionState: string }) => {
      const S = framework.SessionState;
      if (e.sessionState === S.SESSION_ENDED) {
        // Pick the video back up where the TV left off.
        const v = videoRef.current;
        if (v && resumeAt.current !== null) v.currentTime = resumeAt.current;
        setDevice(null);
      } else if (e.sessionState === S.SESSION_STARTED || e.sessionState === S.SESSION_RESUMED) {
        setDevice(ctx.getCurrentSession()?.getCastDevice().friendlyName ?? "Chromecast");
      }
    };
    ctx.addEventListener(framework.CastContextEventType.SESSION_STATE_CHANGED, onSession);
    const keepTime = () => (resumeAt.current = p.currentTime);
    c.addEventListener(framework.RemotePlayerEventType.CURRENT_TIME_CHANGED, keepTime);
    return () => {
      c.removeEventListener(framework.RemotePlayerEventType.IS_PAUSED_CHANGED, onPause);
      c.removeEventListener(framework.RemotePlayerEventType.CURRENT_TIME_CHANGED, keepTime);
      ctx.removeEventListener(framework.CastContextEventType.SESSION_STATE_CHANGED, onSession);
    };
  }, [sdk, videoRef]);

  const toggle = useCallback(async () => {
    const v = videoRef.current as HTMLVideoElement | null;
    if (!v || !url) return;
    if (sdk && window.cast && window.chrome?.cast) {
      const ctx = window.cast.framework.CastContext.getInstance();
      try {
        if (!ctx.getCurrentSession()) await ctx.requestSession();
        const session = ctx.getCurrentSession();
        if (!session) return;
        const { media } = window.chrome.cast;
        const info = new media.MediaInfo(new URL(url, location.href).href, castContentType(url));
        info.streamType = media.StreamType.BUFFERED;
        const meta = new media.GenericMediaMetadata();
        meta.title = title;
        info.metadata = meta;
        const req = new media.LoadRequest(info);
        req.currentTime = v.currentTime;
        req.autoplay = !v.paused;
        await session.loadMedia(req);
        v.pause();
      } catch {
        // The viewer closed the device picker, or the receiver refused the stream; stay on this screen.
      }
    } else if (v.remote) {
      v.remote.prompt().catch(() => {});
    }
  }, [sdk, url, title, videoRef]);

  const stop = useCallback(() => {
    if (!sdk || !window.cast) return;
    window.cast.framework.CastContext.getInstance().getCurrentSession()?.endSession(true);
  }, [sdk]);

  return {
    available: ok && (sdk || remoteAvailable),
    casting: !!device,
    deviceName: device,
    remotePaused,
    toggle: () => void toggle(),
    playPause: () => controller.current?.playOrPause(),
    stop,
  };
}
