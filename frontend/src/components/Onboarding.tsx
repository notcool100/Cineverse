"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setRating } from "@/lib/client-api";
import { finishOnboarding, MIN_PICKS } from "@/lib/onboarding";
import { toTitle, type ApiTitle } from "@/lib/title-map";
import type { Title } from "@/lib/types";
import { PosterImage, posterStyle } from "./Poster";
import { useUser } from "./useSession";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** "Pick 3 or more" taste screen shown once after first sign-in. */
export function Onboarding() {
  const router = useRouter();
  const user = useUser();
  const [genres, setGenres] = useState<string[] | null>(null);
  const [titles, setTitles] = useState<Title[] | null>(null);
  const [pickedGenres, setPickedGenres] = useState<string[]>([]);
  const [pickedTitles, setPickedTitles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([
      fetch(`${API}/genres`).then((r) => (r.ok ? (r.json() as Promise<string[]>) : [])),
      fetch(`${API}/titles?limit=36`).then((r) => (r.ok ? (r.json() as Promise<{ items: ApiTitle[] }>) : { items: [] })),
    ])
      .then(([g, t]) => {
        if (!live) return;
        setGenres(g);
        setTitles(t.items.map(toTitle).filter((x) => x.poster));
      })
      .catch(() => live && (setFailed(true), setGenres([]), setTitles([])));
    return () => {
      live = false;
    };
  }, []);

  const count = pickedGenres.length + pickedTitles.length;
  const ready = count >= MIN_PICKS;
  const flip = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function done(save: boolean) {
    if (!user) return;
    setBusy(true);
    if (save) await Promise.allSettled(pickedTitles.map((id) => setRating(id, 1)));
    finishOnboarding(user.id, save ? pickedGenres : []);
    router.replace("/");
  }

  return (
    <div className="mx-auto max-w-5xl px-5 pb-40 pt-32 sm:px-10">
      <h1 className="text-4xl font-bold tracking-tight">What do you like to watch?</h1>
      <p className="mt-2 max-w-xl text-white/60">Pick at least {MIN_PICKS} genres or titles and we&apos;ll tune your home page around them.</p>

      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wider text-white/45">Genres</h2>
      {!genres ? (
        <div className="flex flex-wrap gap-2" aria-busy="true">
          {Array.from({ length: 12 }, (_, i) => <span key={i} className="skeleton h-10 w-24 rounded-full" />)}
        </div>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {genres.map((g) => (
            <li key={g}>
              <button
                type="button"
                aria-pressed={pickedGenres.includes(g)}
                onClick={() => flip(pickedGenres, setPickedGenres, g)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${pickedGenres.includes(g) ? "border-white bg-white text-black" : "glass-soft text-white/80 hover:text-white"}`}
              >
                {g}
              </button>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wider text-white/45">Titles you&apos;d watch again</h2>
      {!titles ? (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6" aria-busy="true">
          {Array.from({ length: 12 }, (_, i) => <div key={i} className="skeleton aspect-[2/3] rounded-xl" />)}
        </div>
      ) : (
        <ul className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
          {titles.map((t) => {
            const on = pickedTitles.includes(t.id);
            return (
              <li key={t.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={t.name}
                  onClick={() => flip(pickedTitles, setPickedTitles, t.id)}
                  className={`on-dark relative block aspect-[2/3] w-full overflow-hidden rounded-xl border-2 transition ${on ? "border-accent" : "border-transparent hover:border-white/40"}`}
                  style={posterStyle(t)}
                >
                  <PosterImage title={t} sizes="(min-width: 768px) 15vw, 30vw" className={on ? "opacity-60" : ""} />
                  {on && (
                    <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-accent text-xs font-bold text-white" aria-hidden>✓</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {failed && <p role="alert" className="mt-6 text-white/60">Couldn&apos;t load suggestions. You can skip this for now.</p>}

      <div className="glass fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl p-2 pl-5 md:bottom-5">
        <span aria-live="polite" className="text-sm text-white/75">
          {ready ? `${count} picked` : `Pick ${MIN_PICKS - count} more`}
        </span>
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => done(false)} className="rounded-xl px-4 py-2.5 text-sm text-white/70 hover:text-white">Skip</button>
          <button
            type="button"
            disabled={!ready || busy}
            onClick={() => done(true)}
            className="rounded-xl bg-white px-6 py-2.5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Saving…" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
