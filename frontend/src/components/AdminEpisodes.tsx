"use client";

import { useEffect, useState } from "react";
import {
  adminEpisodes, adminSetEpisodeMarkers, adminSetSeasonMarkers, adminTitles,
  type AdminEpisode, type AdminTitle, type Markers,
} from "@/lib/client-api";

import { btn, errText, input, Section } from "./AdminUi";

type Fields = { introStartSec: string; introEndSec: string; creditsStartSec: string };
const toFields = (m: Markers): Fields => ({
  introStartSec: m.introStartSec?.toString() ?? "",
  introEndSec: m.introEndSec?.toString() ?? "",
  creditsStartSec: m.creditsStartSec?.toString() ?? "",
});
const num = (v: string) => (v.trim() === "" ? null : Number(v));
const toMarkers = (f: Fields): Markers => ({ introStartSec: num(f.introStartSec), introEndSec: num(f.introEndSec), creditsStartSec: num(f.creditsStartSec) });

/** Whole-seconds input. */
function Sec({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-[11px] text-white/50">
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="numeric" pattern="[0-9]*" placeholder="sec" className={`${input} mt-0.5 !px-2 !py-1`} />
    </label>
  );
}

/** Episode intro/credits markers. Skip intro and the up-next card in the player only appear where these are set. */
export function AdminEpisodes() {
  const [series, setSeries] = useState<AdminTitle[]>([]);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<AdminTitle | null>(null);
  const [eps, setEps] = useState<AdminEpisode[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => void adminTitles().then((t) => setSeries(t.filter((x) => x.type === "SERIES"))).catch(() => {}), []);

  const load = (t: AdminTitle) => {
    setPicked(t);
    setEps(null);
    setMsg(null);
    adminEpisodes(t.id).then(setEps).catch((e) => setMsg({ ok: false, text: errText(e) }));
  };
  const seasons = [...new Set((eps ?? []).map((e) => e.season))];

  return (
    <Section title="Episode markers" hint="Set where the intro starts and ends, and where the credits begin (seconds). Players only show Skip intro / the Next episode card for episodes that have markers.">
      {!picked ? (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a series" className={input} />
          <ul className="max-h-56 space-y-1 overflow-auto">
            {series.filter((t) => t.name.toLowerCase().includes(q.toLowerCase())).slice(0, 30).map((t) => (
              <li key={t.id}><button onClick={() => load(t)} className="w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-white/8">{t.name}</button></li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">{picked.name}</p>
            <button onClick={() => setPicked(null)} className="text-sm text-white/60 hover:text-white">Change series</button>
          </div>
          {!eps && !msg && <p className="text-white/50">Loading…</p>}
          {seasons.map((s) => (
            <SeasonEditor key={s} titleId={picked.id} season={s} eps={eps!.filter((e) => e.season === s)} onSaved={() => load(picked)} setMsg={setMsg} />
          ))}
        </>
      )}
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</p>}
    </Section>
  );
}

function SeasonEditor({ titleId, season, eps, onSaved, setMsg }: { titleId: string; season: number; eps: AdminEpisode[]; onSaved: () => void; setMsg: (m: { ok: boolean; text: string }) => void }) {
  const [all, setAll] = useState<Fields>(toFields({ introStartSec: null, introEndSec: null, creditsStartSec: null }));
  const applyAll = async () => {
    try {
      const r = await adminSetSeasonMarkers(titleId, season, toMarkers(all));
      setMsg({ ok: true, text: `Season ${season}: ${r.updated} episodes updated` });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    }
  };
  return (
    <details className="rounded-xl border border-white/10 px-4 py-2">
      <summary className="cursor-pointer py-1 font-medium">Season {season} <span className="text-xs text-white/40">{eps.length} episodes</span></summary>
      <div className="mb-3 mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-white/5 p-3">
        <span className="w-full text-xs text-white/55">Apply to the whole season</span>
        <div className="w-24"><Sec label="Intro start" value={all.introStartSec} onChange={(v) => setAll({ ...all, introStartSec: v })} /></div>
        <div className="w-24"><Sec label="Intro end" value={all.introEndSec} onChange={(v) => setAll({ ...all, introEndSec: v })} /></div>
        <div className="w-24"><Sec label="Credits at" value={all.creditsStartSec} onChange={(v) => setAll({ ...all, creditsStartSec: v })} /></div>
        <button onClick={applyAll} className={btn}>Apply to season</button>
      </div>
      <div className="space-y-2">
        {eps.map((e) => <EpisodeRow key={`${e.id}-${e.introStartSec}-${e.introEndSec}-${e.creditsStartSec}`} ep={e} setMsg={setMsg} />)}
      </div>
    </details>
  );
}

function EpisodeRow({ ep, setMsg }: { ep: AdminEpisode; setMsg: (m: { ok: boolean; text: string }) => void }) {
  const [f, setF] = useState<Fields>(toFields(ep));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminSetEpisodeMarkers(ep.id, toMarkers(f));
      setMsg({ ok: true, text: `S${ep.season}·E${ep.number} saved` });
    } catch (err) {
      setMsg({ ok: false, text: errText(err) });
    }
  };
  return (
    <form onSubmit={save} className="flex flex-wrap items-end gap-2">
      <span className="min-w-28 flex-1 truncate text-sm">E{ep.number} {ep.name && <span className="text-white/45">{ep.name}</span>}</span>
      <div className="w-20"><Sec label="Intro start" value={f.introStartSec} onChange={(v) => setF({ ...f, introStartSec: v })} /></div>
      <div className="w-20"><Sec label="Intro end" value={f.introEndSec} onChange={(v) => setF({ ...f, introEndSec: v })} /></div>
      <div className="w-20"><Sec label="Credits at" value={f.creditsStartSec} onChange={(v) => setF({ ...f, creditsStartSec: v })} /></div>
      <button className={btn}>Save</button>
    </form>
  );
}
