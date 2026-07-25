import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api, Profile, ScheduledPost } from "../api";
import { Badge } from "../components/Badge";

// YouTube publishing isn't automatable via web — hide it from the composer.
const PUBLISHABLE = ["instagram", "twitter", "facebook", "tiktok", "linkedin"];

export function PublisherPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [profileId, setProfileId] = useState("");
  const [mediaPath, setMediaPath] = useState("");
  const [caption, setCaption] = useState("");
  const [when, setWhen] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const [pr, ps] = await Promise.all([api.listProfiles(), api.listScheduledPosts()]);
    setProfiles(pr.filter((p) => PUBLISHABLE.includes(p.platform)));
    setPosts(ps);
  }

  useEffect(() => {
    refresh();
  }, []);

  const profileName = (id: string) => profiles.find((p) => p.id === id)?.display_name ?? id;

  async function pickMedia() {
    const path = await open({
      multiple: false,
      filters: [{ name: "Media", extensions: ["jpg", "jpeg", "png", "mp4", "mov", "gif"] }],
    });
    if (path && !Array.isArray(path)) setMediaPath(path);
  }

  async function schedule() {
    if (!profileId || !when) {
      setError("pick a profile and a time");
      return;
    }
    try {
      await api.createScheduledPost({
        profile_id: profileId,
        media_path: mediaPath,
        caption,
        scheduled_at: new Date(when).toISOString(),
      });
      setMediaPath("");
      setCaption("");
      setWhen("");
      setError("");
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function remove(id: string) {
    await api.deleteScheduledPost(id);
    await refresh();
  }

  function statusTone(s: string): string {
    return s === "posted" ? "active" : s === "failed" ? "banned" : "paused";
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Publisher</h1>
          <div className="sub">Schedule photos/videos + captions to auto-publish per profile</div>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <p className="sub">
        Publishing drives each platform's real web composer — best-effort and fragile; a failed post
        keeps its error and won't retry. YouTube isn't supported (web upload requires verification).
      </p>

      <div className="panel">
        <h3>Schedule a post</h3>
        <div className="row">
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            <option value="">Select profile…</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name} ({p.platform})
              </option>
            ))}
          </select>
          <button type="button" onClick={pickMedia}>
            {mediaPath ? "Change media" : "Pick media"}
          </button>
          {mediaPath && <span className="hint">{mediaPath.split("/").pop()}</span>}
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            title="when to publish"
          />
        </div>
        <div className="row">
          <textarea
            placeholder="caption / post text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
            style={{ width: "100%" }}
          />
        </div>
        <button type="button" className="primary" onClick={schedule}>
          Schedule
        </button>
      </div>

      <div className="panel">
        <h3>Queue</h3>
        <table className="mini-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Profile</th>
              <th>Caption</th>
              <th>Media</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.scheduled_at).toLocaleString()}</td>
                <td>{profileName(p.profile_id)}</td>
                <td className="truncate">{p.caption || "—"}</td>
                <td>{p.media_path ? p.media_path.split("/").pop() : "—"}</td>
                <td>
                  <Badge status={statusTone(p.status)} />
                  {p.status === "failed" && p.error && <div className="hint">{p.error}</div>}
                </td>
                <td>
                  <button type="button" className="danger" onClick={() => remove(p.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {posts.length === 0 && (
              <tr>
                <td className="empty" colSpan={6}>
                  Nothing scheduled yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
