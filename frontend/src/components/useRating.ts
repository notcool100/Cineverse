"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRating, setRating } from "@/lib/client-api";
import { useUser } from "./useSession";

/** Thumbs state for one title (1 up, -1 down, 0 none) with optimistic toggling; signed-out users are sent to sign in. */
export function useRating(titleId: string, next: string, enabled = true) {
  const router = useRouter();
  const user = useUser();
  const [rating, setRatingState] = useState(0);
  useEffect(() => {
    if (!user || !enabled) return;
    let live = true;
    getRating(titleId).then((v) => live && setRatingState(v)).catch(() => {});
    return () => {
      live = false;
    };
  }, [user, titleId, enabled]);

  const rate = useCallback(
    async (value: 1 | -1) => {
      if (!user) return router.push(`/login?next=${encodeURIComponent(next)}`);
      const was = rating;
      const to = was === value ? 0 : value;
      setRatingState(to);
      try {
        await setRating(titleId, to);
      } catch {
        setRatingState(was);
      }
    },
    [user, rating, titleId, next, router],
  );
  return { rating, rate };
}
