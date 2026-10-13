import type { Metadata } from "next";
import { AdminPanel } from "@/components/AdminPanel";

export const metadata: Metadata = { title: "Admin" };

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 pb-12 pt-28 sm:px-10">
      <h1 className="mb-8 text-4xl font-bold tracking-tight">Admin</h1>
      <AdminPanel />
    </div>
  );
}
