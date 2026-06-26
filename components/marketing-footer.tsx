import Link from "next/link";

import { SpookitLogo } from "@/components/spookit-logo";

export function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <div className="marketing-container marketing-footer-inner">
        <div>
          <p className="marketing-footer-brand">
            <SpookitLogo suffix="Commerce" iconSize={24} />
          </p>
          <p className="marketing-footer-tagline">
            Part of the SpookIT AI platform — intelligence for everyday life.
          </p>
        </div>
        <div className="marketing-footer-links">
          <Link href="/dashboard">Operations Console</Link>
          <Link href="/a2a">A2A Spec</Link>
          <a
            href="https://www.spookit.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            spookit.com
          </a>
        </div>
        <p className="marketing-footer-copy">
          © {new Date().getFullYear()} SpookIT. Public demo — gate before
          commercial use.
        </p>
      </div>
    </footer>
  );
}
