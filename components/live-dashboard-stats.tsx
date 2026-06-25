"use client";

import { useCallback, useEffect, useState } from "react";

import { Stat } from "@/components/stat";
import type {
  DashboardStats,
  RevenueSnapshot,
} from "@/services/commerce/analytics";
import type { Decision } from "@/services/commerce/types";

const STATS_POLL_MS = 30_000;

function fmtUsd(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
}

export function LiveDashboardStats({
  initial,
  initialRevenue,
}: {
  initial: Omit<DashboardStats, "revenue">;
  initialRevenue: RevenueSnapshot;
}) {
  const [stats, setStats] = useState({ ...initial, revenue: initialRevenue });

  const poll = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    try {
      const res = await fetch("/api/dashboard/stats", { cache: "no-store" });
      if (!res.ok) return;
      setStats((await res.json()) as DashboardStats);
    } catch {
      /* keep last good snapshot */
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => void poll(), STATS_POLL_MS);
    return () => window.clearInterval(id);
  }, [poll]);

  const mix = stats.decisionMix;

  return (
    <>
      <section>
        <div className="zone-label">
          <span className="tick" /> COMMERCIAL PERFORMANCE OVERVIEW
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Stat label="Total A2A Requests" value={stats.totalRequests} />
          <Stat label="Avg Trust Rank" value={stats.avgRank} accent="cyan" />
          <Stat
            label="Premium Conversion"
            value={`${stats.premiumConversionPct}%`}
            accent="green"
          />
          <Stat label="Paid Orders" value={stats.revenue.paidOrders} />
          <Stat
            label="Net Revenue"
            value={fmtUsd(stats.revenue.netRevenue)}
            accent="amber"
          />
          <Stat
            label="Refunded"
            value={fmtUsd(stats.revenue.refundedAmount)}
            accent="red"
          />
        </div>
      </section>

      <section>
        <div className="zone-label">
          <span className="tick" /> DECISION MIX
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(
            [
              ["Premium", "PREMIUM", "green"],
              ["Standard", "STANDARD", "cyan"],
              ["Throttled", "THROTTLED", "amber"],
              ["Rejected", "REJECTED", "red"],
            ] as const
          ).map(([label, key, accent]) => (
            <Stat
              key={key}
              label={label}
              value={mix[key as Decision]}
              accent={accent}
            />
          ))}
        </div>
      </section>
    </>
  );
}
