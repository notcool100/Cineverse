"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  adminAddHost, adminHosts, adminProviders, adminRemoveHost, adminSaveProvider, adminSetAdmin, adminSetTmdbId, adminTitles,
  getEmbedProviders, type AdminProviderRow, type AdminTitle,
} from "@/lib/client-api";
import type { ProviderInfo } from "@/lib/sources";
import { useUser } from "./useSession";

const input = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-accent";
const btn = "rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black disabled:opacity-40";
const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

export function AdminPanel() {
  const user = useUser();
  if (!user)
    return (
      <p className="text-white/60">
        <Link href="/login?next=/admin" className="text-accent underline">Sign in</Link> as an admin.
      </p>
    );
  if (user.role !== "ADMIN") return <p className="text-white/60">This page is for administrators.</p>;
  return (
    <div className="space-y-12">
      <Hosts />
      <Providers />
      <Titles />
      <Admins />
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold">{title}</h2>
      {hint && <p className="mb-4 mt-1 max-w-3xl text-sm text-white/55">{hint}</p>}
      <div className="glass space-y-3 rounded-2xl p-5">{children}</div>
    </section>
  );
}

function Msg({ ok, text }: { ok?: boolean; text: string | null }) {
  return text ? <p className={`text-sm ${ok ? "text-emerald-300" : "text-red-300"}`}>{text}</p> : null;
}

function Hosts() {
  const [data, setData] = useState<{ env: string[]; added: string[] } | null>(null);
  const [host, setHost] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => adminHosts().then(setData).catch((e) => setMsg(errText(e))), []);
  useEffect(() => void load(), [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await adminAddHost(host);
      setHost("");
      load();
    } catch (err) {
      setMsg(errText(err));
    }
  };
  const remove = async (h: string) => {
    await adminRemoveHost(h).catch((e) => setMsg(errText(e)));
    load();
  };

  return (
    <Section
      title="Allowed embed hosts"
      hint="Only hostnames listed here (or in EMBED_ALLOWED_HOSTS) can be used in provider URL templates. Add only hosts you are licensed to embed."
    >
      <ul className="flex flex-wrap gap-2">
        {data?.env.map((h) => (
          <li key={h} className="glass-soft rounded-full px-3 py-1 text-sm text-white/70" title="Set in EMBED_ALLOWED_HOSTS">{h} · env</li>
        ))}
        {data?.added.map((h) => (
          <li key={h} className="glass-soft flex items-center gap-2 rounded-full px-3 py-1 text-sm">
            {h}
            <button onClick={() => remove(h)} aria-label={`Remove ${h}`} className="text-white/50 hover:text-white">×</button>
          </li>
        ))}
        {data && !data.env.length && !data.added.length && <li className="text-sm text-white/50">None yet.</li>}
      </ul>
      <form onSubmit={add} className="flex gap-2">
        <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="player.example.com" required className={input} />
        <button className={btn}>Add</button>
      </form>
      <Msg text={msg} />
    </Section>
  );
}

function Providers() {
  const [reg, setReg] = useState<ProviderInfo[] | null>(null);
  const [rows, setRows] = useState<AdminProviderRow[]>([]);
  const load = useCallback(
    () =>
      Promise.all([getEmbedProviders(), adminProviders()])
        .then(([r, a]) => {
          setReg(r);
          setRows(a);
        })
        .catch(() => setReg([])),
    [],
  );
  useEffect(() => void load(), [load]);

  return (
    <Section
      title="Source providers"
      hint="A provider becomes playable once it has an HTTPS URL template on an allowed host and is enabled. Templates may use {tmdbId}, {season} and {episode}."
    >
      {!reg && <p className="text-white/50">Loading…</p>}
      {reg?.map((p) => (
        <ProviderRow key={p.slug} info={p} row={rows.find((r) => r.slug === p.slug)} onSaved={load} />
      ))}
    </Section>
  );
}

const STATE_STYLE = { enabled: "text-emerald-300", disabled: "text-amber-300", unconfigured: "text-white/40" } as const;

function ProviderRow({ info, row, onSaved }: { info: ProviderInfo; row?: AdminProviderRow; onSaved: () => Promise<void> }) {
  const [f, setF] = useState({
    urlTemplate: row?.urlTemplate ?? "",
    episodeUrlTemplate: row?.episodeUrlTemplate ?? "",
    licenseRef: row?.licenseRef ?? "",
    languages: (row?.languages ?? []).join(", "),
    enabled: row?.enabled ?? false,
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await adminSaveProvider(!!row, { slug: info.slug, label: info.label, priority: info.order, ...f, languages: f.languages.split(/[\s,]+/).filter(Boolean).map((l) => l.toLowerCase()) });
      await onSaved();
      setMsg({ ok: true, text: "Saved" });
    } catch (err) {
      setMsg({ ok: false, text: errText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="rounded-xl border border-white/10 px-4 py-2">
      <summary className="flex cursor-pointer items-center justify-between gap-3 py-1">
        <span className="font-medium">{info.label}</span>
        <span className={`text-xs uppercase tracking-wider ${STATE_STYLE[info.state]}`}>{info.state === "unconfigured" ? "not configured" : info.state}</span>
      </summary>
      <form onSubmit={save} className="space-y-3 pb-3 pt-2">
        <label className="block text-xs text-white/55">Movie URL template
          <input value={f.urlTemplate} onChange={(e) => set("urlTemplate", e.target.value)} placeholder="https://player.example.com/movie/{tmdbId}" required className={`${input} mt-1`} />
        </label>
        <label className="block text-xs text-white/55">TV URL template (optional)
          <input value={f.episodeUrlTemplate} onChange={(e) => set("episodeUrlTemplate", e.target.value)} placeholder="https://player.example.com/tv/{tmdbId}/{season}/{episode}" className={`${input} mt-1`} />
        </label>
        <label className="block text-xs text-white/55">Licence reference (optional)
          <input value={f.licenseRef} onChange={(e) => set("licenseRef", e.target.value)} placeholder="Contract or terms reference" className={`${input} mt-1`} />
        </label>
        <label className="block text-xs text-white/55">Languages (comma-separated codes, e.g. en, hi, es)
          <input value={f.languages} onChange={(e) => set("languages", e.target.value)} placeholder="en, hi" className={`${input} mt-1`} />
        </label>
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.enabled} onChange={(e) => set("enabled", e.target.checked)} /> Enabled
          </label>
          <button disabled={busy} className={btn}>{busy ? "Saving…" : "Save"}</button>
        </div>
        <Msg ok={msg?.ok} text={msg?.text ?? null} />
      </form>
    </details>
  );
}

function Titles() {
  const [titles, setTitles] = useState<AdminTitle[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => void adminTitles().then(setTitles).catch(() => setTitles([])), []);
  const shown = (titles ?? []).filter((t) => t.name.toLowerCase().includes(q.toLowerCase())).slice(0, 50);

  return (
    <Section title="Titles" hint="Providers build their URLs from a title’s TMDB id, so a title without one can’t play from any provider.">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name" className={input} />
      {!titles && <p className="text-white/50">Loading…</p>}
      {shown.map((t) => <TitleRow key={t.id} t={t} />)}
    </Section>
  );
}

function TitleRow({ t }: { t: AdminTitle }) {
  const [val, setVal] = useState(t.tmdbId?.toString() ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await adminSetTmdbId(t.id, Number(val));
      setMsg({ ok: true, text: "Saved" });
    } catch (err) {
      setMsg({ ok: false, text: errText(err) });
    }
  };
  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-3">
      <span className="min-w-0 flex-1 truncate">{t.name} <span className="text-xs text-white/40">{t.type === "SERIES" ? "series" : "movie"}{t.published ? "" : " · unpublished"}</span></span>
      <input value={val} onChange={(e) => setVal(e.target.value)} inputMode="numeric" pattern="[0-9]+" required placeholder="TMDB id" aria-label={`TMDB id for ${t.name}`} className={`${input} !w-32`} />
      <button className={btn}>Save</button>
      <Msg ok={msg?.ok} text={msg?.text ?? null} />
    </form>
  );
}

function Admins() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    setMsg(null);
    try {
      await adminSetAdmin(String(d.get("email")), String(d.get("password")));
      form.reset();
      setMsg({ ok: true, text: "Admin saved" });
    } catch (err) {
      setMsg({ ok: false, text: errText(err) });
    }
  };
  return (
    <Section title="Administrators" hint="Creates an admin account, or promotes an existing user and sets their password. Use at least 12 characters.">
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <input name="email" type="email" required placeholder="Email" autoComplete="off" className={`${input} flex-1`} />
        <input name="password" type="password" required minLength={12} placeholder="Password (12+ characters)" autoComplete="new-password" className={`${input} flex-1`} />
        <button className={btn}>Save admin</button>
      </form>
      <Msg ok={msg?.ok} text={msg?.text ?? null} />
    </Section>
  );
}
