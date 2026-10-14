import type { Metadata } from "next";
import { ListsOverview } from "@/components/ListViews";

export const metadata: Metadata = { title: "My lists" };

export default function Page() {
  return (
    <div className="mx-auto max-w-6xl px-5 pb-12 pt-28 sm:px-10">
      <h1 className="text-4xl font-bold tracking-tight">My lists</h1>
      <p className="mb-8 mt-2 text-white/55">Collect titles your own way, beyond the one My List.</p>
      <ListsOverview />
    </div>
  );
}
