"use client";

import { useEffect, useState } from "react";
import { getMyHome } from "@/lib/client-api";
import { favouriteGenres } from "@/lib/onboarding";
import { toTitle } from "@/lib/title-map";
import type { Title } from "@/lib/types";
import { RowSkeleton } from "./Skeleton";
import { TitleRow } from "./TitleRow";
import { useUser } from "./useSession";

interface Row {
  key: string;
  title: string;
  items: Title[];
}

/** Signed-in only: continue watching, because-you-watched and picked-for-you rows, shown above the shared rows. */
export function PersonalRows() {
  const user = useUser();
  const [loaded, setLoaded] = useState<{ userId: string; rows: Row[] } | null>(null);

  useEffect(() => {
    if (!user) return;
    let live = true;
    getMyHome()
      .then(async (r) => {
        const rows: Row[] = r.rows.map((x) => ({ ...x, items: x.items.map(toTitle) }));
        // New accounts with no history yet get rows from the genres they picked during onboarding.
        if (rows.length === 0) {
          const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
          for (const g of favouriteGenres(user.id).slice(0, 2)) {
            const res = await fetch(`${api}/titles?genre=${encodeURIComponent(g)}&limit=20`).then((x) => (x.ok ? x.json() : { items: [] })).catch(() => ({ items: [] }));
            if (res.items.length) rows.push({ key: `fav-${g}`, title: `Because you like ${g}`, items: res.items.map(toTitle) });
          }
        }
        if (live) setLoaded({ userId: user.id, rows });
      })
      .catch(() => live && setLoaded({ userId: user.id, rows: [] }));
    return () => {
      live = false;
    };
  }, [user]);

  if (!user) return null;
  if (loaded?.userId !== user.id) return <RowSkeleton count={7} />;
  return loaded.rows.map((r) => <TitleRow key={r.key} heading={r.title} titles={r.items} />);
}
