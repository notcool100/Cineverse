import Link from "next/link";

const TABS = [
  { href: "/new", label: "New & Popular" },
  { href: "/coming-soon", label: "Coming soon" },
] as const;

/** Sub-navigation shared by the New & Popular and Coming soon pages. */
export function NewTabs({ active }: { active: (typeof TABS)[number]["href"] }) {
  return (
    <nav aria-label="New and upcoming" className="mb-6 flex gap-2">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === active ? "page" : undefined}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${t.href === active ? "bg-white text-black" : "glass-soft text-white/70 hover:text-white"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
