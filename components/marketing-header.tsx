import Link from "next/link";

import { SpookitLogo } from "@/components/spookit-logo";

export function MarketingHeader() {
  return (
    <header className="marketing-header">
      <div className="marketing-container marketing-header-inner">
        <Link href="/" className="marketing-logo">
          <SpookitLogo suffix="Commerce" iconSize={32} />
        </Link>
        <nav className="marketing-nav" aria-label="Primary">
          <a href="#concept">Concept</a>
          <a href="#workflow">Workflow</a>
          <a href="#test">Test it</a>
          <a
            href="https://www.spookit.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            SpookIT Home
          </a>
          <Link href="/dashboard" className="marketing-btn marketing-btn-primary">
            Open Console
          </Link>
        </nav>
      </div>
    </header>
  );
}
