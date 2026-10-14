import type { Metadata } from "next";
import { CollectionCards } from "@/components/CollectionViews";

export const metadata: Metadata = { title: "Collections" };

export default function Page() {
  return (
    <div className="mx-auto max-w-6xl px-5 pb-12 pt-28 sm:px-10">
      <h1 className="text-4xl font-bold tracking-tight">Collections</h1>
      <p className="mb-8 mt-2 text-white/55">Pick a mood and we&apos;ll find something to match.</p>
      <CollectionCards />
    </div>
  );
}
