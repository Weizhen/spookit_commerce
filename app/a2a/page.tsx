export const dynamic = "force-dynamic";

const OPEN_TOOLS = [
  ["describe_service", "Capabilities + commercial terms + identification scheme"],
];

const IDENTIFIED_TOOLS: [string, string][] = [
  ["subscribe", "Register offer preferences / targeting"],
  ["search_products", "Search catalog (tier-aware pricing)"],
  ["get_product", "Product detail + agent-specific price"],
  ["add_to_cart", "Add an item (snapshots tier price)"],
  ["view_cart", "View cart items + total"],
  ["update_cart", "Set a line quantity (0 removes)"],
  ["remove_from_cart", "Remove a line"],
  ["checkout", "Create order + mock payment intent"],
  ["confirm_purchase", "Finalize mock payment, decrement stock"],
  ["get_order", "Order status + items"],
  ["list_orders", "Your order history"],
  ["request_refund", "Refund per policy review"],
  ["list_offers", "Active targeted campaign offers"],
];

export default function A2ASpecPage() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="zone-label">
          <span className="tick" /> A2A SERVICE SPEC
        </div>
        <div className="panel" style={{ padding: 20 }}>
          <p style={{ color: "var(--dim)", fontSize: "0.85rem", lineHeight: 1.7 }}>
            The A2A surface is an MCP server over Streamable HTTP. Discovery is
            public; subscription and commerce require identity negotiated in the
            handshake.
          </p>
          <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
            <SpecRow label="Agent card" value={`${baseUrl}/.well-known/agent-card.json`} />
            <SpecRow label="MCP endpoint" value={`${baseUrl}/api/mcp`} />
            <SpecRow label="Transport" value="MCP / Streamable HTTP (stateless)" />
            <SpecRow
              label="Identification"
              value="DID + signed nonce (per-request); mock `sig::<did>` for the MVP"
            />
          </div>
        </div>
      </section>

      <section>
        <div className="zone-label">
          <span className="tick" /> OPEN TOOLS (PRE-IDENTIFICATION)
        </div>
        <ToolTable rows={OPEN_TOOLS as [string, string][]} access="open" />
      </section>

      <section>
        <div className="zone-label">
          <span className="tick" /> IDENTIFIED TOOLS (REQUIRE HANDSHAKE)
        </div>
        <ToolTable rows={IDENTIFIED_TOOLS} access="identified" />
      </section>
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <span
        style={{
          color: "var(--dim)",
          fontSize: "0.7rem",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          minWidth: 130,
        }}
      >
        {label}
      </span>
      <code style={{ color: "var(--cyan)", fontSize: "0.8rem" }}>{value}</code>
    </div>
  );
}

function ToolTable({
  rows,
  access,
}: {
  rows: [string, string][];
  access: "open" | "identified";
}) {
  return (
    <div className="panel" style={{ overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {rows.map(([name, purpose]) => (
            <tr key={name} style={{ borderTop: "1px solid var(--stroke)" }}>
              <td style={{ padding: "10px 14px", width: 200 }}>
                <code style={{ color: "var(--amber)", fontSize: "0.8rem" }}>
                  {name}
                </code>
              </td>
              <td
                style={{
                  padding: "10px 14px",
                  fontSize: "0.8rem",
                  color: "var(--text)",
                }}
              >
                {purpose}
              </td>
              <td style={{ padding: "10px 14px", width: 110 }}>
                <span
                  className={`pill ${access === "open" ? "pill-standard" : "pill-throttled"}`}
                >
                  {access}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
