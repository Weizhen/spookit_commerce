import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SpookIT Commerce — A2A Gateway",
    template: "%s · SpookIT Commerce",
  },
  description:
    "The reputation-aware storefront that sells to machines. Autonomous agent-to-agent commerce over MCP.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
