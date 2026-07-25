import { useEffect, useState } from "react";
import { api, Profile, ProfileStat } from "../api";
import { TrendLineChart } from "../components/charts";

function fmt(n: number | null): string {
  return n === null || n === undefined ? "—" : n.toLocaleString();
}

export function AnalyticsPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState("");
  const [stats, setStats] = useState<ProfileStat[]>([]);

  useEffect(() => {
    api.listProfiles().then((p) => {
      setProfiles(p);
      if (p[0]) setProfileId(p[0].id);
    });
  }, []);

  useEffect(() => {
    if (!profileId) return;
    api.listProfileStats(profileId, 90).then(setStats);
  }, [profileId]);

  const selected = profiles.find((p) => p.id === profileId);
  const withFollowers = stats.filter((s) => s.followers !== null);
  const days = withFollowers.map((s) => new Date(s.captured_at).toLocaleDateString());
  const series = [
    { platform: selected?.platform ?? "instagram", values: withFollowers.map((s) => s.followers ?? 0) },
  ];
  const latest = stats[stats.length - 1];
  const first = withFollowers[0];
  const growth =
    first && latest && latest.followers !== null ? (latest.followers ?? 0) - (first.followers ?? 0) : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Analytics</h1>
          <div className="sub">Follower growth over time — one snapshot per day per active profile</div>
        </div>
        <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name} ({p.platform})
            </option>
          ))}
        </select>
      </div>

      <div className="stat-grid">
        <div className="stat-tile">
          <div className="label">Followers</div>
          <div className="value">{fmt(latest?.followers ?? null)}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Following</div>
          <div className="value">{fmt(latest?.following ?? null)}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Posts</div>
          <div className="value">{fmt(latest?.posts ?? null)}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Growth ({withFollowers.length}d)</div>
          <div className={`value ${growth !== null && growth >= 0 ? "accent-ok" : "accent-err"}`}>
            {growth === null ? "—" : `${growth >= 0 ? "+" : ""}${growth.toLocaleString()}`}
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Follower trend</h3>
        {withFollowers.length >= 2 ? (
          <TrendLineChart days={days} series={series} />
        ) : (
          <p className="hint">
            Not enough data yet — snapshots are captured about once a day while a profile is active.
            {selected && selected.platform !== "instagram" && selected.platform !== "twitter" && selected.platform !== "tiktok"
              ? " Follower counts aren't reliably scrapeable on this platform."
              : ""}
          </p>
        )}
      </div>

      <div className="panel">
        <h3>History</h3>
        <table className="mini-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Followers</th>
              <th>Following</th>
              <th>Posts</th>
            </tr>
          </thead>
          <tbody>
            {[...stats].reverse().map((s) => (
              <tr key={s.id}>
                <td>{new Date(s.captured_at).toLocaleString()}</td>
                <td>{fmt(s.followers)}</td>
                <td>{fmt(s.following)}</td>
                <td>{fmt(s.posts)}</td>
              </tr>
            ))}
            {stats.length === 0 && (
              <tr>
                <td className="empty" colSpan={4}>
                  No snapshots yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
