import { DbNotice } from "@/components/db-notice";
import { DecisionPill } from "@/components/decision-pill";
import { Stat } from "@/components/stat";
import { getOpsSnapshot, getRevenueSnapshot } from "@/services/commerce/analytics";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  let snapshot;
  let revenue;
  try {
    [snapshot, revenue] = await Promise.all([
      getOpsSnapshot(),
      getRevenueSnapshot(),
    ]);
  } catch (err) {
    return <DbNotice error={err instanceof Error ? err.message : String(err)} />;
  }

  const fmt = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="zone-label">
          <span className="tick" /> COMMERCIAL PERFORMANCE OVERVIEW
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Stat label="Total A2A Requests" value={snapshot.totalRequests} />
          <Stat label="Avg Trust Rank" value={snapshot.avgRank} accent="cyan" />
          <Stat
            label="Premium Conversion"
            value={`${snapshot.premiumConversionPct}%`}
            accent="green"
          />
          <Stat label="Paid Orders" value={revenue.paidOrders} />
          <Stat
            label="Net Revenue"
            value={fmt(revenue.netRevenue)}
            accent="amber"
          />
          <Stat
            label="Refunded"
            value={fmt(revenue.refundedAmount)}
            accent="red"
          />
        </div>
      </section>

      <section>
        <div className="zone-label">
          <span className="tick" /> DECISION MIX
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="Premium"
            value={snapshot.decisionMix.PREMIUM}
            accent="green"
          />
          <Stat
            label="Standard"
            value={snapshot.decisionMix.STANDARD}
            accent="cyan"
          />
          <Stat
            label="Throttled"
            value={snapshot.decisionMix.THROTTLED}
            accent="amber"
          />
          <Stat
            label="Rejected"
            value={snapshot.decisionMix.REJECTED}
            accent="red"
          />
        </div>
      </section>

      <section>
        <div className="zone-label">
          <span className="tick" /> LIVE A2A ACTIVITY FEED
        </div>
        <div className="panel" style={{ overflow: "hidden" }}>
          {snapshot.recent.length === 0 ? (
            <p style={{ padding: 20, color: "var(--dim)", fontSize: "0.85rem" }}>
              No agent traffic yet. Once buyer agents hit the A2A endpoint,
              scored requests stream here in real time.
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "var(--dim)", fontSize: "0.66rem" }}>
                  <Th>Time</Th>
                  <Th>Agent DID</Th>
                  <Th>Intent</Th>
                  <Th>Rank</Th>
                  <Th>Decision</Th>
                </tr>
              </thead>
              <tbody>
                {snapshot.recent.map((tx) => (
                  <tr
                    key={tx.id}
                    style={{ borderTop: "1px solid var(--stroke)" }}
                  >
                    <Td dim>{new Date(tx.ts).toLocaleTimeString()}</Td>
                    <Td mono>{tx.did}</Td>
                    <Td dim>{tx.intent}</Td>
                    <Td>{tx.rank}</Td>
                    <Td>
                      <DecisionPill decision={tx.decision} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "10px 14px",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        fontWeight: 600,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  dim,
  mono,
}: {
  children: React.ReactNode;
  dim?: boolean;
  mono?: boolean;
}) {
  return (
    <td
      style={{
        padding: "10px 14px",
        fontSize: "0.8rem",
        color: dim ? "var(--dim)" : "var(--text)",
        fontFamily: mono ? "var(--font-mono)" : undefined,
      }}
    >
      {children}
    </td>
  );
}
