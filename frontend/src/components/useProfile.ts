"use client";

import { useSyncExternalStore } from "react";
import { loadProfile, type Profile } from "@/lib/client-api";

function subscribe(cb: () => void) {
  window.addEventListener("cineora-profile", cb);
  window.addEventListener("cineora-auth", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("cineora-profile", cb);
    window.removeEventListener("cineora-auth", cb);
    window.removeEventListener("storage", cb);
  };
}
let lastRaw: string | null | undefined;
let last: Profile | null = null;
function snapshot(): Profile | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem("cineora.profile") + "|" + localStorage.getItem("cineora.auth");
  } catch {}
  if (raw !== lastRaw) {
    lastRaw = raw;
    last = loadProfile();
  }
  return last;
}

/** The active profile for the signed-in account, or null (also null during SSR/hydration). */
export function useProfile(): Profile | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

export const AVATARS = ["#e5484d", "#f76b15", "#ffc53d", "#30a46c", "#0091ff", "#8e4ec6", "#e93d82", "#6e56cf"];
export const avatarColor = (a: string) => AVATARS[Number(a) % AVATARS.length] ?? AVATARS[0];
