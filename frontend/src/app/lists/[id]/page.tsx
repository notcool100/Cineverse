import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ListDetail } from "@/components/ListViews";

export const metadata: Metadata = { title: "List" };

export default function Page(props: PageProps<"/lists/[id]">) {
  return (
    <div className="mx-auto max-w-[96rem] px-5 pb-12 pt-28 sm:px-10">
      <Link href="/lists" className="mb-4 inline-block text-sm text-white/60 hover:text-white">← My lists</Link>
      <Suspense>
        <Detail params={props.params} />
      </Suspense>
    </div>
  );
}

async function Detail({ params }: { params: PageProps<"/lists/[id]">["params"] }) {
  const { id } = await params;
  return <ListDetail listId={id} />;
}
