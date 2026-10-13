import { Suspense } from "react";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Navbar } from "@/components/Navbar";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Cineora", template: "%s · Cineora" },
  description: "Stream public-domain and licensed films.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Suspense>
          <Navbar />
        </Suspense>
        <main className="flex-1">{children}</main>
        <footer className="mt-16 border-t border-white/8 px-4 py-8 text-center text-xs text-white/35">
          Metadata courtesy of TMDB. Cineora streams only licensed or public-domain content.
        </footer>
      </body>
    </html>
  );
}
