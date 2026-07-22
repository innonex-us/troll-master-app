import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, ActionLogEntry } from "../api";
import { Badge } from "../components/Badge";

export function LogsPage() {
  const [logs, setLogs] = useState<ActionLogEntry[]>([]);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      setLogs(await api.listLogs(200));
      setError("");
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    refresh();
    const unlistenPromise = listen<{
      profileId: string;
      actionType: string;
      target: string;
      status: string;
      message: string;
    }>("action-log", () => {
      refresh();
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Action Logs</h1>
          <div className="sub">Live feed of every automated action across all profiles</div>
        </div>
        <button type="button" onClick={refresh}>
          Refresh
        </button>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="panel">
      <table className="mini-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Profile</th>
            <th>Action</th>
            <th>Target</th>
            <th>Status</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td>{new Date(log.executed_at).toLocaleString()}</td>
              <td>{log.profile_id.slice(0, 8)}</td>
              <td>{log.action_type}</td>
              <td>{log.target}</td>
              <td>
                <Badge status={log.status} />
              </td>
              <td>{log.message}</td>
            </tr>
          ))}
          {logs.length === 0 && (
            <tr>
              <td className="empty" colSpan={6}>
                No actions logged yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
