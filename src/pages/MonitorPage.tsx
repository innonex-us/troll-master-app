import { useEffect, useState, type FormEvent } from "react";
import { api, CommentReplyRule, MonitoredPost, MonitoredPostSnapshot, Platform, Profile } from "../api";
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

  const [replyPost, setReplyPost] = useState<MonitoredPost | null>(null);
  const [replyRule, setReplyRule] = useState<CommentReplyRule | null>(null);
  const [replyDailyLimit, setReplyDailyLimit] = useState(10);
  const [replyMinDelay, setReplyMinDelay] = useState(300);
  const [replyMaxDelay, setReplyMaxDelay] = useState(1800);
  const [replyPool, setReplyPool] = useState("");

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

  async function openReplyManager(post: MonitoredPost) {
    const rule = await api.getReplyRule(post.id);
    setReplyRule(rule);
    setReplyDailyLimit(rule?.daily_limit ?? 10);
    setReplyMinDelay(rule?.min_delay_sec ?? 300);
    setReplyMaxDelay(rule?.max_delay_sec ?? 1800);
    setReplyPool(rule?.reply_pool.join("\n") ?? "");
    setReplyPost(post);
  }

  async function saveReplyRule(e: FormEvent) {
    e.preventDefault();
    if (!replyPost) return;
    const pool = replyPool
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      const saved = await api.upsertReplyRule({
        monitored_post_id: replyPost.id,
        daily_limit: replyDailyLimit,
        min_delay_sec: replyMinDelay,
        max_delay_sec: replyMaxDelay,
        reply_pool: pool,
      });
      setReplyRule(saved);
      setError("");
    } catch (err) {
      setError(String(err));
    }
  }

  async function toggleReplyRule() {
    if (!replyRule) return;
    await api.setReplyRuleEnabled(replyRule.id, !replyRule.enabled);
    setReplyRule({ ...replyRule, enabled: !replyRule.enabled });
  }

  async function removeReplyRule() {
    if (!replyRule) return;
    await api.deleteReplyRule(replyRule.id);
    setReplyRule(null);
    setReplyPool("");
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
                    <button type="button" onClick={() => openReplyManager(post)}>
                      Manage Auto-Reply
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
              <option value="tiktok">TikTok</option>
              <option value="linkedin">LinkedIn</option>
              <option value="youtube">YouTube</option>
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

      {replyPost && (
        <Modal title={`Auto-Reply — ${replyPost.label || replyPost.url}`} onClose={() => setReplyPost(null)}>
          <p className="hint">
            Watches this post's comments and auto-replies with a spintax pool once new
            ones appear. Only meaningful for posts you own — the reply is posted using
            the same viewer account tracking this post.
          </p>
          <form className="row" onSubmit={saveReplyRule}>
            <input
              type="number"
              min={1}
              value={replyDailyLimit}
              onChange={(e) => setReplyDailyLimit(Number(e.target.value))}
              title="daily reply limit"
            />
            <input
              type="number"
              min={1}
              value={replyMinDelay}
              onChange={(e) => setReplyMinDelay(Number(e.target.value))}
              title="min delay seconds"
            />
            <input
              type="number"
              min={1}
              value={replyMaxDelay}
              onChange={(e) => setReplyMaxDelay(Number(e.target.value))}
              title="max delay seconds"
            />
            <textarea
              placeholder="reply pool, one per line — supports {spintax|variants}"
              value={replyPool}
              onChange={(e) => setReplyPool(e.target.value)}
              rows={3}
            />
            <button type="submit" className="primary">
              {replyRule ? "Update Auto-Reply" : "Enable Auto-Reply"}
            </button>
          </form>
          {replyRule && (
            <div className="row">
              <label className="hint">
                <input type="checkbox" checked={replyRule.enabled} onChange={toggleReplyRule} /> enabled
              </label>
              <span className="hint">
                {replyRule.consecutive_errors > 0
                  ? `${replyRule.consecutive_errors} recent errors`
                  : "ok"}
              </span>
              <button type="button" className="danger" onClick={removeReplyRule}>
                Remove Auto-Reply
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
