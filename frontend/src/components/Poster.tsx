import Image from "next/image";
import type { Title } from "@/lib/types";

/** Gradient shown behind/under artwork and as the fallback while it loads. */
export function posterStyle(t: Title) {
  return {
    backgroundImage: `radial-gradient(90% 60% at 15% 0%, ${t.accent[0]} 0%, transparent 70%), radial-gradient(80% 60% at 100% 100%, ${t.accent[0]}aa 0%, transparent 65%), linear-gradient(180deg, ${t.accent[0]}55, ${t.accent[1]} 60%, #08080a)`,
  };
}

export function PosterImage({
  title,
  sizes,
  priority,
  className = "",
}: {
  title: Title;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={title.poster}
      alt={`${title.name} poster`}
      fill
      sizes={sizes}
      priority={priority}
      className={`object-cover ${className}`}
    />
  );
}

export function BackdropImage({
  title,
  priority,
  className = "",
}: {
  title: Title;
  priority?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={title.backdrop}
      alt=""
      fill
      sizes="100vw"
      priority={priority}
      className={`object-cover ${className}`}
    />
  );
}

export function PlayGlyph({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}
