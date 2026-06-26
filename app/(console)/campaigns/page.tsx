import { desc } from "drizzle-orm";

import { db } from "@/db/client";
import { campaigns } from "@/db/commerce/schema";
import { DbNotice } from "@/components/db-notice";
import { Stat } from "@/components/stat";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  let rows;
  try {
    rows = await db
      .select()
      .from(campaigns)
      .orderBy(desc(campaigns.id))
      .limit(50);
  } catch (err) {
    return <DbNotice error={err instanceof Error ? err.message : String(err)} />;
  }

  const totalRevenue = rows.reduce((s, c) => s + c.projectedRevenue, 0);
  const totalEngaged = rows.reduce((s, c) => s + c.engaged, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="zone-label">
        <span className="tick" /> CAMPAIGNS & OFFERS
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Campaigns" value={rows.length} />
        <Stat label="Total Engaged" value={totalEngaged} accent="green" />
        <Stat
          label="Projected Revenue"
          value={`$${(totalRevenue / 1000).toFixed(1)}k`}
          accent="amber"
        />
        <Stat
          label="Categories"
          value={new Set(rows.map((r) => r.productCategory)).size}
          accent="cyan"
        />
      </div>
      <p style={{ color: "var(--dim)", fontSize: "0.8rem" }}>
        Dispatch + targeting controls land in a later phase; this view shows
        dispatched campaign performance (targeted / engaged / projected revenue).
      </p>
      <div className="panel panel-scroll">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "var(--dim)", fontSize: "0.66rem" }}>
              <Th>Name</Th>
              <Th>Category</Th>
              <Th>Promo</Th>
              <Th>Disc</Th>
              <Th>Targeted</Th>
              <Th>Engaged</Th>
              <Th>Projected</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{ padding: 20, color: "var(--dim)", fontSize: "0.85rem" }}
                >
                  No campaigns dispatched yet.
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id} style={{ borderTop: "1px solid var(--stroke)" }}>
                  <Td>{c.name}</Td>
                  <Td dim>{c.productCategory}</Td>
                  <Td dim>{c.promoType}</Td>
                  <Td>{c.offerDiscountPct}%</Td>
                  <Td>
                    {c.targeted}/{c.subscribers}
                  </Td>
                  <Td>{c.engaged}</Td>
                  <Td>${c.projectedRevenue.toLocaleString()}</Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <td
      style={{
        padding: "10px 14px",
        fontSize: "0.8rem",
        color: dim ? "var(--dim)" : "var(--text)",
      }}
    >
      {children}
    </td>
  );
}
