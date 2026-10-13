import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md px-5 pb-8 pt-32">
      <Suspense>
        <AuthForm />
      </Suspense>
    </div>
  );
}
