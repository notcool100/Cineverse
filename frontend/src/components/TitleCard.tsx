import Link from "next/link";
import type { Title } from "@/lib/types";
import { PlayGlyph, PosterImage, posterStyle } from "./Poster";

export function TitleCard({ title }: { title: Title }) {
  return (
    <Link
      href={`/title/${title.id}`}
      className="group relative block aspect-[2/3] w-40 shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 shadow-lg shadow-black/50 transition duration-300 hover:-translate-y-1.5 hover:border-white/30 hover:shadow-2xl hover:shadow-black/70 sm:w-48"
      style={posterStyle(title)}
    >
      <PosterImage
        title={title}
        sizes="(min-width: 640px) 192px, 160px"
        className="transition duration-500 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-black/0 transition duration-300 group-hover:bg-black/45" />
      <span className="glass absolute left-1/2 top-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 scale-75 place-items-center rounded-full text-white opacity-0 transition duration-300 group-hover:scale-100 group-hover:opacity-100">
        <PlayGlyph className="ml-0.5 size-5" />
      </span>
      <div className="absolute inset-x-0 bottom-0 translate-y-1 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-3.5 pt-16 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
        <p className="text-sm font-semibold leading-tight">{title.name}</p>
        <p className="mt-1 text-xs text-white/65">
          {title.year} · {title.genres[0]}
        </p>
      </div>
    </Link>
  );
}
