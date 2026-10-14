import type { Metadata } from "next";
import { Suspense } from "react";
import { PartyJoin } from "@/components/PartyJoin";

export const metadata: Metadata = { title: "Join watch party" };

export default function Page(props: PageProps<"/party/[code]">) {
  return (
    <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-5 pt-28">
      <Suspense>
        <Join params={props.params} />
      </Suspense>
    </div>
  );
}

async function Join({ params }: { params: PageProps<"/party/[code]">["params"] }) {
  const { code } = await params;
  return <PartyJoin code={code.toUpperCase()} />;
}
