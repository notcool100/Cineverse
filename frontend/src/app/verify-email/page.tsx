import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyEmailStatus } from "@/components/AccountForms";

export const metadata: Metadata = { title: "Confirm email" };

export default function Page() {
  return (
    <div className="mx-auto max-w-md px-5 pb-8 pt-32">
      <Suspense>
        <VerifyEmailStatus />
      </Suspense>
    </div>
  );
}
