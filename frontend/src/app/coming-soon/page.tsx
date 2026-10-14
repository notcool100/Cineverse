import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getUpcoming } from "@/lib/catalog";
import { EmptyState } from "@/components/EmptyState";
import { NewTabs } from "@/components/NewTabs";
import { RemindButton } from "@/components/RemindButton";
import { TitleCard } from "@/components/TitleCard";

export const metadata: Metadata = { title: "Coming soon" };

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default function Page() {
  return (
    <div className="mx-auto max-w-[96rem] px-5 pb-12 pt-28 sm:px-10">
      <h1 className="text-4xl font-bold tracking-tight">Coming soon</h1>
      <p className="mb-6 mt-2 text-white/50">Set a reminder and we&apos;ll notify you the day it arrives.</p>
      <NewTabs active="/coming-soon" />
      <Suspense>
        <Upcoming />
      </Suspense>
    </div>
  );
}

async function Upcoming() {
  const titles = await getUpcoming();
  if (titles.length === 0)
    return (
      <EmptyState art="search" title="Nothing scheduled yet" actions={[{ label: "See what's new", href: "/new", primary: true }]}>
        Upcoming releases will show up here as they&apos;re added.
      </EmptyState>
    );
  return (
    <ul className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 xl:grid-cols-4">
      {titles.map((t) => (
        <li key={t.id} className="flex flex-col items-center gap-3">
          <TitleCard title={t} />
          <div className="text-center">
            <Link href={`/title/${t.id}`} className="block font-semibold hover:underline">{t.name}</Link>
            {t.releaseDate && <p className="mt-0.5 text-sm text-white/55">Arrives {fmt(t.releaseDate)}</p>}
          </div>
          <RemindButton titleId={t.id} titleName={t.name} />
        </li>
      ))}
    </ul>
  );
}
