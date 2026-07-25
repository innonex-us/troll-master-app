import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { save, open } from "@tauri-apps/plugin-dialog";
import { api, BlacklistEntry } from "../api";
import { InfoButton } from "../components/InfoButton";

function parseUsernameFile(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^@/, ""))
    .filter((l) => l && !l.startsWith("#"));
}

export function BlacklistPage() {
  const [entries, setEntries] = useState<BlacklistEntry[]>([]);
  const [error, setError] = useState("");
  const [backupStatus, setBackupStatus] = useState("");
  const [username, setUsername] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      setEntries(await api.listBlacklist());
      setError("");
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addEntry(e: FormEvent) {
    e.preventDefault();
    try {
      await api.addBlacklistEntry(null, username);
      setUsername("");
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function removeEntry(id: string) {
    await api.removeBlacklistEntry(id);
    await refresh();
  }

  async function exportBlacklist() {
    setBackupStatus("");
    try {
      const path = await save({
        defaultPath: "troll-master-blacklist.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      await api.exportBlacklistBackup(path);
      setBackupStatus(`exported to ${path}`);
    } catch (err) {
      setBackupStatus(`error: ${err}`);
    }
  }

  async function importBlacklist() {
    setBackupStatus("");
    try {
      const path = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (!path || Array.isArray(path)) return;
      const summary = await api.importBlacklistBackup(path);
      setBackupStatus(`imported ${summary.blacklist} entries`);
      await refresh();
    } catch (err) {
      setBackupStatus(`error: ${err}`);
    }
  }

  async function importUsernameFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBackupStatus("");
    try {
      const usernames = parseUsernameFile(await file.text());
      for (const u of usernames) {
        await api.addBlacklistEntry(null, u);
      }
      setBackupStatus(`imported ${usernames.length} usernames from file`);
      await refresh();
    } catch (err) {
      setBackupStatus(`error: ${err}`);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="title-row">
            <h1>Blacklist</h1>
            <InfoButton>
              Usernames automation will never target, across every profile — checked before every
              follow/unfollow/like/comment/DM attempt. TXT import takes one username per line (with
              or without @).
            </InfoButton>
          </div>
          <div className="sub">Usernames automation will never target, across every profile</div>
        </div>
        <div className="row">
          <button type="button" onClick={exportBlacklist}>
            Export
          </button>
          <button type="button" onClick={importBlacklist}>
            Import JSON
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            Import TXT
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.csv"
            style={{ display: "none" }}
            onChange={importUsernameFile}
          />
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {backupStatus && <p className="hint">{backupStatus}</p>}

      <form className="row panel" onSubmit={addEntry}>
        <input
          placeholder="username (without @)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <button type="submit" className="primary">
          Add to Blacklist
        </button>
      </form>

      <div className="panel">
        <table className="mini-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Added</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>@{entry.username}</td>
                <td>{new Date(entry.created_at).toLocaleDateString()}</td>
                <td>
                  <button type="button" className="danger" onClick={() => removeEntry(entry.id)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td className="empty" colSpan={3}>
                  No blacklisted usernames yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
