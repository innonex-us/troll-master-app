import { Fragment, useEffect, useState, type FormEvent } from "react";
import { api, MonitoredPost, MonitoredPostSnapshot, Platform, Profile } from "../api";

function formatMetric(value: number | null): string {
  return value === null || value === undefined ? "—" : value.toLocaleString();
}

export function MonitorPage() {
  const [posts, setPosts] = useState<MonitoredPost[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [latest, setLatest] = useState<Record<string, MonitoredPostSnapshot | null>>({});
  const [history, setHistory] = useState<Record<string, MonitoredPostSnapshot[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
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

  async function toggleHistory(id: string) {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    const snaps = await api.listPostSnapshots(id, 50);
    setHistory((h) => ({ ...h, [id]: snaps }));
    setExpanded(id);
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
      </div>
      {error && <p className="error">{error}</p>}

      <form className="row panel" onSubmit={addPost}>
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
        <input placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
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
                <Fragment key={post.id}>
                  <tr>
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
                      <button type="button" onClick={() => toggleHistory(post.id)}>
                        {expanded === post.id ? "Hide History" : "History"}
                      </button>
                      <button type="button" className="danger" onClick={() => removePost(post.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                  {expanded === post.id && (
                    <tr>
                      <td colSpan={8}>
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
                            {(history[post.id] ?? []).map((s) => (
                              <tr key={s.id}>
                                <td>{new Date(s.captured_at).toLocaleString()}</td>
                                <td>{formatMetric(s.likes)}</td>
                                <td>{formatMetric(s.comments)}</td>
                                <td>{formatMetric(s.shares)}</td>
                                <td>{formatMetric(s.views)}</td>
                                <td>{formatMetric(s.bookmarks)}</td>
                              </tr>
                            ))}
                            {(history[post.id] ?? []).length === 0 && (
                              <tr>
                                <td className="empty" colSpan={6}>
                                  No snapshots yet.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
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
    </div>
  );
}
