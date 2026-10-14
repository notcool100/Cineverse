"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getReminders, setReminder } from "@/lib/client-api";
import { useUser } from "./useSession";

/** "Remind me" toggle for a coming-soon title; the bell notifies once on release day. */
export function RemindButton({ titleId, titleName }: { titleId: string; titleName: string }) {
  const user = useUser();
  const router = useRouter();
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!user) return;
    let live = true;
    getReminders().then((r) => live && setOn(r.includes(titleId))).catch(() => {});
    return () => {
      live = false;
    };
  }, [user, titleId]);

  async function toggle() {
    if (!user) return router.push("/login?next=/coming-soon");
    const was = on;
    setOn(!was);
    try {
      await setReminder(titleId, !was);
    } catch {
      setOn(was);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? `Remove reminder for ${titleName}` : `Remind me about ${titleName}`}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition ${on ? "bg-white text-black" : "bg-white/15 hover:bg-white/25"}`}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {on ? "Reminder set" : "Remind me"}
    </button>
  );
}
