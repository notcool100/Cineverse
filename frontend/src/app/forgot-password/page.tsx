import type { Metadata } from "next";
import { Suspense } from "react";
import { ForgotPasswordForm } from "@/components/AccountForms";

export const metadata: Metadata = { title: "Forgot password" };

export default function Page() {
  return (
    <div className="mx-auto max-w-md px-5 pb-8 pt-32">
      <Suspense>
        <ForgotPasswordForm />
      </Suspense>
    </div>
  );
}
