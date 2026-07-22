export function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "ok" | "warn" | "err";
}) {
  return (
    <div className="stat-tile">
      <div className="label">{label}</div>
      <div className={`value${accent ? ` accent-${accent}` : ""}`}>{value}</div>
    </div>
  );
}
