"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminAnalytics, type AdminAnalytics, type DayPoint } from "@/lib/client-api";
import { errText, Section } from "./AdminUi";

const num = new Intl.NumberFormat("en");

function Tile({ label, value, hint, warn }: { label: string; value: number; hint?: string; warn?: boolean }) {
  return (
    <div className="glass-soft rounded-2xl p-4">
      <p className="text-xs uppercase tracking-wider text-white/45">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${warn && value > 0 ? "text-amber-300" : ""}`}>{num.format(value)}</p>
      {hint && <p className="mt-0.5 text-xs text-white/45">{hint}</p>}
    </div>
  );
}

/** One-series daily bar chart: the title names the series, so no legend; the table below is the accessible view. */
function DailyBars({ title, points }: { title: string; points: DayPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const total = points.reduce((a, p) => a + p.value, 0);
  const W = 560;
  const H = 120;
  const gap = 4;
  const bw = (W - gap * (points.length - 1)) / points.length;
  return (
    <figure className="glass-soft rounded-2xl p-4">
      <figcaption className="mb-3 flex items-baseline justify-between">
        <span className="font-medium">{title}</span>
        <span className="text-sm tabular-nums text-white/55">{num.format(total)} in {points.length} days</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H + 26}`} role="img" aria-label={`${title}, daily for ${points.length} days, ${total} total`} className="w-full">
        <line x1="0" x2={W} y1={H} y2={H} stroke="currentColor" strokeOpacity="0.2" />
        {points.map((p, i) => {
          const h = Math.max(p.value ? 3 : 0, (p.value / max) * (H - 6));
          return (
            <g key={p.date}>
              <rect x={i * (bw + gap)} y={H - h} width={bw} height={h} rx="3" fill="var(--accent)">
                <title>{`${p.date}: ${num.format(p.value)}`}</title>
              </rect>
            </g>
          );
        })}
        <text x="0" y={H + 22} fontSize="18" fill="currentColor" fillOpacity="0.5">{points[0]?.date.slice(5)}</text>
        <text x={W} y={H + 22} fontSize="18" textAnchor="end" fill="currentColor" fillOpacity="0.5">{points[points.length - 1]?.date.slice(5)}</text>
        <text x={W} y="16" fontSize="18" textAnchor="end" fill="currentColor" fillOpacity="0.5">peak {num.format(max)}</text>
      </svg>
      <table className="sr-only">
        <caption>{title} per day</caption>
        <tbody>{points.map((p) => <tr key={p.date}><th scope="row">{p.date}</th><td>{p.value}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

/** Admin Overview: totals, 14-day activity, top titles and flagged sources. */
export function AdminAnalyticsPanel() {
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [days, setDays] = useState(14);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    adminAnalytics(days).then((d) => live && (setData(d), setErr(null))).catch((e) => live && setErr(errText(e)));
    return () => {
      live = false;
    };
  }, [days]);

  if (err) return <p role="alert" className="text-red-300">{err}</p>;
  if (!data) return <p className="text-white/50">Loading…</p>;
  const t = data.totals;
  return (
    <>
      <Section title="Overview">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Accounts" value={t.users} hint={`${t.verifiedUsers} verified`} />
          <Tile label="Profiles" value={t.profiles} />
          <Tile label="Titles" value={t.publishedTitles} hint={`${t.titles} total`} />
          <Tile label="Sources" value={t.sources} />
          <Tile label="Reported sources" value={t.openReports} warn />
          <Tile label="Hidden (failed)" value={t.failedSources} warn />
          <Tile label="Open requests" value={t.openRequests} />
        </div>
      </Section>

      <Section title="Activity">
        <div role="radiogroup" aria-label="Range" className="flex gap-1 text-sm">
          {[7, 14, 30].map((d) => (
            <button key={d} role="radio" aria-checked={days === d} onClick={() => setDays(d)} className={`rounded-full px-3 py-1 ${days === d ? "bg-white text-black" : "glass-soft text-white/70"}`}>{d} days</button>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <DailyBars title="Page views" points={data.series.views} />
          <DailyBars title="Viewing sessions" points={data.series.watches} />
          <DailyBars title="New accounts" points={data.series.signups} />
        </div>
      </Section>

      <Section title="Top titles this week" hint="Ranked by views, plays (×3) and saves (×2).">
        {data.topTitles.length === 0 ? (
          <p className="text-sm text-white/50">No activity yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-white/45">
              <tr><th className="pb-2">Title</th><th className="pb-2 text-right">Views</th><th className="pb-2 text-right">Plays</th><th className="pb-2 text-right">Saves</th></tr>
            </thead>
            <tbody>
              {data.topTitles.map((r) => (
                <tr key={r.slug} className="border-t border-white/8">
                  <td className="py-2"><Link href={`/title/${r.slug}`} className="hover:underline">{r.name}</Link> <span className="text-xs text-white/40">{r.type === "SERIES" ? "series" : "movie"}</span></td>
                  <td className="py-2 text-right tabular-nums">{r.views}</td>
                  <td className="py-2 text-right tabular-nums">{r.watches}</td>
                  <td className="py-2 text-right tabular-nums">{r.saves}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Dead or suspect sources" hint="Hidden automatically, or reported by two or more viewers. Manage them under Moderation.">
        {data.deadSources.length === 0 ? (
          <p className="text-sm text-white/50">Nothing flagged.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.deadSources.map((g) => (
              <li key={`${g.titleId}|${g.sourceKey}|${g.episodeKey}`} className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-2">
                <span><Link href={`/title/${g.slug}`} className="hover:underline">{g.title}</Link> <span className="text-white/45">· {g.sourceLabel}{g.episodeKey ? ` · ${g.episodeKey}` : ""}</span></span>
                <span>{g.sourceStatus === "FAILED" && <span className="mr-2 rounded bg-red-500/20 px-1.5 py-0.5 text-xs text-red-300">hidden</span>}{g.reporters} {g.reporters === 1 ? "viewer" : "viewers"}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
