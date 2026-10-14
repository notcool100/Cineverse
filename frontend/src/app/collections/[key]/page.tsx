import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CollectionGrid } from "@/components/CollectionViews";

export const metadata: Metadata = { title: "Collection" };

export default function Page(props: PageProps<"/collections/[key]">) {
  return (
    <div className="mx-auto max-w-[96rem] px-5 pb-12 pt-28 sm:px-10">
      <Link href="/collections" className="mb-4 inline-block text-sm text-white/60 hover:text-white">← All collections</Link>
      <Suspense>
        <Grid params={props.params} />
      </Suspense>
    </div>
  );
}

async function Grid({ params }: { params: PageProps<"/collections/[key]">["params"] }) {
  const { key } = await params;
  return <CollectionGrid collectionKey={key} />;
}
