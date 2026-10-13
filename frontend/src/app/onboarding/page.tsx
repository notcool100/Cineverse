import type { Metadata } from "next";
import { Onboarding } from "@/components/Onboarding";

export const metadata: Metadata = { title: "Pick your favourites" };

export default function OnboardingPage() {
  return <Onboarding />;
}
