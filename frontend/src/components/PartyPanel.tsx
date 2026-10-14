"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { partyWatchUrl } from "@/lib/party-sync";
import { useUser } from "./useSession";
import type { Party } from "./useParty";

export const REACTION_EMOJI = ["👍", "😂", "😮", "😢", "❤️", "👏", "🔥"] as const;

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** Chat, members, reactions and invite link for a watch party; or the "Watch together" starter when none is active. */
export function PartyPanel({
  party,
  code,
  page,
  indicator,
  controllable,
}: {
  party: Party;
  code: string | null;
  page: { titleId: string; season?: number; episode?: number };
  /** Latest sync message ("Sam paused at 2:05"). */
  indicator: string | null;
  /** The player is a real <video> we keep in sync; embeds only get the "press play together" countdown. */
  controllable: boolean;
}) {
  const router = useRouter();
  const user = useUser();
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState("");
  const [sendErr, setSendErr] = useState<string | null>(null);
  const log = useRef<HTMLUListElement>(null);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [party.chat.length]);

  async function start() {
    if (!user) return router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    setStarting(true);
    setErr(null);
    try {
      const c = await party.create(page);
      router.replace(partyWatchUrl(page, c));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't start a party");
    } finally {
      setStarting(false);
    }
  }

  if (!code) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={start} disabled={starting} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium hover:bg-white/20 disabled:opacity-50">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="9" cy="8" r="3.5" />
            <path d="M2 20c.7-3.6 3.4-5.5 7-5.5s6.3 1.9 7 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .6 3.5 2.3 4 5.2" />
          </svg>
          {starting ? "Starting…" : "Watch together"}
        </button>
        {err && <span className="text-sm text-red-300">{err}</span>}
      </div>
    );
  }

  const invite = typeof window === "undefined" ? "" : `${window.location.origin}/party/${code}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    setSendErr(await party.sendChat(t));
  }

  const names = [{ id: "me", name: user?.name || user?.email.split("@")[0] || "You", me: true }, ...party.members.map((m) => ({ ...m, me: false }))];

  return (
    <section aria-label="Watch party" className="glass mt-4 rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Watch party <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs tracking-widest">{code}</span></h2>
          <p className="mt-0.5 text-xs text-white/50" aria-live="polite">
            {party.status === "connecting" && "Connecting…"}
            {party.status === "error" && <span className="text-red-300">{party.error}</span>}
            {party.status === "joined" && (indicator ?? (controllable ? "Play, pause and seek stay in sync for everyone." : "This server can't be synced. Use “Press play together”."))}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {party.status === "joined" && !controllable && (
            <button type="button" onClick={party.countdown} className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white">Press play together</button>
          )}
          <button type="button" onClick={copy} className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium hover:bg-white/20">{copied ? "Link copied" : "Copy invite link"}</button>
          <button type="button" onClick={() => router.replace(partyWatchUrl(page, null))} className="rounded-full px-3 py-1.5 text-sm text-white/60 hover:bg-white/10 hover:text-white">Leave</button>
        </div>
      </div>

      <ul aria-label="In this party" className="mt-3 flex flex-wrap gap-2">
        {names.map((m) => (
          <li key={m.id} className="glass-soft flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs">
            <span aria-hidden className="grid size-5 place-items-center rounded-full bg-accent text-[10px] font-bold text-white">{(m.name || "?").slice(0, 1).toUpperCase()}</span>
            {m.name}{m.me && <span className="text-white/40">(you)</span>}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Reactions">
        {REACTION_EMOJI.map((e) => (
          <button key={e} type="button" onClick={() => party.react(e)} aria-label={`React ${e}`} className="grid size-9 place-items-center rounded-full bg-white/8 text-lg transition hover:scale-110 hover:bg-white/15">{e}</button>
        ))}
      </div>

      <ul ref={log} aria-label="Chat" aria-live="polite" className="mt-3 max-h-56 space-y-1.5 overflow-y-auto rounded-xl bg-black/20 p-3 text-sm">
        {party.chat.length === 0 && <li className="text-white/40">No messages yet. Say hi!</li>}
        {party.chat.map((m) => (
          <li key={m.id}>
            <span className={`font-semibold ${m.from === party.you ? "text-accent" : ""}`}>{m.name}</span>
            <span className="ml-2 text-[11px] text-white/35">{clock(m.at)}</span>
            <p className="break-words text-white/85">{m.text}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={send} className="mt-2 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Message the room" aria-label="Message" disabled={party.status !== "joined"} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50" />
        <button disabled={party.status !== "joined" || !text.trim()} className="rounded-full bg-white px-5 text-sm font-semibold text-black disabled:opacity-40">Send</button>
      </form>
      {sendErr && <p className="mt-1 text-xs text-red-300" role="alert">{sendErr}</p>}
    </section>
  );
}

/** Floating reactions and the "press play" countdown, laid over the video. */
export function PartyOverlay({ party, countdownAt }: { party: Party; countdownAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (countdownAt === null) return;
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [countdownAt]);
  const left = countdownAt === null ? null : Math.ceil((countdownAt - now) / 1000);
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
      {party.reactions.map((r, i) => (
        <span key={r.id} className="party-float absolute bottom-16 flex flex-col items-center" style={{ left: `${8 + ((i * 17 + r.at) % 80)}%` }}>
          <span className="text-4xl drop-shadow">{r.emoji}</span>
          <span className="mt-0.5 rounded bg-black/50 px-1.5 text-[10px]">{r.name}</span>
        </span>
      ))}
      {left !== null && left > -1 && (
        <div className="absolute inset-0 grid place-items-center bg-black/55">
          <span className="text-7xl font-black tabular-nums">{left > 0 ? left : "Play!"}</span>
        </div>
      )}
    </div>
  );
}
