"use client";

import { useEffect } from "react";
import { trackView } from "@/lib/client-api";

/** Reports a title-page view once per mount (the API dedupes per visitor), feeding the trending ranking. */
export function ViewBeacon({ titleId }: { titleId: string }) {
  useEffect(() => {
    void trackView(titleId);
  }, [titleId]);
  return null;
}
