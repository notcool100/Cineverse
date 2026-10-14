"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { getNotifications, markNotificationsRead, type AppNotification } from "@/lib/client-api";
import { useProfile } from "./useProfile";
import { useUser } from "./useSession";

const POLL_MS = 60_000;

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

/** Bell with unread count; polls while the tab is visible and lists new sources, episodes and releases. */
export function NotificationBell() {
  const user = useUser();
  const profile = useProfile();
  const [data, setData] = useState<{ unread: number; items: AppNotification[] } | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();

  const load = useCallback(() => getNotifications().then(setData).catch(() => {}), []);
  useEffect(() => {
    if (!user) return;
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && void load(), POLL_MS);
    const onVis = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
    // Re-fetch when the active profile changes: notifications are per profile.
  }, [user, profile?.id, load]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  if (!user) return null;
  const unread = data?.unread ?? 0;

  const read = (ids?: string[]) => {
    setData((d) => d && { unread: ids ? Math.max(0, d.unread - d.items.filter((n) => !n.read && ids.includes(n.id)).length) : 0, items: d.items.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)) });
    markNotificationsRead(ids).catch(() => {});
  };

  return (
    <div ref={box} className="relative ml-1">
      <button
        type="button"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="relative grid size-9 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span aria-hidden className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-4 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div id={id} role="dialog" aria-label="Notifications" className="glass-menu absolute right-0 top-full z-50 mt-3 w-80 max-w-[calc(100vw-2rem)] rounded-2xl p-2 text-sm">
          <div className="flex items-center justify-between px-2 pb-1 pt-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={() => read()} className="text-xs text-white/60 underline hover:text-white">
                Mark all read
              </button>
            )}
          </div>
          {!data?.items.length ? (
            <p className="px-2 py-6 text-center text-white/50">Nothing new. We&apos;ll tell you when a title on your list is ready or gets new episodes.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {data.items.map((n) => (
                <li key={n.id}>
                  <Link
                    href={`/title/${n.title.slug}`}
                    onClick={() => {
                      if (!n.read) read([n.id]);
                      setOpen(false);
                    }}
                    className="flex items-start gap-3 rounded-xl p-2 hover:bg-white/8"
                  >
                    <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-accent"}`} />
                    <span className="min-w-0 flex-1">
                      <span className={`block ${n.read ? "text-white/65" : "font-medium"}`}>{n.message}</span>
                      <span className="text-xs text-white/40">{ago(n.createdAt)} ago</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
