"use client";

import { useSyncExternalStore } from "react";
import { loadProfilePrefs, PROFILE_PREF_DEFAULTS, PROFILE_PREFS_EVENT, type ProfilePrefs } from "@/lib/profile-prefs";
import { useProfile } from "./useProfile";

const subscribe = (cb: () => void) => {
  window.addEventListener(PROFILE_PREFS_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(PROFILE_PREFS_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

// useSyncExternalStore needs a referentially stable snapshot: cache by raw string.
let lastRaw: string | null | undefined;
let lastId: string | undefined;
let last: ProfilePrefs = PROFILE_PREF_DEFAULTS;

/** Playback preferences of the active profile (defaults while signed out or before the profile is known). */
export function useProfilePrefs(): ProfilePrefs {
  const profile = useProfile();
  const id = profile?.id;
  return useSyncExternalStore(
    subscribe,
    () => {
      let raw: string | null = null;
      try {
        raw = id ? localStorage.getItem(`cineora.profilePrefs.${id}`) : null;
      } catch {}
      if (raw !== lastRaw || id !== lastId) {
        lastRaw = raw;
        lastId = id;
        last = loadProfilePrefs(id);
      }
      return last;
    },
    () => PROFILE_PREF_DEFAULTS,
  );
}
