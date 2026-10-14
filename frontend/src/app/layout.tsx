import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ProfileBootstrap } from "@/components/ProfileBootstrap";
import { PwaRegister } from "@/components/PwaRegister";
import { VerifyBanner } from "@/components/VerifyBanner";
import { MobileTabBar } from "@/components/MobileTabBar";
import { Navbar } from "@/components/Navbar";
import { CineoraIntro, INTRO_SCRIPT } from "@/components/CineoraIntro";
import { THEME_SCRIPT } from "@/lib/prefs";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Cineora", template: "%s · Cineora" },
  description: "Stream public-domain and licensed films.",
  applicationName: "Cineora",
  appleWebApp: { capable: true, title: "Cineora", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#08080a" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT + INTRO_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <CineoraIntro />
        <PwaRegister />
        <a
          href="#main"
          className="fixed left-3 top-3 z-[60] -translate-y-20 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black focus:translate-y-0"
        >
          Skip to content
        </a>
        <Suspense>
          <Navbar />
          <ProfileBootstrap />
          <MobileTabBar />
          <VerifyBanner />
        </Suspense>
        <main id="main" className="flex-1">{children}</main>
        <footer className="mt-16 border-t border-white/8 px-4 py-8 text-center text-xs text-white/35">
          Metadata courtesy of TMDB. Cineora streams only licensed or public-domain content.
        </footer>
      </body>
    </html>
  );
}
