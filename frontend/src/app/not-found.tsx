import { EmptyState } from "@/components/EmptyState";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-5 pt-40">
      <EmptyState art="search" title="We can't find that page" actions={[{ label: "Go home", href: "/", primary: true }, { label: "Browse everything", href: "/browse" }]}>
        The title may have been removed, or the link is mistyped.
      </EmptyState>
    </div>
  );
}
