import { Suspense } from "react";
import type { Metadata } from "next";
import { BrowseView } from "@/components/BrowseView";

export const metadata: Metadata = { title: "New & Popular" };

export default function Page({ searchParams }: PageProps<"/new">) {
  return (
    <Suspense>
      <BrowseView basePath="/new" heading="New & Popular" defaultSort="year" searchParams={searchParams} />
    </Suspense>
  );
}
