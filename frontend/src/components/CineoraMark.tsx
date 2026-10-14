// Film-reel mark shared by the navbar; uses the user's accent colour.
export function CineoraMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <circle cx="50" cy="50" r="42" stroke="var(--accent)" strokeWidth="9" />
      <circle cx="50" cy="50" r="7" fill="var(--accent)" />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <circle key={a} cx="50" cy="27" r="6" fill="var(--accent)" transform={`rotate(${a} 50 50)`} />
      ))}
    </svg>
  );
}
