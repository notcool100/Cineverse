"use client";

/** Shared building blocks for the admin panel sections. */
export const input = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-accent";
export const btn = "rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black disabled:opacity-40";
export const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

export function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold">{title}</h2>
      {hint && <p className="mb-4 mt-1 max-w-3xl text-sm text-white/55">{hint}</p>}
      <div className="glass space-y-3 rounded-2xl p-5">{children}</div>
    </section>
  );
}

export function Msg({ ok, text }: { ok?: boolean; text: string | null }) {
  return text ? <p className={`text-sm ${ok ? "text-emerald-300" : "text-red-300"}`}>{text}</p> : null;
}
