import { Suspense } from "react";
import type { Metadata } from "next";
import { BrowseView } from "@/components/BrowseView";

export const metadata: Metadata = { title: "TV Shows" };

export default function Page({ searchParams }: PageProps<"/series">) {
  return (
    <Suspense>
      <BrowseView basePath="/series" heading="TV Shows" type="SERIES" searchParams={searchParams} />
    </Suspense>
  );
}
