import Link from "next/link";

/** Page numbers with ellipses, e.g. 1 … 4 5 [6] 7 8 … 20. */
function pageList(page: number, last: number): (number | "gap")[] {
  const keep = new Set([1, last, page - 1, page, page + 1].filter((n) => n >= 1 && n <= last));
  const out: (number | "gap")[] = [];
  let prev = 0;
  for (const n of [...keep].sort((a, b) => a - b)) {
    if (n - prev > 1) out.push("gap");
    out.push(n);
    prev = n;
  }
  return out;
}

export function Pagination({
  page,
  totalPages,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  const base = "grid h-10 min-w-10 place-items-center rounded-full px-3 text-sm transition-colors";
  const arrow = (to: number, label: string, disabled: boolean) =>
    disabled ? (
      <span aria-disabled className={`${base} text-white/25`}>{label}</span>
    ) : (
      <Link href={hrefFor(to)} className={`${base} glass hover:bg-white/15`}>{label}</Link>
    );
  return (
    <nav aria-label="Pagination" className="mt-12 flex flex-wrap items-center justify-center gap-1.5">
      {arrow(page - 1, "← Prev", page <= 1)}
      {pageList(page, totalPages).map((n, i) =>
        n === "gap" ? (
          <span key={`g${i}`} className="px-1 text-white/30">…</span>
        ) : (
          <Link
            key={n}
            href={hrefFor(n)}
            aria-current={n === page ? "page" : undefined}
            className={`${base} ${n === page ? "bg-white font-semibold text-black" : "text-white/65 hover:bg-white/10 hover:text-white"}`}
          >
            {n}
          </Link>
        ),
      )}
      {arrow(page + 1, "Next →", page >= totalPages)}
    </nav>
  );
}
