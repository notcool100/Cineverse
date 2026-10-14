"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { forgotPassword, refreshMe, resetPassword, verifyEmail } from "@/lib/client-api";
import { useUser } from "./useSession";

const input = "w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none focus:border-white/40";
const primary = "w-full rounded-full bg-accent py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60";
const msg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass space-y-4 rounded-3xl p-7">
      <h1 className="text-2xl font-bold">{title}</h1>
      {children}
    </div>
  );
}

/** Asks for an email and sends a reset link. Always reports success, so it can't reveal which emails have accounts. */
export function ForgotPasswordForm() {
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email"));
    setBusy(true);
    setError(null);
    try {
      await forgotPassword(email);
      setSent(email);
    } catch (err) {
      setError(msg(err));
    } finally {
      setBusy(false);
    }
  }
  if (sent)
    return (
      <Card title="Check your email">
        <p className="text-sm text-white/70">If an account exists for <b>{sent}</b>, we&apos;ve sent a link to reset the password. It&apos;s valid for one hour.</p>
        <Link href="/login" className="block text-center text-sm text-white/55 hover:text-white">Back to sign in</Link>
      </Card>
    );
  return (
    <form onSubmit={submit}>
      <Card title="Forgot your password?">
        <p className="text-sm text-white/60">Enter your email and we&apos;ll send you a link to choose a new one.</p>
        <input name="email" type="email" required placeholder="Email" autoComplete="email" className={input} />
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <button disabled={busy} className={primary}>{busy ? "Sending…" : "Send reset link"}</button>
        <Link href="/login" className="block text-center text-sm text-white/55 hover:text-white">Back to sign in</Link>
      </Card>
    </form>
  );
}

/** Landing page for the emailed reset link. */
export function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password"));
    if (password !== String(f.get("confirm"))) return setError("The two passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token, password);
      setDone(true);
      setTimeout(() => router.push("/login"), 1800);
    } catch (err) {
      setError(msg(err));
    } finally {
      setBusy(false);
    }
  }
  if (!token)
    return (
      <Card title="Link missing">
        <p className="text-sm text-white/70">This page needs the link from your email. <Link href="/forgot-password" className="text-accent underline">Request a new one</Link>.</p>
      </Card>
    );
  if (done)
    return (
      <Card title="Password updated">
        <p className="text-sm text-white/70">You&apos;ve been signed out everywhere. Taking you to sign in…</p>
      </Card>
    );
  return (
    <form onSubmit={submit}>
      <Card title="Choose a new password">
        <input name="password" type="password" required minLength={8} placeholder="New password (8+ characters)" autoComplete="new-password" className={input} />
        <input name="confirm" type="password" required minLength={8} placeholder="Repeat the password" autoComplete="new-password" className={input} />
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error} {/invalid|expired/i.test(error) && <Link href="/forgot-password" className="underline">Request a new link</Link>}
          </p>
        )}
        <button disabled={busy} className={primary}>{busy ? "Saving…" : "Update password"}</button>
      </Card>
    </form>
  );
}

/** Landing page for the emailed verification link: confirms once, then reports the result. */
export function VerifyEmailStatus() {
  const token = useSearchParams().get("token") ?? "";
  const user = useUser();
  const [state, setState] = useState<"working" | "ok" | "error">(token ? "working" : "error");
  const [error, setError] = useState<string | null>(token ? null : "This page needs the link from your email.");
  const once = useRef(false);

  useEffect(() => {
    if (!token || once.current) return; // tokens are single-use: never submit twice (dev strict mode)
    once.current = true;
    verifyEmail(token)
      .then(() => {
        setState("ok");
        return refreshMe().catch(() => null); // update the stored session so the reminder banner goes away
      })
      .catch((e) => {
        setError(msg(e));
        setState("error");
      });
  }, [token]);

  return (
    <Card title={state === "ok" ? "Email confirmed" : state === "error" ? "Couldn't confirm" : "Confirming…"}>
      {state === "working" && <p className="text-sm text-white/60">One moment.</p>}
      {state === "ok" && <p className="text-sm text-white/70">Thanks, your email address is verified.</p>}
      {state === "error" && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <Link href={user ? "/" : "/login"} className="block text-center text-sm text-white/55 hover:text-white">{user ? "Continue to Cineora" : "Go to sign in"}</Link>
    </Card>
  );
}
