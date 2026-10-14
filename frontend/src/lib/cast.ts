// Thin wrapper over the Google Cast web sender SDK (loaded on demand) and the Remote Playback API (AirPlay / Chrome fallback).
// Only the small part of the SDK we use is typed.

interface CastSession {
  getCastDevice(): { friendlyName: string };
  getMediaSession(): { media: { contentId: string } } | null;
  loadMedia(req: unknown): Promise<string | undefined>;
  endSession(stopCasting: boolean): void;
}
interface CastContext {
  setOptions(o: unknown): void;
  requestSession(): Promise<string | null>;
  getCurrentSession(): CastSession | null;
  addEventListener(type: string, cb: (e: { sessionState: string }) => void): void;
  removeEventListener(type: string, cb: (e: { sessionState: string }) => void): void;
}
interface RemotePlayer {
  isPaused: boolean;
  currentTime: number;
  isConnected: boolean;
}
interface RemotePlayerController {
  playOrPause(): void;
  seek(): void;
  addEventListener(type: string, cb: () => void): void;
  removeEventListener(type: string, cb: () => void): void;
}
interface CastApi {
  framework: {
    CastContext: { getInstance(): CastContext };
    RemotePlayer: new () => RemotePlayer;
    RemotePlayerController: new (p: RemotePlayer) => RemotePlayerController;
    RemotePlayerEventType: { IS_PAUSED_CHANGED: string; CURRENT_TIME_CHANGED: string };
    CastContextEventType: { SESSION_STATE_CHANGED: string };
    SessionState: { SESSION_STARTED: string; SESSION_RESUMED: string; SESSION_ENDED: string };
  };
}
interface ChromeCast {
  media: {
    DEFAULT_MEDIA_RECEIVER_APP_ID: string;
    MediaInfo: new (url: string, contentType: string) => { metadata?: unknown; streamType?: string };
    GenericMediaMetadata: new () => { title?: string };
    LoadRequest: new (m: unknown) => { currentTime?: number; autoplay?: boolean };
    StreamType: { BUFFERED: string };
  };
  AutoJoinPolicy: { ORIGIN_SCOPED: string };
}

declare global {
  interface Window {
    cast?: CastApi;
    chrome?: { cast?: ChromeCast };
    __onGCastApiAvailable?: (available: boolean) => void;
  }
}

const SDK = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
let loading: Promise<boolean> | null = null;

/** Loads the Cast SDK once. Resolves false where Cast isn't supported (non-Chromium browsers) or the script is blocked. */
export function loadCast(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.cast?.framework) return Promise.resolve(true);
  loading ??= new Promise<boolean>((resolve) => {
    window.__onGCastApiAvailable = (ok) => {
      if (!ok || !window.cast?.framework || !window.chrome?.cast) return resolve(false);
      window.cast.framework.CastContext.getInstance().setOptions({
        receiverApplicationId: window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      });
      resolve(true);
    };
    const s = document.createElement("script");
    s.src = SDK;
    s.async = true;
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
    setTimeout(() => resolve(false), 8000);
  });
  return loading;
}

/** MIME type the receiver needs, from the URL. */
export function castContentType(url: string): string {
  const path = new URL(url, "http://x").pathname.toLowerCase();
  if (path.endsWith(".m3u8")) return "application/x-mpegurl";
  if (path.endsWith(".mpd")) return "application/dash+xml";
  if (path.endsWith(".webm")) return "video/webm";
  return "video/mp4";
}

/** The receiver (a Chromecast) fetches the URL itself, so it must be absolute and publicly reachable. */
export function castableUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && !["localhost", "127.0.0.1", "::1"].includes(u.hostname);
  } catch {
    return false;
  }
}

export type { CastSession, RemotePlayer, RemotePlayerController };
