import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/AccountForms";

export const metadata: Metadata = { title: "Reset password" };

export default function Page() {
  return (
    <div className="mx-auto max-w-md px-5 pb-8 pt-32">
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
