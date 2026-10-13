"use client";

import { EmptyState } from "@/components/EmptyState";

export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="mx-auto max-w-3xl px-5 pt-40">
      <EmptyState
        art="error"
        title="Something went wrong"
        actions={[{ label: "Try again", primary: true, onClick: retry }, { label: "Go home", href: "/" }]}
      >
        We couldn&apos;t load this page. Check your connection and try again.
      </EmptyState>
    </div>
  );
}
