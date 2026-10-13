import Image from "next/image";
import type { Title } from "@/lib/types";

/** Gradient shown behind/under artwork and as the fallback while it loads. */
export function posterStyle(t: Title) {
  return {
    backgroundImage: `radial-gradient(90% 60% at 15% 0%, ${t.accent[0]} 0%, transparent 70%), radial-gradient(80% 60% at 100% 100%, ${t.accent[0]}aa 0%, transparent 65%), linear-gradient(180deg, ${t.accent[0]}55, ${t.accent[1]} 60%, #08080a)`,
  };
}

/** Tiny tinted placeholder so artwork fades in over its own colour instead of popping in. */
export function blurData(color: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 3'><rect width='2' height='3' fill='${color}'/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
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
  if (!title.poster) return null; // titles without artwork fall back to the gradient behind
  return (
    <Image
      src={title.poster}
      alt={`${title.name} poster`}
      fill
      sizes={sizes}
      priority={priority}
      placeholder="blur"
      blurDataURL={blurData(title.accent[0])}
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
  if (!title.backdrop) return null;
  return (
    <Image
      src={title.backdrop}
      alt=""
      fill
      sizes="100vw"
      priority={priority}
      placeholder="blur"
      blurDataURL={blurData(title.accent[1])}
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
