"use client";

import { authed, loadProfile } from "./client-api";
import { PROFILE_PREF_DEFAULTS, resolvePrefs, type ProfilePrefs } from "./profile-prefs-core";

export * from "./profile-prefs-core";

// Cached per profile in localStorage so the player and cards don't wait on a request; the server is the source of truth.
const key = (profileId: string) => `cineora.profilePrefs.${profileId}`;
const EVENT = "cineora-profile-prefs";

export function loadProfilePrefs(profileId: string | undefined): ProfilePrefs {
  if (!profileId) return PROFILE_PREF_DEFAULTS;
  try {
    return resolvePrefs(JSON.parse(localStorage.getItem(key(profileId)) ?? "null"));
  } catch {
    return PROFILE_PREF_DEFAULTS;
  }
}

function cache(profileId: string, prefs: ProfilePrefs) {
  try {
    localStorage.setItem(key(profileId), JSON.stringify(prefs));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

/** Pulls the active profile's preferences from the server into the cache. */
export async function refreshProfilePrefs() {
  const p = loadProfile();
  if (!p) return;
  const prefs = resolvePrefs(await authed<ProfilePrefs>("/me/profile-prefs"));
  cache(p.id, prefs);
}

/** Optimistic save of a partial update for the active profile. */
export async function saveProfilePrefs(patch: Partial<ProfilePrefs>) {
  const p = loadProfile();
  if (!p) return;
  const before = loadProfilePrefs(p.id);
  cache(p.id, resolvePrefs(before, patch));
  try {
    cache(p.id, resolvePrefs(await authed<ProfilePrefs>("/me/profile-prefs", { method: "PUT", body: JSON.stringify(patch) })));
  } catch {
    cache(p.id, before);
    throw new Error("Couldn't save your preferences");
  }
}

export const PROFILE_PREFS_EVENT = EVENT;
