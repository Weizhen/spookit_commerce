export function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "cyan" | "amber" | "green" | "red" | "orange";
}) {
  const color = accent ? `var(--${accent})` : "var(--text)";
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
