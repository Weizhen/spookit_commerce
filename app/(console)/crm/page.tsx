import { DbNotice } from "@/components/db-notice";
import { listAgents } from "@/services/crm";

export const dynamic = "force-dynamic";

const SEG_CLASS: Record<string, string> = {
  VIP: "pill pill-premium",
  Growth: "pill pill-standard",
  Watchlist: "pill pill-throttled",
  Blocked: "pill pill-rejected",
};

export default async function CrmPage() {
  let records;
  try {
    records = await listAgents();
  } catch (err) {
    return <DbNotice error={err instanceof Error ? err.message : String(err)} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="zone-label">
        <span className="tick" /> AGENT CRM ({records.length})
      </div>
      <p style={{ color: "var(--dim)", fontSize: "0.8rem" }}>
        Connected buyer agents (self-identified on first handshake), their
        curated segment, LTV, and order count. Segments feed CRM-scoped
        commercial rules.
      </p>
      <div className="panel" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "var(--dim)", fontSize: "0.66rem" }}>
              <Th>DID</Th>
              <Th>Display Name</Th>
              <Th>Segment</Th>
              <Th>LTV</Th>
              <Th>Orders</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  style={{ padding: 20, color: "var(--dim)", fontSize: "0.85rem" }}
                >
                  No agents yet. Agents appear here after their first successful
                  handshake on the A2A endpoint.
                </td>
              </tr>
            ) : (
              records.map((r) => (
                <tr
                  key={r.agent.did}
                  style={{ borderTop: "1px solid var(--stroke)" }}
                >
                  <Td mono>{r.agent.did}</Td>
                  <Td>{r.agent.displayName}</Td>
                  <Td>
                    <span
                      className={
                        SEG_CLASS[r.crm?.segment ?? "Growth"] ??
                        "pill pill-standard"
                      }
                    >
                      {r.crm?.segment ?? "Growth"}
                    </span>
                  </Td>
                  <Td>${Number(r.crm?.ltvUsd ?? 0).toLocaleString()}</Td>
                  <Td>{r.crm?.totalOrders ?? 0}</Td>
                  <Td>
                    <span
                      className={`pill ${r.agent.status === "active" ? "pill-premium" : "pill-rejected"}`}
                    >
                      {r.agent.status}
                    </span>
                  </Td>
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
