"use client";

import { useEffect, useRef, useState } from "react";
import { REPORT_REASONS, reportSource, type ReportReason } from "@/lib/client-api";

/** "Report broken source" (give it a `key` per source/episode so each gets a fresh form): tells admins which server failed; enough reports hide it automatically. */
export function ReportSource({
  titleId,
  sourceKey,
  sourceLabel,
  season,
  episode,
  onReported,
}: {
  titleId: string;
  sourceKey: string;
  sourceLabel: string;
  season?: number;
  episode?: number;
  /** Called after a successful report so the player can move on to another server. */
  onReported?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("BROKEN");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    try {
      await reportSource({ titleId, sourceKey, season, episode, reason, note: note.trim() || undefined });
      setState("done");
      setNote("");
      setOpen(false);
      onReported?.();
    } catch {
      setState("error");
    }
  }

  return (
    <div ref={box} className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        disabled={state === "done"}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 22V4a1 1 0 0 1 1-1h13l-2 5 2 5H5" />
        </svg>
        {state === "done" ? "Thanks, reported" : "Report a problem"}
      </button>
      {open && (
        <form onSubmit={submit} className="glass-menu absolute bottom-full left-0 z-30 mb-2 w-72 space-y-3 rounded-2xl p-4 text-sm">
          <p className="font-semibold">Problem with {sourceLabel}</p>
          <label className="block text-xs text-white/55">
            What went wrong?
            <select value={reason} onChange={(e) => setReason(e.target.value as ReportReason)} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-white outline-none focus:border-accent">
              {REPORT_REASONS.map((r) => (
                <option key={r.value} value={r.value} className="bg-neutral-900">{r.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-white/55">
            Details (optional)
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-white outline-none focus:border-accent" />
          </label>
          {state === "error" && <p className="text-xs text-red-300">Couldn&apos;t send the report. Try again.</p>}
          <button disabled={state === "sending"} className="w-full rounded-full bg-white py-2 font-semibold text-black disabled:opacity-50">
            {state === "sending" ? "Sending…" : "Send report"}
          </button>
        </form>
      )}
    </div>
  );
}
