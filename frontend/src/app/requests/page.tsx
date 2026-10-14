import type { Metadata } from "next";
import { RequestsView } from "@/components/RequestsView";

export const metadata: Metadata = { title: "Request a title" };

export default function Page() {
  return (
    <div className="mx-auto max-w-3xl px-5 pb-12 pt-28 sm:px-10">
      <h1 className="text-4xl font-bold tracking-tight">Request a title</h1>
      <p className="mb-8 mt-2 text-white/55">Can&apos;t find something? Ask for it. The most-voted requests get added first, and we&apos;ll notify everyone who voted.</p>
      <RequestsView />
    </div>
  );
}
