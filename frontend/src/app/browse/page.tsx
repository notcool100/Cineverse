import { Suspense } from "react";
import type { Metadata } from "next";
import { BrowseView } from "@/components/BrowseView";

export const metadata: Metadata = { title: "Browse" };

export default function BrowsePage({ searchParams }: PageProps<"/browse">) {
  return (
    <Suspense>
      <BrowseView basePath="/browse" heading="Browse" searchParams={searchParams} />
    </Suspense>
  );
}
