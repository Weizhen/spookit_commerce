import type { Metadata } from "next";

import { ConsoleHeader } from "@/components/console-header";
import { MainNav } from "@/components/main-nav";

export const metadata: Metadata = {
  title: "Operations Console",
  description:
    "Industrial control console for the SpookIT A2A commerce gateway — operations, CRM, catalog, and governance.",
};

export default function ConsoleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="console-shell relative z-10 mx-auto max-w-[1400px] px-4 py-5">
      <ConsoleHeader />
      <MainNav />
      <main className="mt-5">{children}</main>
    </div>
  );
}
