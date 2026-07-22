import { useEffect, useState, type FormEvent } from "react";
import { api, MonitoredPost, MonitoredPostSnapshot, Platform, Profile } from "../api";
import { Modal } from "../components/Modal";

function formatMetric(value: number | null): string {
  return value === null || value === undefined ? "—" : value.toLocaleString();
}

export function MonitorPage() {
  const [posts, setPosts] = useState<MonitoredPost[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [latest, setLatest] = useState<Record<string, MonitoredPostSnapshot | null>>({});
  const [historyPost, setHistoryPost] = useState<MonitoredPost | null>(null);
  const [history, setHistory] = useState<MonitoredPostSnapshot[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<Record<string, string>>({});

  const [platform, setPlatform] = useState<Platform>("instagram");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [viewerProfileId, setViewerProfileId] = useState("");

  async function refresh() {
    try {
      const [p, pr] = await Promise.all([api.listMonitoredPosts(), api.listProfiles()]);
      setPosts(p);
      setProfiles(pr);
      setError("");
      for (const post of p) {
        const snaps = await api.listPostSnapshots(post.id, 1);
        setLatest((s) => ({ ...s, [post.id]: snaps[0] ?? null }));
      }
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const eligibleViewers = profiles.filter((p) => p.platform === platform && p.status === "active");

  async function addPost(e: FormEvent) {
    e.preventDefault();
    try {
      await api.createMonitoredPost({ platform, url, label, viewer_profile_id: viewerProfileId });
      setUrl("");
      setLabel("");
      setViewerProfileId("");
      setShowAdd(false);
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function removePost(id: string) {
    await api.deleteMonitoredPost(id);
    await refresh();
  }

  async function refreshNow(id: string) {
    setStatus((s) => ({ ...s, [id]: "scraping…" }));
    try {
      await api.scrapePostNow(id);
      setStatus((s) => ({ ...s, [id]: "updated" }));
      await refresh();
    } catch (err) {
      setStatus((s) => ({ ...s, [id]: `error: ${err}` }));
    }
  }

  async function openHistory(post: MonitoredPost) {
    const snaps = await api.listPostSnapshots(post.id, 50);
    setHistory(snaps);
    setHistoryPost(post);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Monitor</h1>
          <div className="sub">
            Track engagement on other people's posts over time — competitors, target content,
            anything public. Scraped every ~30 min using a viewer account's logged-in session.
          </div>
        </div>
        <button type="button" className="primary" onClick={() => setShowAdd(true)}>
          + Track Post
        </button>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="panel">
        <table className="mini-table">
          <thead>
            <tr>
              <th>Label / URL</th>
              <th>Platform</th>
              <th>Likes</th>
              <th>Comments</th>
              <th>Shares</th>
              <th>Views</th>
              <th>Bookmarks</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => {
              const snap = latest[post.id];
              return (
                <tr key={post.id}>
                  <td>
                    {post.label || post.url}
                    {status[post.id] && <div className="hint">{status[post.id]}</div>}
                  </td>
                  <td>{post.platform}</td>
                  <td>{formatMetric(snap?.likes ?? null)}</td>
                  <td>{formatMetric(snap?.comments ?? null)}</td>
                  <td>{formatMetric(snap?.shares ?? null)}</td>
                  <td>{formatMetric(snap?.views ?? null)}</td>
                  <td>{formatMetric(snap?.bookmarks ?? null)}</td>
                  <td>
                    <button type="button" onClick={() => refreshNow(post.id)}>
                      Refresh Now
                    </button>
                    <button type="button" onClick={() => openHistory(post)}>
                      History
                    </button>
                    <button type="button" className="danger" onClick={() => removePost(post.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            {posts.length === 0 && (
              <tr>
                <td className="empty" colSpan={8}>
                  Not tracking any posts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <Modal title="Track Post" onClose={() => setShowAdd(false)}>
          <form className="row" onSubmit={addPost}>
            <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
              <option value="instagram">Instagram</option>
              <option value="twitter">Twitter/X</option>
              <option value="facebook">Facebook</option>
            </select>
            <input
              placeholder="Post/tweet URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
            <input
              placeholder="Label (optional)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <select value={viewerProfileId} onChange={(e) => setViewerProfileId(e.target.value)} required>
              <option value="">Viewer account…</option>
              {eligibleViewers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
            <button type="submit" className="primary">
              Track Post
            </button>
          </form>
          {eligibleViewers.length === 0 && (
            <p className="hint">No active {platform} profiles to view with — activate one first.</p>
          )}
        </Modal>
      )}

      {historyPost && (
        <Modal title={`History — ${historyPost.label || historyPost.url}`} onClose={() => setHistoryPost(null)}>
          <table className="mini-table">
            <thead>
              <tr>
                <th>Captured</th>
                <th>Likes</th>
                <th>Comments</th>
                <th>Shares</th>
                <th>Views</th>
                <th>Bookmarks</th>
              </tr>
            </thead>
            <tbody>
              {history.map((s) => (
                <tr key={s.id}>
                  <td>{new Date(s.captured_at).toLocaleString()}</td>
                  <td>{formatMetric(s.likes)}</td>
                  <td>{formatMetric(s.comments)}</td>
                  <td>{formatMetric(s.shares)}</td>
                  <td>{formatMetric(s.views)}</td>
                  <td>{formatMetric(s.bookmarks)}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td className="empty" colSpan={6}>
                    No snapshots yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}
