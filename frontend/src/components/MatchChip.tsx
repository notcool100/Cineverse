"use client";

import { useMatch } from "./useMatch";

/** Green "NN% match" label; renders nothing until the profile has enough taste data. */
export function MatchLabel({ slug, className = "" }: { slug: string; className?: string }) {
  const pct = useMatch(slug);
  if (pct === null) return null;
  return <span className={`font-semibold text-emerald-400 ${className}`}>{pct}% match</span>;
}

/** List item version for the title page detail chips. */
export function MatchChip({ slug }: { slug: string }) {
  const pct = useMatch(slug);
  if (pct === null) return null;
  return <li className="rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400">{pct}% match</li>;
}
