"use client";

import { useSyncExternalStore } from "react";
import { loadSession, type User } from "@/lib/client-api";

function subscribe(cb: () => void) {
  window.addEventListener("cineora-auth", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("cineora-auth", cb);
    window.removeEventListener("storage", cb);
  };
}
// useSyncExternalStore needs a stable snapshot: cache by raw string.
let lastRaw: string | null | undefined;
let lastUser: User | null = null;
function snapshot(): User | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem("cineora.auth");
  } catch {}
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastUser = loadSession()?.user ?? null;
  }
  return lastUser;
}

/** Current signed-in user, or null (also null during SSR/hydration). */
export function useUser(): User | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
