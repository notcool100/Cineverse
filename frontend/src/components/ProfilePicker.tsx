"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createProfile, deleteProfile, getProfiles, saveProfile, updateProfile, type Profile } from "@/lib/client-api";
import { AVATARS, avatarColor, useProfile } from "./useProfile";
import { useUser } from "./useSession";

const MAX = 5;

/** "Who's watching?" screen with add / edit / delete. Picking a profile reloads so every row refetches for it. */
export function ProfilePicker() {
  const user = useUser();
  const active = useProfile();
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [manage, setManage] = useState(useSearchParams().get("manage") === "1");
  const [editing, setEditing] = useState<Profile | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getProfiles().then(setProfiles).catch(() => setError("Couldn't load profiles."));
  }, [user]);

  if (!user) return <p className="text-white/70">Sign in to choose a profile.</p>;
  if (!profiles) return <p className="text-white/60">{error ?? "Loading…"}</p>;

  const pick = (p: Profile) => {
    saveProfile(p);
    // Full reload on purpose: every row and per-profile fetch must start fresh.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
  };

  async function save(draft: { name: string; avatar: string; isKids: boolean }) {
    setError(null);
    try {
      if (editing === "new") {
        const p = await createProfile(draft);
        setProfiles((l) => [...(l ?? []), p]);
      } else if (editing) {
        const p = await updateProfile(editing.id, draft);
        setProfiles((l) => l?.map((x) => (x.id === p.id ? p : x)) ?? null);
        if (active?.id === p.id) saveProfile(p);
      }
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the profile.");
    }
  }

  async function remove(p: Profile) {
    if (!confirm(`Delete ${p.name}? Their list, history and ratings will be removed.`)) return;
    try {
      await deleteProfile(p.id);
      setProfiles((l) => l?.filter((x) => x.id !== p.id) ?? null);
      if (active?.id === p.id) saveProfile(null);
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete the profile.");
    }
  }

  if (editing) return <ProfileForm initial={editing === "new" ? undefined : editing} error={error} onSave={save} onCancel={() => setEditing(null)} onDelete={editing !== "new" && profiles.length > 1 ? () => remove(editing) : undefined} />;

  return (
    <div className="text-center">
      <h1 className="mb-10 text-4xl font-bold tracking-tight">{manage ? "Manage profiles" : "Who’s watching?"}</h1>
      <ul className="flex flex-wrap justify-center gap-6">
        {profiles.map((p) => (
          <li key={p.id}>
            <button onClick={() => (manage ? setEditing(p) : pick(p))} className="group w-28 text-center sm:w-32" aria-label={`${manage ? "Edit" : "Watch as"} ${p.name}`}>
              <Avatar profile={p} ring={p.id === active?.id} />
              <span className="mt-3 block truncate text-sm text-white/70 group-hover:text-white">{p.name}</span>
              {p.isKids && <span className="text-[11px] uppercase tracking-wider text-accent">Kids</span>}
            </button>
          </li>
        ))}
        {profiles.length < MAX && (
          <li>
            <button onClick={() => setEditing("new")} className="group w-28 sm:w-32" aria-label="Add profile">
              <span className="grid aspect-square place-items-center rounded-2xl border border-dashed border-white/30 text-4xl text-white/50 group-hover:text-white">+</span>
              <span className="mt-3 block text-sm text-white/70">Add profile</span>
            </button>
          </li>
        )}
      </ul>
      {error && <p className="mt-6 text-sm text-red-400">{error}</p>}
      <button onClick={() => setManage((m) => !m)} className="glass mt-12 rounded-full px-6 py-2 text-sm">
        {manage ? "Done" : "Manage profiles"}
      </button>
      {active && !manage && (
        <button onClick={() => router.back()} className="ml-3 text-sm text-white/50 hover:text-white">
          Cancel
        </button>
      )}
    </div>
  );
}

export function Avatar({ profile, ring = false, size = "lg" }: { profile: Pick<Profile, "name" | "avatar">; ring?: boolean; size?: "sm" | "lg" }) {
  return (
    <span
      aria-hidden
      className={`grid place-items-center font-bold text-white ${size === "lg" ? "aspect-square w-full rounded-2xl text-5xl" : "size-7 rounded-full text-xs"} ${ring ? "ring-2 ring-white" : ""}`}
      style={{ background: avatarColor(profile.avatar) }}
    >
      {profile.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function ProfileForm({
  initial,
  error,
  onSave,
  onCancel,
  onDelete,
}: {
  initial?: Profile;
  error: string | null;
  onSave: (d: { name: string; avatar: string; isKids: boolean }) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [avatar, setAvatar] = useState(initial?.avatar ?? "0");
  const [isKids, setIsKids] = useState(initial?.isKids ?? false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSave({ name: name.trim(), avatar, isKids });
      }}
      className="mx-auto max-w-sm space-y-6 text-left"
    >
      <h1 className="text-3xl font-bold">{initial ? "Edit profile" : "Add profile"}</h1>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={24}
        placeholder="Name"
        aria-label="Profile name"
        autoFocus
        className="w-full rounded-md border border-white/15 bg-white/10 px-4 py-3"
      />
      <div role="radiogroup" aria-label="Avatar colour" className="flex flex-wrap gap-3">
        {AVATARS.map((c, i) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={avatar === String(i)}
            aria-label={`Colour ${i + 1}`}
            onClick={() => setAvatar(String(i))}
            className={`size-10 rounded-full ${avatar === String(i) ? "ring-2 ring-white ring-offset-2 ring-offset-background" : ""}`}
            style={{ background: c }}
          />
        ))}
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={isKids} onChange={(e) => setIsKids(e.target.checked)} className="size-4" />
        <span>Kids profile <span className="block text-xs text-white/50">Shows family and animation titles only on the home page.</span></span>
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-3">
        <button className="rounded-full bg-white px-6 py-2 font-semibold text-black">Save</button>
        <button type="button" onClick={onCancel} className="glass rounded-full px-6 py-2">Cancel</button>
        {onDelete && (
          <button type="button" onClick={onDelete} className="ml-auto text-sm text-red-400 hover:text-red-300">Delete profile</button>
        )}
      </div>
    </form>
  );
}
