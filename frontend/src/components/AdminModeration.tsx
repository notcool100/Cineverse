"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  adminDecideRequest, adminReports, adminRequests, adminResolveReport, adminRestoreSource,
  REPORT_REASONS, type AdminReportGroup, type AdminRequest,
} from "@/lib/client-api";
import { btn, errText, input, Msg, Section } from "./AdminUi";

const reasonLabel = (v: string) => REPORT_REASONS.find((r) => r.value === v)?.label ?? v;

export function AdminModeration() {
  return (
    <>
      <Reports />
      <Requests />
    </>
  );
}

/** Viewer reports grouped per source. Sources that crossed the threshold are already hidden (FAILED). */
function Reports() {
  const [groups, setGroups] = useState<AdminReportGroup[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => adminReports().then(setGroups).catch((e) => (setGroups([]), setMsg(errText(e)))), []);
  useEffect(() => void load(), [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg(errText(e));
    }
    void load();
  };

  return (
    <Section title="Reported sources" hint="Viewers flag sources that don't play. Three different viewers hide a stored source automatically; built-in servers are hidden for that title and episode. Restore a source once it works again.">
      {!groups && <p className="text-white/50">Loading…</p>}
      {groups?.length === 0 && <p className="text-sm text-white/50">No open reports.</p>}
      <ul className="space-y-2">
        {groups?.map((g) => (
          <li key={`${g.titleId}|${g.sourceKey}|${g.episodeKey}`} className="rounded-xl border border-white/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  <Link href={`/title/${g.slug}`} className="hover:underline">{g.title}</Link>
                  {g.episodeKey && <span className="ml-2 text-xs text-white/45">{g.episodeKey}</span>}
                </p>
                <p className="text-sm text-white/60">
                  {g.sourceLabel} <span className="text-white/35">· {g.kind === "provider" ? "built-in server" : "stored source"}</span>
                  {g.sourceStatus === "FAILED" && <span className="ml-2 rounded bg-red-500/20 px-1.5 py-0.5 text-xs text-red-300">hidden</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{g.reporters} {g.reporters === 1 ? "viewer" : "viewers"}</span>
                {g.sourceStatus === "FAILED" && <button onClick={() => act(() => adminRestoreSource(g.sourceKey))} className={btn}>Restore</button>}
                <button onClick={() => act(() => adminResolveReport(g))} className="rounded-full border border-white/20 px-4 py-1.5 text-sm hover:bg-white/10">Dismiss</button>
              </div>
            </div>
            <p className="mt-2 text-xs text-white/50">
              {Object.entries(g.reasons).map(([r, n]) => `${reasonLabel(r)} ×${n}`).join(" · ")}
              {g.notes.length > 0 && <span className="ml-2 italic">“{g.notes.join("” “")}”</span>}
            </p>
          </li>
        ))}
      </ul>
      <Msg text={msg} />
    </Section>
  );
}

/** Title requests ordered by votes. Marking one added links the catalog title and notifies everyone who voted. */
function Requests() {
  const [rows, setRows] = useState<AdminRequest[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(() => adminRequests("OPEN").then(setRows).catch((e) => (setRows([]), setMsg({ ok: false, text: errText(e) }))), []);
  useEffect(() => void load(), [load]);

  return (
    <Section title="Title requests" hint="To mark a request added, enter the slug of the catalog title that fulfils it; everyone who voted gets a notification.">
      {!rows && <p className="text-white/50">Loading…</p>}
      {rows?.length === 0 && <p className="text-sm text-white/50">No open requests.</p>}
      <ul className="space-y-2">
        {rows?.map((r) => <RequestRow key={r.id} r={r} onDone={load} setMsg={setMsg} />)}
      </ul>
      <Msg ok={msg?.ok} text={msg?.text ?? null} />
    </Section>
  );
}

function RequestRow({ r, onDone, setMsg }: { r: AdminRequest; onDone: () => void; setMsg: (m: { ok: boolean; text: string }) => void }) {
  const [slug, setSlug] = useState("");
  const decide = async (status: "ADDED" | "REJECTED") => {
    try {
      await adminDecideRequest(r.id, status, status === "ADDED" ? slug.trim() : undefined);
      setMsg({ ok: true, text: `“${r.name}” ${status === "ADDED" ? "marked added" : "declined"}` });
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    }
  };
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 p-3">
      <span className="w-10 text-center text-sm font-semibold">{r.votes}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{r.name} <span className="text-xs font-normal text-white/45">{r.type === "SERIES" ? "TV show" : "movie"}{r.tmdbId ? ` · TMDB ${r.tmdbId}` : ""}</span></p>
        <p className="truncate text-xs text-white/45">{r.requester}{r.note ? ` · ${r.note}` : ""}</p>
      </div>
      <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="catalog slug" aria-label={`Catalog slug for ${r.name}`} className={`${input} !w-40`} />
      <button onClick={() => decide("ADDED")} disabled={!slug.trim()} className={btn}>Added</button>
      <button onClick={() => decide("REJECTED")} className="rounded-full border border-white/20 px-4 py-1.5 text-sm hover:bg-white/10">Decline</button>
    </li>
  );
}
