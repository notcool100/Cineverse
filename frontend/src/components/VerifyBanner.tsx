"use client";

import { useEffect, useState } from "react";
import { refreshMe, requestVerification } from "@/lib/client-api";
import { useUser } from "./useSession";

const DISMISS_KEY = "cineora:verify-dismissed";

/** Gentle reminder to confirm the email address; hides itself once verified or dismissed for the session. */
export function VerifyBanner() {
  const user = useUser();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [note, setNote] = useState<string | null>(null);

  // The stored flag can be stale (verified from another tab or device): confirm with the server once per session.
  useEffect(() => {
    if (user && user.emailVerified === false) refreshMe().catch(() => {});
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user || user.emailVerified !== false || dismissed) return null;

  async function resend() {
    setState("sending");
    try {
      const r = await requestVerification();
      if (r.alreadyVerified) await refreshMe();
      setState("sent");
      setNote(null);
    } catch (e) {
      setState("error");
      setNote(e instanceof Error ? e.message : "Couldn't send the email");
    }
  }

  return (
    <div role="status" className="on-dark glass fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-3 rounded-2xl p-3 pl-4 text-sm md:inset-x-auto md:bottom-4 md:right-4 md:w-[26rem]">
      <p className="min-w-0 flex-1">
        {state === "sent" ? "Verification email sent. Check your inbox." : <>Confirm <b className="break-all">{user.email}</b> to secure your account.</>}
        {note && <span className="block text-xs text-red-300">{note}</span>}
      </p>
      {state !== "sent" && (
        <button onClick={resend} disabled={state === "sending"} className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-black disabled:opacity-50">
          {state === "sending" ? "Sending…" : "Resend email"}
        </button>
      )}
      <button
        onClick={() => {
          setDismissed(true);
          try {
            sessionStorage.setItem(DISMISS_KEY, "1");
          } catch {}
        }}
        aria-label="Dismiss"
        className="grid size-7 shrink-0 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>
  );
}
