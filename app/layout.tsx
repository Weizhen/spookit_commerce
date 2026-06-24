import type { Metadata } from "next";

import "./globals.css";
import { ConsoleHeader } from "@/components/console-header";
import { MainNav } from "@/components/main-nav";

export const metadata: Metadata = {
  title: "Spookit Autonomous A2A Commerce Console",
  description:
    "The reputation-aware storefront that sells to machines. A2A commerce gateway, merchandising portal, and agent CRM.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="relative z-10 mx-auto max-w-[1400px] px-4 py-5">
          <ConsoleHeader />
          <MainNav />
          <main className="mt-5">{children}</main>
        </div>
      </body>
    </html>
  );
}
