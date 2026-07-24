import type { Platform } from "../api";

const PLATFORMS: { id: Platform; label: string; initials: string; color: string }[] = [
  { id: "instagram", label: "Instagram", initials: "IG", color: "var(--series-ig)" },
  { id: "twitter", label: "Twitter/X", initials: "X", color: "var(--series-tw)" },
  { id: "facebook", label: "Facebook", initials: "FB", color: "var(--series-fb)" },
  { id: "tiktok", label: "TikTok", initials: "TT", color: "var(--series-tt)" },
  { id: "linkedin", label: "LinkedIn", initials: "LI", color: "var(--series-li)" },
  { id: "youtube", label: "YouTube", initials: "YT", color: "var(--series-yt)" },
];

export function PlatformIconRail({
  active,
  onSelect,
  counts,
}: {
  active: Platform;
  onSelect: (p: Platform) => void;
  counts: Record<string, number>;
}) {
  return (
    <div className="platform-rail">
      {PLATFORMS.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`platform-icon${active === p.id ? " active" : ""}`}
          onClick={() => onSelect(p.id)}
          title={p.label}
        >
          <span className="platform-badge" style={{ background: p.color }}>
            {p.initials}
          </span>
          <span className="platform-name">{p.label}</span>
          <span className="platform-count">{counts[p.id] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}
