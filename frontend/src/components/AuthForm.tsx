"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "@/lib/client-api";

export function AuthForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await signIn(mode, {
        email: String(f.get("email")),
        password: String(f.get("password")),
        ...(mode === "register" && f.get("name") ? { name: String(f.get("name")) } : {}),
      });
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none focus:border-white/40";
  return (
    <form onSubmit={onSubmit} className="glass space-y-4 rounded-3xl p-7">
      <h1 className="text-2xl font-bold">{mode === "login" ? "Sign in" : "Create account"}</h1>
      {mode === "register" && <input name="name" placeholder="Name (optional)" autoComplete="name" className={input} />}
      <input name="email" type="email" required placeholder="Email" autoComplete="email" className={input} />
      <input
        name="password"
        type="password"
        required
        minLength={mode === "register" ? 8 : undefined}
        placeholder="Password"
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        className={input}
      />
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <button
        disabled={busy}
        className="w-full rounded-full bg-accent py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Sign up"}
      </button>
      <button
        type="button"
        onClick={() => setMode(mode === "login" ? "register" : "login")}
        className="w-full text-center text-sm text-white/55 hover:text-white"
      >
        {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
      </button>
    </form>
  );
}
