import type { Metadata } from "next";

import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export const metadata: Metadata = {
  title: "A2A Commerce Gateway",
  description:
    "The reputation-aware storefront that sells to machines. Connect buyer agents over MCP, score reputation in real time, and oversee every transaction.",
};

export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="marketing-shell">
      <MarketingHeader />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}
