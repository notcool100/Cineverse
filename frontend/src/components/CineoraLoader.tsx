import { CineoraMark } from "./CineoraMark";

/** Branded loading state for the player: a slowly turning reel under the wordmark, with a status line. */
export function CineoraLoader({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div role="status" aria-label={label} className={`flex flex-col items-center gap-4 ${className}`}>
      <CineoraMark className="cl-reel size-12" />
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">{label}</p>
    </div>
  );
}
