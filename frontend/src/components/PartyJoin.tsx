"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authed, ApiError } from "@/lib/client-api";
import { partyWatchUrl } from "@/lib/party-sync";
import { useUser } from "./useSession";

/** Invite landing: resolves the room code to its title/episode and drops the viewer into the watch page. */
export function PartyJoin({ code }: { code: string }) {
  const user = useUser();
  const router = useRouter();
  const [state, setState] = useState<{ error?: string; full?: boolean } | null>(null);

  useEffect(() => {
    if (!user) return;
    let live = true;
    authed<{ titleId: string; season?: number; episode?: number; full: boolean }>(`/party/${encodeURIComponent(code)}`)
      .then((r) => {
        if (!live) return;
        if (r.full) return setState({ full: true });
        router.replace(partyWatchUrl(r, code));
      })
      .catch((e) => live && setState({ error: e instanceof ApiError && e.status === 404 ? "This party has ended or the code is wrong." : "Couldn't open the party. Try again." }));
    return () => {
      live = false;
    };
  }, [user, code, router]);

  if (!user)
    return (
      <div className="glass w-full rounded-2xl p-6 text-center">
        <h1 className="text-xl font-semibold">You&apos;re invited to a watch party</h1>
        <p className="mt-2 text-sm text-white/60">Sign in to join room <span className="font-mono tracking-widest">{code}</span>.</p>
        <Link href={`/login?next=${encodeURIComponent(`/party/${code}`)}`} className="mt-5 inline-block rounded-full bg-white px-6 py-2 font-semibold text-black">Sign in</Link>
      </div>
    );
  if (state?.error || state?.full)
    return (
      <div className="glass w-full rounded-2xl p-6 text-center" role="alert">
        <h1 className="text-xl font-semibold">{state.full ? "This party is full" : "Can't join"}</h1>
        <p className="mt-2 text-sm text-white/60">{state.full ? "Ask the host to start a new room." : state.error}</p>
        <Link href="/" className="mt-5 inline-block rounded-full bg-white px-6 py-2 font-semibold text-black">Back home</Link>
      </div>
    );
  return <p className="text-white/60">Joining room {code}…</p>;
}
