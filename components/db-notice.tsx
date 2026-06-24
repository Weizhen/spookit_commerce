/** Shown when a server component can't reach the database (e.g. env not set). */
export function DbNotice({ error }: { error?: string }) {
  return (
    <div
      className="panel"
      style={{ padding: 20, borderLeft: "4px solid var(--amber)" }}
    >
      <div className="zone-label">
        <span className="tick" /> DATABASE NOT CONNECTED
      </div>
      <p style={{ color: "var(--dim)", fontSize: "0.85rem", lineHeight: 1.6 }}>
        This view reads live data from Neon Postgres. To bring it online:
      </p>
      <ol
        style={{
          color: "var(--text)",
          fontSize: "0.82rem",
          lineHeight: 1.8,
          marginTop: 8,
          paddingLeft: 18,
          listStyle: "decimal",
        }}
      >
        <li>
          Copy <code>.env.example</code> to <code>.env</code> and set{" "}
          <code>DATABASE_URL</code> + <code>DIRECT_URL</code> from your Neon
          project.
        </li>
        <li>
          Run <code>npm run db:push</code> (or <code>db:generate</code> +{" "}
          <code>db:migrate</code>) to create the <code>commerce</code> +{" "}
          <code>catalog</code> schemas.
        </li>
        <li>
          Run <code>npm run db:seed</code> to load demo CRM profiles, rules, and
          catalog products.
        </li>
      </ol>
      {error ? (
        <pre
          style={{
            marginTop: 12,
            color: "var(--red)",
            fontSize: "0.7rem",
            whiteSpace: "pre-wrap",
          }}
        >
          {error}
        </pre>
      ) : null}
    </div>
  );
}
