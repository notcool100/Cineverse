/** Placeholders that occupy exactly the space of the real card/row/hero, so content lands without layout shift. */
export function PosterSkeleton() {
  return <div aria-hidden className="skeleton aspect-[2/3] w-40 shrink-0 rounded-2xl sm:w-48" />;
}

export function RowSkeleton({ count = 8, heading = true }: { count?: number; heading?: boolean }) {
  return (
    <section aria-busy="true" aria-label="Loading">
      {heading && <div aria-hidden className="skeleton mb-4 ml-5 h-5 w-40 rounded sm:ml-10" />}
      <div className="no-scrollbar flex gap-4 overflow-hidden px-5 pb-6 pt-1 sm:px-10">
        {Array.from({ length: count }, (_, i) => (
          <PosterSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}

export function GridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="grid grid-cols-2 justify-items-center gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden className="skeleton aspect-[2/3] w-40 rounded-2xl sm:w-48" />
      ))}
    </div>
  );
}

export function HeroSkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading" className="flex min-h-[92vh] items-end">
      <div className="mx-auto w-full max-w-7xl px-5 pb-24 pt-40 sm:px-10">
        <div className="max-w-xl space-y-5">
          <div className="skeleton h-3 w-32 rounded" />
          <div className="skeleton h-16 w-4/5 rounded-xl" />
          <div className="skeleton h-4 w-2/3 rounded" />
          <div className="skeleton h-20 rounded" />
          <div className="skeleton h-12 w-48 rounded-md" />
        </div>
      </div>
    </section>
  );
}
