"use client";

import { useEffect, useState } from "react";

// Set INTRO_ENABLED to false to disable the intro entirely.
export const INTRO_ENABLED = true;
const SEEN_KEY = "cineora:intro-seen";

// Runs in <head> before first paint: marks <html> so the (server-rendered) overlay is hidden
// for repeat visits in the same tab session and for reduced-motion users. Refresh re-plays it
// only if the tab session is new; to replay on every full load, drop the sessionStorage check.
export const INTRO_SCRIPT = `try{var e=document.documentElement;if(sessionStorage.getItem("${SEEN_KEY}")||matchMedia("(prefers-reduced-motion: reduce)").matches||e.dataset.motion==="reduce")e.dataset.intro="skip"}catch(_){}`;

// Swap this for the final logo asset (e.g. <img src="/logo.svg" alt="" />) when available.
function CineoraLogo() {
  return (
    <div className="ci-logo" aria-hidden="true">
      <span className="ci-word">CINE</span>
      <svg className="ci-reel" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="42" stroke="var(--accent)" strokeWidth="9" />
        <circle cx="50" cy="50" r="7" fill="var(--accent)" />
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <circle
            key={a}
            cx="50"
            cy="27"
            r="6"
            fill="var(--accent)"
            transform={`rotate(${a} 50 50)`}
          />
        ))}
      </svg>
      <span className="ci-word">RA</span>
    </div>
  );
}

export function CineoraIntro() {
  // Always render on first pass (matches server markup); the head script hides it via CSS when skipped.
  const [done, setDone] = useState(!INTRO_ENABLED);

  useEffect(() => {
    if (done) return;
    const skip = document.documentElement.dataset.intro === "skip";
    const t = window.setTimeout(() => setDone(true), skip ? 0 : 2300);
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {}
    return () => window.clearTimeout(t);
  }, [done]);

  if (done) return null;
  return (
    <div className="ci-overlay" role="presentation">
      <div className="ci-glow" />
      <CineoraLogo />
    </div>
  );
}
