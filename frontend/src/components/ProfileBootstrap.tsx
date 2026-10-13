"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getProfiles, saveProfile } from "@/lib/client-api";
import { isOnboarded } from "@/lib/onboarding";
import { useProfile } from "./useProfile";
import { useUser } from "./useSession";

/** Signed in without a chosen profile: auto-pick when there is one, otherwise ask. Also drops a profile that was deleted elsewhere. */
export function ProfileBootstrap() {
  const user = useUser();
  const profile = useProfile();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (!user) return;
    let live = true;
    getProfiles()
      .then((list) => {
        if (!live) return;
        const current = profile && list.find((p) => p.id === profile.id);
        if (current) {
          if (current.name !== profile.name || current.isKids !== profile.isKids || current.avatar !== profile.avatar) saveProfile(current);
        } else if (list.length === 1) saveProfile(list[0]);
        else if (path !== "/profiles") {
          saveProfile(null);
          router.replace("/profiles");
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  // First visit to the home page after signing in: ask for taste picks once (not for kids profiles).
  useEffect(() => {
    if (user && profile && !profile.isKids && path === "/" && !isOnboarded(user.id)) router.replace("/onboarding");
  }, [user, profile, path, router]);
  return null;
}
