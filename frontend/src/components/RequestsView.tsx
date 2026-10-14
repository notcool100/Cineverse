"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createRequest, deleteRequest, getRequests, voteRequest, type TitleRequest } from "@/lib/client-api";
import { useUser } from "./useSession";

const field = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-accent";
const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

/** Title requests: submit, vote and follow status. Requesting something already requested adds your vote. */
export function RequestsView() {
  const user = useUser();
  const [sort, setSort] = useState<"top" | "new">("top");
  const [tab, setTab] = useState<TitleRequest["status"]>("OPEN");
  const [rows, setRows] = useState<TitleRequest[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [f, setF] = useState({ name: "", type: "MOVIE" as "MOVIE" | "SERIES", tmdbId: "", note: "" });

  const load = useCallback(() => getRequests(sort, tab).then(setRows).catch(() => setRows([])), [sort, tab]);
  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  if (!user)
    return (
      <p className="text-white/60">
        <Link href="/login?next=/requests" className="text-accent underline">Sign in</Link> to request titles and vote.
      </p>
    );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const r = await createRequest({ name: f.name, type: f.type, tmdbId: f.tmdbId ? Number(f.tmdbId) : undefined, note: f.note || undefined });
      setMsg({ ok: true, text: r.duplicate ? "Already requested. We added your vote." : "Request sent. Thanks!" });
      setF({ name: "", type: "MOVIE", tmdbId: "", note: "" });
      setTab("OPEN");
      await load();
    } catch (err) {
      setMsg({ ok: false, text: errText(err) });
    }
  }

  async function toggle(r: TitleRequest) {
    const next = !r.voted;
    setRows((rs) => rs && rs.map((x) => (x.id === r.id ? { ...x, voted: next, votes: x.votes + (next ? 1 : -1) } : x)));
    try {
      await voteRequest(r.id, next);
    } catch {
      void load();
    }
  }

  async function remove(r: TitleRequest) {
    setRows((rs) => rs && rs.filter((x) => x.id !== r.id));
    await deleteRequest(r.id).catch(() => load());
  }

  return (
    <div className="space-y-10">
      <form onSubmit={submit} className="glass space-y-3 rounded-2xl p-5">
        <div className="flex flex-wrap gap-2">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={120} placeholder="Title name" aria-label="Title name" className={`${field} min-w-48 flex-1`} />
          <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as "MOVIE" | "SERIES" })} aria-label="Type" className={`${field} !w-auto`}>
            <option value="MOVIE" className="bg-neutral-900">Movie</option>
            <option value="SERIES" className="bg-neutral-900">TV show</option>
          </select>
          <input value={f.tmdbId} onChange={(e) => setF({ ...f, tmdbId: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="TMDB id (optional)" aria-label="TMDB id" className={`${field} !w-44`} />
        </div>
        <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={300} placeholder="Anything that helps us find it (year, language…)" aria-label="Note" className={field} />
        <div className="flex items-center justify-between gap-3">
          <p aria-live="polite" className={`text-sm ${msg?.ok ? "text-emerald-300" : "text-red-300"}`}>{msg?.text}</p>
          <button className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black">Request</button>
        </div>
      </form>

      <section aria-labelledby="req-list">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Status" className="flex gap-2">
            {(["OPEN", "ADDED", "REJECTED"] as const).map((s) => (
              <button key={s} role="tab" aria-selected={tab === s} onClick={() => setTab(s)} className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === s ? "bg-white text-black" : "glass-soft text-white/70 hover:text-white"}`}>
                {s === "OPEN" ? "Open" : s === "ADDED" ? "Added" : "Declined"}
              </button>
            ))}
          </div>
          {tab === "OPEN" && (
            <div role="radiogroup" aria-label="Sort" className="flex gap-1 text-sm">
              {([["top", "Most voted"], ["new", "Newest"]] as const).map(([v, l]) => (
                <button key={v} role="radio" aria-checked={sort === v} onClick={() => setSort(v)} className={`rounded-full px-3 py-1 ${sort === v ? "bg-white/15 font-semibold" : "text-white/55 hover:text-white"}`}>{l}</button>
              ))}
            </div>
          )}
        </div>
        <h2 id="req-list" className="sr-only">Requests</h2>
        {!rows && <p className="text-white/50">Loading…</p>}
        {rows && rows.length === 0 && <p className="text-white/50">Nothing here yet.</p>}
        <ul className="space-y-2">
          {rows?.map((r) => (
            <li key={r.id} className="glass-soft flex items-center gap-4 rounded-2xl p-4">
              <button
                type="button"
                onClick={() => toggle(r)}
                disabled={r.status !== "OPEN"}
                aria-pressed={r.voted}
                aria-label={`${r.voted ? "Remove vote for" : "Vote for"} ${r.name}`}
                className={`flex w-14 shrink-0 flex-col items-center rounded-xl py-2 text-sm font-semibold transition ${r.voted ? "bg-accent text-white" : "bg-white/10 hover:bg-white/20"} disabled:opacity-60`}
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 15 6-6 6 6" /></svg>
                {r.votes}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{r.name} <span className="text-xs font-normal text-white/45">{r.type === "SERIES" ? "TV show" : "Movie"}</span></p>
                {r.note && <p className="truncate text-sm text-white/55">{r.note}</p>}
              </div>
              {r.status === "ADDED" && r.titleId ? (
                <span className="text-sm text-emerald-300">Added ✓</span>
              ) : r.status === "REJECTED" ? (
                <span className="text-sm text-white/45">Declined</span>
              ) : r.mine ? (
                <button type="button" onClick={() => remove(r)} className="text-sm text-white/45 hover:text-white">Withdraw</button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
