import { asc } from "drizzle-orm";

import { db } from "@/db/client";
import { commercialRules } from "@/db/commerce/schema";
import { DbNotice } from "@/components/db-notice";

export const dynamic = "force-dynamic";

export default async function GovernancePage() {
  let rules;
  try {
    rules = await db
      .select()
      .from(commercialRules)
      .orderBy(asc(commercialRules.layer), asc(commercialRules.priority));
  } catch (err) {
    return <DbNotice error={err instanceof Error ? err.message : String(err)} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="zone-label">
        <span className="tick" /> GOVERNANCE — COMMERCIAL RULES ({rules.length})
      </div>
      <p style={{ color: "var(--dim)", fontSize: "0.8rem" }}>
        Layered, prioritized policy. BASE applies first, then CAMPAIGN overrides;
        within a layer the lowest priority number wins. CRM-aware conditions
        (agent DID / CRM segment) let a rule target a specific agent or segment.
      </p>
      <div className="panel" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "var(--dim)", fontSize: "0.66rem" }}>
              <Th>Layer</Th>
              <Th>Pri</Th>
              <Th>Name</Th>
              <Th>Conditions</Th>
              <Th>Action</Th>
              <Th>Tier / Disc</Th>
              <Th>On</Th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid var(--stroke)" }}>
                <Td>
                  <span
                    className={`pill ${r.layer === "BASE" ? "pill-standard" : "pill-throttled"}`}
                  >
                    {r.layer}
                  </span>
                </Td>
                <Td>{r.priority}</Td>
                <Td>{r.name}</Td>
                <Td dim>
                  {conditionSummary(r)}
                </Td>
                <Td mono>{r.action}</Td>
                <Td dim>
                  {r.tier} / {r.discountPct}%
                </Td>
                <Td>
                  <span
                    className={`pill ${r.enabled ? "pill-premium" : "pill-rejected"}`}
                  >
                    {r.enabled ? "ON" : "OFF"}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function conditionSummary(r: {
  segment: string;
  intent: string;
  minRank: number;
  maxRank: number;
  agentDid: string;
  crmSegment: string;
}): string {
  const parts: string[] = [`rank ${r.minRank}-${r.maxRank}`];
  if (r.segment !== "ANY") parts.push(`seg=${r.segment}`);
  if (r.intent !== "ANY") parts.push(`intent=${r.intent}`);
  if (r.crmSegment !== "ANY") parts.push(`crm=${r.crmSegment}`);
  if (r.agentDid !== "ANY") parts.push(`did=${r.agentDid}`);
  return parts.join(" · ");
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
