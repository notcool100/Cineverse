import type { Metadata } from "next";
import { ActivityView } from "@/components/ActivityView";

export const metadata: Metadata = { title: "Viewing activity" };

export default function Page() {
  return (
    <div className="mx-auto max-w-3xl px-5 pb-12 pt-28 sm:px-10">
      <h1 className="text-4xl font-bold tracking-tight">Viewing activity</h1>
      <p className="mb-8 mt-2 text-white/55">Everything this profile has played. Remove entries to tidy Continue watching and your recommendations.</p>
      <ActivityView />
    </div>
  );
}
