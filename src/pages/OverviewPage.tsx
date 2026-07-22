import { useEffect, useState } from "react";
import { api, Profile, ActionLogEntry } from "../api";
import { StatTile } from "../components/StatTile";
import { Badge } from "../components/Badge";

export function OverviewPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [logs, setLogs] = useState<ActionLogEntry[]>([]);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const [p, l] = await Promise.all([api.listProfiles(), api.listLogs(500)]);
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
