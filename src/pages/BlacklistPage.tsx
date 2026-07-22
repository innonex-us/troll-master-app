import { useEffect, useState, type FormEvent } from "react";
import { api, BlacklistEntry } from "../api";

export function BlacklistPage() {
  const [entries, setEntries] = useState<BlacklistEntry[]>([]);
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");

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

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Blacklist</h1>
          <div className="sub">
            Usernames automation will never target, across every profile — checked before every
            follow/unfollow/like/comment/DM attempt
          </div>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

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
