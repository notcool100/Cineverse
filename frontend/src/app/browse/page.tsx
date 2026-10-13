import type { Metadata } from "next";
import { getTitles } from "@/lib/catalog";
import { TitleCard } from "@/components/TitleCard";

export const metadata: Metadata = { title: "Browse" };

export default async function BrowsePage() {
  const titles = await getTitles();
  return (
    <div className="mx-auto max-w-7xl px-5 pb-8 pt-28 sm:px-10">
      <h1 className="text-4xl font-bold tracking-tight">Browse</h1>
      <p className="mb-8 mt-2 text-white/50">{titles.length} titles</p>
      <div className="grid grid-cols-2 justify-items-center gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {titles.map((t) => (
          <TitleCard key={t.id} title={t} />
        ))}
      </div>
    </div>
  );
}
