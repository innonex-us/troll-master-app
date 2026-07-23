// Lightweight hand-rolled SVG charts — no charting dependency, matches the app's
// existing dark ops-console design tokens. Fixed series colors (never cycled),
// defined in App.css: --series-ig, --series-tw, --series-fb.

const SERIES_COLOR: Record<string, string> = {
  instagram: "var(--series-ig)",
  twitter: "var(--series-tw)",
  facebook: "var(--series-fb)",
  tiktok: "var(--series-tt)",
  linkedin: "var(--series-li)",
  youtube: "var(--series-yt)",
};

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  twitter: "Twitter/X",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
};

export function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="bar-chart">
      {data.map((d) => (
        <div className="bar-row" key={d.label}>
          <div className="bar-label">{d.label}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
          <div className="bar-value">{d.value}</div>
        </div>
      ))}
      {data.length === 0 && <p className="hint">No data yet.</p>}
    </div>
  );
}

export function Donut({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = 15.9155;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 36 36" className="donut-svg">
        <circle cx="18" cy="18" r={radius} fill="none" stroke="var(--line)" strokeWidth="4" />
        {total > 0 &&
          data.map((d) => {
            const fraction = d.value / total;
            const dash = fraction * circumference;
            const el = (
              <circle
                key={d.label}
                cx="18"
                cy="18"
                r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth="4"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 18 18)"
              />
            );
            offset += dash;
            return el;
          })}
        <text x="18" y="19" textAnchor="middle" className="donut-total">
          {total}
        </text>
      </svg>
      <div className="donut-legend">
        {data.map((d) => (
          <div className="legend-row" key={d.label}>
            <span className="legend-dot" style={{ background: d.color }} />
            {d.label}
            <span className="legend-value">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TrendLineChart({
  days,
  series,
}: {
  days: string[];
  series: { platform: string; values: number[] }[];
}) {
  const width = 640;
  const height = 180;
  const padding = 24;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const stepX = days.length > 1 ? (width - padding * 2) / (days.length - 1) : 0;

  function pointsFor(values: number[]): string {
    return values
      .map((v, i) => {
        const x = padding + i * stepX;
        const y = height - padding - (v / max) * (height - padding * 2);
        return `${x},${y}`;
      })
      .join(" ");
  }

  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} className="trend-svg" preserveAspectRatio="none">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--line)" />
        {series.map((s) => (
          <polyline
            key={s.platform}
            points={pointsFor(s.values)}
            fill="none"
            stroke={SERIES_COLOR[s.platform] ?? "var(--text-dim)"}
            strokeWidth="2"
          />
        ))}
      </svg>
      <div className="trend-axis">
        <span>{days[0]}</span>
        <span>{days[days.length - 1]}</span>
      </div>
      <div className="donut-legend">
        {series.map((s) => (
          <div className="legend-row" key={s.platform}>
            <span className="legend-dot" style={{ background: SERIES_COLOR[s.platform] ?? "var(--text-dim)" }} />
            {PLATFORM_LABEL[s.platform] ?? s.platform}
          </div>
        ))}
      </div>
    </div>
  );
}
