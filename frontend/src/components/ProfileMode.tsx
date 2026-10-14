"use client";

import { useEffect, useState } from "react";
import { getKidsHome } from "@/lib/client-api";
import { toTitle } from "@/lib/title-map";
import type { Title } from "@/lib/types";
import { RowSkeleton } from "./Skeleton";
import { TitleRow } from "./TitleRow";
import { useProfile } from "./useProfile";

/** Hides shared (unfiltered) catalog content while a kids profile is active. */
export function HideForKids({ children }: { children: React.ReactNode }) {
  return useProfile()?.isKids ? null : children;
}

/** Kids profiles get the age-filtered shared rows, fetched client-side since the page itself is shared and cached. */
export function KidsRows() {
  const profile = useProfile();
  const kids = !!profile?.isKids;
  const [rows, setRows] = useState<{ key: string; title: string; items: Title[] }[] | null>(null);
  useEffect(() => {
    if (!kids) return;
    let live = true;
    getKidsHome()
      .then((r) => live && setRows(r.rows.map((x) => ({ ...x, items: x.items.map(toTitle) }))))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [kids]);
  if (!kids) return null;
  return (
    <div className="space-y-4 pt-28">
      <h1 className="px-5 text-3xl font-bold sm:px-10">Kids</h1>
      {!rows && <RowSkeleton />}
      {rows?.map((r) => <TitleRow key={r.key} heading={r.title} titles={r.items} variant={r.key === "top10" ? "top10" : undefined} />)}
    </div>
  );
}
