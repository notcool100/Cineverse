import Link from "next/link";
import type { ReactNode } from "react";

export type Illustration = "list" | "search" | "error" | "source";

function Art({ kind }: { kind: Illustration }) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg viewBox="0 0 120 96" className="mx-auto mb-6 h-24 w-auto text-white/35" aria-hidden>
      <ellipse cx="60" cy="88" rx="38" ry="4" fill="currentColor" opacity=".15" />
      {kind === "list" && (
        <g {...stroke}>
          <rect x="28" y="18" width="64" height="62" rx="8" />
          <path d="M40 38h40M40 50h28M40 62h34" />
          <circle cx="92" cy="22" r="14" fill="var(--background)" stroke="var(--accent)" />
          <path d="M92 16v12M86 22h12" stroke="var(--accent)" />
        </g>
      )}
      {kind === "search" && (
        <g {...stroke}>
          <circle cx="52" cy="42" r="24" />
          <path d="m70 60 22 22" stroke="var(--accent)" />
          <path d="M42 42h20M52 32v20" opacity=".4" transform="rotate(45 52 42)" />
        </g>
      )}
      {kind === "error" && (
        <g {...stroke}>
          <path d="M60 14 104 80H16Z" />
          <path d="M60 40v22" stroke="var(--accent)" />
          <circle cx="60" cy="71" r="1.5" fill="var(--accent)" />
        </g>
      )}
      {kind === "source" && (
        <g {...stroke}>
          <rect x="22" y="16" width="76" height="46" rx="8" />
          <path d="M60 62v12M40 78h40" />
          <path d="m52 28 16 11-16 11Z" opacity=".5" />
          <path d="m82 12 14 14M96 12 82 26" stroke="var(--accent)" />
        </g>
      )}
    </svg>
  );
}

export type EmptyAction = { label: string; href?: string; onClick?: () => void; primary?: boolean };

/** Friendly dead-end: an illustration, one sentence of what happened, and clear next steps. */
export function EmptyState({
  art,
  title,
  children,
  actions = [],
  className = "py-20",
}: {
  art: Illustration;
  title: string;
  children?: ReactNode;
  actions?: EmptyAction[];
  className?: string;
}) {
  return (
    <div role="status" className={`text-center ${className}`}>
      <Art kind={art} />
      <p className="text-lg font-semibold">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-md text-white/60">{children}</p>}
      {actions.length > 0 && (
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {actions.map((a) => {
            const cls = `rounded-full px-6 py-2.5 text-sm font-semibold transition ${a.primary ? "bg-white text-black hover:bg-white/90" : "glass hover:bg-white/15"}`;
            return a.href ? (
              <Link key={a.label} href={a.href} className={cls}>{a.label}</Link>
            ) : (
              <button key={a.label} type="button" onClick={a.onClick} className={cls}>{a.label}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}
