import type { Metadata } from "next";
import { WatchlistView } from "@/components/WatchlistView";

export const metadata: Metadata = { title: "My List" };

export default function WatchlistPage() {
  return (
    <div className="mx-auto max-w-7xl px-5 pb-8 pt-28 sm:px-10">
      <h1 className="mb-8 text-4xl font-bold tracking-tight">My List</h1>
      <WatchlistView />
    </div>
  );
}
