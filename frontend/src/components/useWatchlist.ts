"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { addToWatchlist, getWatchlist, removeFromWatchlist } from "@/lib/client-api";
import { useUser } from "./useSession";

/** My List state for one title, with optimistic toggle; signed-out users are sent to sign in. */
export function useWatchlist(titleId: string, next: string) {
  const router = useRouter();
  const user = useUser();
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!user) return;
    let live = true;
    getWatchlist()
      .then((rows) => live && setSaved(rows.some((r) => r.title.slug === titleId)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [user, titleId]);
  const toggle = useCallback(async () => {
    if (!user) return router.push(`/login?next=${encodeURIComponent(next)}`);
    const was = saved;
    setSaved(!was);
    try {
      await (was ? removeFromWatchlist(titleId) : addToWatchlist(titleId));
    } catch {
      setSaved(was);
    }
  }, [user, saved, titleId, next, router]);
  return { saved, toggle };
}
