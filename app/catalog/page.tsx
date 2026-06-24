import { DbNotice } from "@/components/db-notice";
import { listAllProducts } from "@/services/catalog";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  let products;
  try {
    products = await listAllProducts();
  } catch (err) {
    return <DbNotice error={err instanceof Error ? err.message : String(err)} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="zone-label">
        <span className="tick" /> MERCHANDISING PORTAL — CATALOG ({products.length})
      </div>
      <p style={{ color: "var(--dim)", fontSize: "0.8rem" }}>
        Active products are the live source of truth for the A2A commerce tools.
        (Editing via the admin API / portal forms lands in a later phase.)
      </p>
      <div className="panel" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "var(--dim)", fontSize: "0.66rem" }}>
              <Th>SKU</Th>
              <Th>Name</Th>
              <Th>Category</Th>
              <Th>Price</Th>
              <Th>Stock</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.sku} style={{ borderTop: "1px solid var(--stroke)" }}>
                <Td mono>{p.sku}</Td>
                <Td>{p.name}</Td>
                <Td dim>{p.category}</Td>
                <Td>${Number(p.price).toLocaleString()}</Td>
                <Td>{p.stock}</Td>
                <Td>
                  <span
                    className={`pill ${p.active && p.stock > 0 ? "pill-premium" : "pill-rejected"}`}
                  >
                    {p.active ? (p.stock > 0 ? "LIVE" : "OOS") : "INACTIVE"}
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
