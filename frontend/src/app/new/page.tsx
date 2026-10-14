import { Suspense } from "react";
import type { Metadata } from "next";
import { BrowseView } from "@/components/BrowseView";
import { NewTabs } from "@/components/NewTabs";

export const metadata: Metadata = { title: "New & Popular" };

export default function Page({ searchParams }: PageProps<"/new">) {
  return (
    <Suspense>
      <BrowseView basePath="/new" heading="New & Popular" defaultSort="year" tabs={<NewTabs active="/new" />} searchParams={searchParams} />
    </Suspense>
  );
}
