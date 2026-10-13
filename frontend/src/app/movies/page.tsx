import { Suspense } from "react";
import type { Metadata } from "next";
import { BrowseView } from "@/components/BrowseView";

export const metadata: Metadata = { title: "Movies" };

export default function Page({ searchParams }: PageProps<"/movies">) {
  return (
    <Suspense>
      <BrowseView basePath="/movies" heading="Movies" type="MOVIE" searchParams={searchParams} />
    </Suspense>
  );
}
