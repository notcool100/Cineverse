import Image from "next/image";
import type { Credits } from "@/lib/types";

function Avatar({ name, photo, size }: { name: string; photo: string; size: number }) {
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return photo ? (
    <Image src={photo} alt={name} width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden className="grid place-items-center rounded-full bg-white/10 font-semibold text-white/60" style={{ width: size, height: size }}>
      {initials}
    </span>
  );
}

/** Key crew (director, writers) as a compact list, then a scrolling "Top billed cast" strip with TMDB photos. */
export function CastCrew({ credits }: { credits: Credits }) {
  const { cast, crew } = credits;
  if (cast.length === 0 && crew.length === 0) return null;
  return (
    <section aria-label="Cast and crew" className="mx-auto w-full max-w-7xl px-5 sm:px-10">
      {crew.length > 0 && (
        <ul className="mb-10 flex flex-wrap gap-x-10 gap-y-5">
          {crew.map((p) => (
            <li key={`${p.name}-${p.job}`} className="flex items-center gap-3">
              <Avatar name={p.name} photo={p.photo} size={48} />
              <div>
                <p className="font-semibold leading-tight">{p.name}</p>
                <p className="text-sm text-white/60">{p.job}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {cast.length > 0 && (
        <>
          <h2 className="mb-5 flex items-center gap-3 text-xl font-semibold tracking-tight">
            <span className="h-4 w-1 rounded-full bg-accent" aria-hidden />
            Top billed cast
          </h2>
          <ul className="no-scrollbar -mx-5 flex snap-x gap-5 overflow-x-auto px-5 pb-4 sm:-mx-10 sm:px-10">
            {cast.map((p, i) => (
              <li key={`${p.name}-${i}`} className="w-28 shrink-0 snap-start text-center">
                <div className="mx-auto mb-3 w-fit">
                  <Avatar name={p.name} photo={p.photo} size={112} />
                </div>
                <p className="text-sm font-semibold leading-tight">{p.name}</p>
                {p.character && <p className="mt-0.5 text-xs text-white/60">{p.character}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
