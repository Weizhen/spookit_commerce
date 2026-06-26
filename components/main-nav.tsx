"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Operations" },
  { href: "/campaigns", label: "Campaigns & Offers" },
  { href: "/catalog", label: "Catalog & Orders" },
  { href: "/crm", label: "Agent CRM" },
  { href: "/governance", label: "Governance" },
  { href: "/a2a", label: "A2A Spec" },
];

export function MainNav() {
  const pathname = usePathname();
  return (
    <nav className="console-nav mt-4">
      {LINKS.map((link) => {
        const active =
          link.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className="nav-link"
            data-active={active}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
