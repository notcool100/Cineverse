import { Suspense } from "react";
import type { Metadata } from "next";
import { ProfilePicker } from "@/components/ProfilePicker";

export const metadata: Metadata = { title: "Profiles" };

export default function ProfilesPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 pb-8 pt-36 sm:px-10">
      <Suspense>
        <ProfilePicker />
      </Suspense>
    </div>
  );
}
