import { useEffect, useState } from "react";
import { api, Profile, ActionLogEntry } from "../api";
import { StatTile } from "../components/StatTile";
import { Badge } from "../components/Badge";
import { BarChart, Donut, TrendLineChart } from "../components/charts";

const PLATFORM_LABEL: Record<string, string> = { instagram: "Instagram", twitter: "Twitter/X", facebook: "Facebook" };
const PLATFORM_COLOR: Record<string, string> = {
  instagram: "var(--series-ig)",
  twitter: "var(--series-tw)",
  facebook: "var(--series-fb)",
};
const TREND_DAYS = 14;

export function OverviewPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [logs, setLogs] = useState<ActionLogEntry[]>([]);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const [p, l] = await Promise.all([api.listProfiles(), api.listLogs(2000)]);
      setProfiles(p);
      setLogs(l);
      setError("");
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const todaysLogs = logs.filter((l) => l.executed_at.slice(0, 10) === today);
  const successToday = todaysLogs.filter((l) => l.status === "success").length;
  const errorsToday = todaysLogs.filter((l) => l.status === "error").length;
  const active = profiles.filter((p) => p.status === "active").length;
  const needsLogin = profiles.filter((p) => p.status === "needs_login").length;
  const attention = profiles.filter((p) => p.status === "challenged" || p.status === "banned").length;

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const successLogs = logs.filter((l) => l.status === "success");

  const actionTypeCounts = new Map<string, number>();
  for (const l of successLogs) {
    actionTypeCounts.set(l.action_type, (actionTypeCounts.get(l.action_type) ?? 0) + 1);
  }
  const actionTypeData = Array.from(actionTypeCounts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const platformCounts = new Map<string, number>();
  for (const l of successLogs) {
    const platform = profileById.get(l.profile_id)?.platform;
    if (platform) platformCounts.set(platform, (platformCounts.get(platform) ?? 0) + 1);
  }
  const ranking = Array.from(platformCounts.entries())
    .map(([platform, count]) => ({ platform, count }))
    .sort((a, b) => b.count - a.count);

  const accountsByPlatform = new Map<string, number>();
  for (const p of profiles) {
    accountsByPlatform.set(p.platform, (accountsByPlatform.get(p.platform) ?? 0) + 1);
  }
  const donutData = Array.from(accountsByPlatform.entries()).map(([platform, value]) => ({
    label: PLATFORM_LABEL[platform] ?? platform,
    value,
    color: PLATFORM_COLOR[platform] ?? "var(--text-dim)",
  }));

  const days: string[] = [];
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const platforms = Array.from(new Set(profiles.map((p) => p.platform)));
  const trendSeries = platforms.map((platform) => ({
    platform,
    values: days.map(
      (day) =>
        successLogs.filter((l) => l.executed_at.slice(0, 10) === day && profileById.get(l.profile_id)?.platform === platform)
          .length,
    ),
  }));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Overview</h1>
          <div className="sub">Fleet-wide status across all profiles</div>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="stat-grid">
        <StatTile label="Total Profiles" value={profiles.length} />
        <StatTile label="Active" value={active} accent="ok" />
        <StatTile label="Needs Login" value={needsLogin} accent="warn" />
        <StatTile label="Needs Attention" value={attention} accent="err" />
        <StatTile label="Actions Today" value={successToday} accent="ok" />
        <StatTile label="Errors Today" value={errorsToday} accent={errorsToday > 0 ? "err" : undefined} />
      </div>

      <div className="chart-grid">
        <div className="panel">
          <h3>Actions by Type</h3>
          <BarChart data={actionTypeData} />
        </div>
        <div className="panel">
          <h3>Accounts by Platform</h3>
          <Donut data={donutData} />
        </div>
      </div>

      <div className="panel">
        <h3>Engagement Trend (last {TREND_DAYS} days)</h3>
        <TrendLineChart days={days} series={trendSeries} />
      </div>

      <div className="panel">
        <h3>Platform Ranking</h3>
        <table className="mini-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Platform</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((r, i) => (
              <tr key={r.platform}>
                <td>{i + 1}</td>
                <td>{PLATFORM_LABEL[r.platform] ?? r.platform}</td>
                <td>{r.count}</td>
              </tr>
            ))}
            {ranking.length === 0 && (
              <tr>
                <td className="empty" colSpan={3}>
                  No completed actions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3>Recent Activity</h3>
        <table className="mini-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Profile</th>
              <th>Action</th>
              <th>Target</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {logs.slice(0, 10).map((log) => {
              const profile = profiles.find((p) => p.id === log.profile_id);
              return (
                <tr key={log.id}>
                  <td>{new Date(log.executed_at).toLocaleTimeString()}</td>
                  <td>{profile?.display_name ?? log.profile_id.slice(0, 8)}</td>
                  <td>{log.action_type}</td>
                  <td>{log.target}</td>
                  <td>
                    <Badge status={log.status} />
                  </td>
                </tr>
              );
            })}
            {logs.length === 0 && (
              <tr>
                <td className="empty" colSpan={5}>
                  No activity yet. Add a profile and rule to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
