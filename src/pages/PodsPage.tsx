import { useEffect, useState, type FormEvent } from "react";
import { save, open } from "@tauri-apps/plugin-dialog";
import { api, Pod, PodEngagement, PodPost, Profile, ProfileGroup } from "../api";
import { Badge } from "../components/Badge";
import { Modal } from "../components/Modal";

const ALL_ACTIONS = ["like", "comment"];

export function PodsPage() {
  const [pods, setPods] = useState<Pod[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<ProfileGroup[]>([]);
  const [error, setError] = useState("");
  const [backupStatus, setBackupStatus] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [managePod, setManagePod] = useState<Pod | null>(null);
  const [members, setMembers] = useState<Record<string, Set<string>>>({});
  const [groupFilter, setGroupFilter] = useState("");

  const [postsPod, setPostsPod] = useState<Pod | null>(null);
  const [posts, setPosts] = useState<PodPost[]>([]);
  const [engagePost, setEngagePost] = useState<PodPost | null>(null);
  const [engagements, setEngagements] = useState<PodEngagement[]>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [windowHours, setWindowHours] = useState(6);
  const [dailyLimit, setDailyLimit] = useState(10);
  const [minDelay, setMinDelay] = useState(120);
  const [maxDelay, setMaxDelay] = useState(900);
  const [actions, setActions] = useState<string[]>(["like"]);
  const [commentPool, setCommentPool] = useState("");

  async function refresh() {
    try {
      const [p, pr, g] = await Promise.all([api.listPods(), api.listProfiles(), api.listProfileGroups()]);
      setPods(p);
      setProfiles(pr);
      setGroups(g);
      setError("");
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function refreshMembers(podId: string) {
    const list = await api.listPodMembers(podId);
    setMembers((prev) => ({ ...prev, [podId]: new Set(list.filter((m) => m.enabled).map((m) => m.profile_id)) }));
  }

  useEffect(() => {
    if (managePod) refreshMembers(managePod.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managePod?.id]);

  async function exportPods() {
    setBackupStatus("");
    try {
      const path = await save({
        defaultPath: "troll-master-pods.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      await api.exportPodsBackup(path);
      setBackupStatus(`exported to ${path}`);
    } catch (err) {
      setBackupStatus(`error: ${err}`);
    }
  }

  async function importPods() {
    setBackupStatus("");
    try {
      const path = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (!path || Array.isArray(path)) return;
      const summary = await api.importPodsBackup(path);
      setBackupStatus(`imported ${summary.pods} pods, ${summary.pod_members} members`);
      await refresh();
    } catch (err) {
      setBackupStatus(`error: ${err}`);
    }
  }

  function toggleAction(action: string) {
    setActions((a) => (a.includes(action) ? a.filter((x) => x !== action) : [...a, action]));
  }

  async function addPod(e: FormEvent) {
    e.preventDefault();
    const comment_pool = commentPool
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      await api.createPod({
        name,
        description,
        window_hours: windowHours,
        daily_limit_per_member: dailyLimit,
        min_delay_sec: minDelay,
        max_delay_sec: maxDelay,
        actions,
        comment_pool,
      });
      setName("");
      setDescription("");
      setCommentPool("");
      setShowAdd(false);
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function removePod(id: string) {
    await api.deletePod(id);
    await refresh();
  }

  async function togglePodEnabled(p: Pod) {
    await api.setPodEnabled(p.id, !p.enabled);
    await refresh();
  }

  async function toggleMember(podId: string, profileId: string, isMember: boolean) {
    if (isMember) {
      await api.removePodMember(podId, profileId);
    } else {
      await api.addPodMember(podId, profileId);
    }
    await refreshMembers(podId);
  }

  async function openPosts(pod: Pod) {
    setPosts(await api.listPodPosts(pod.id, 50));
    setPostsPod(pod);
  }

  async function openEngagements(post: PodPost) {
    setEngagements(await api.listPodEngagements(post.id));
    setEngagePost(post);
  }

  const visibleProfiles = groupFilter ? profiles.filter((p) => p.group_id === groupFilter) : profiles;
  const profileName = (id: string) => profiles.find((p) => p.id === id)?.display_name ?? id;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Pods</h1>
          <div className="sub">
            Mutual engagement groups — enroll your own profiles, and whenever one publishes
            something new, the rest automatically like/comment it within a set time window.
          </div>
        </div>
        <div className="row">
          <button type="button" onClick={exportPods}>
            Export
          </button>
          <button type="button" onClick={importPods}>
            Import
          </button>
          <button type="button" className="primary" onClick={() => setShowAdd(true)}>
            + Create Pod
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {backupStatus && <p className="hint">{backupStatus}</p>}

      <div className="panel">
        <table className="mini-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Actions</th>
              <th>Window</th>
              <th>Daily limit/member</th>
              <th>Status</th>
              <th>Members</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pods.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.actions.join(", ")}</td>
                <td>{p.window_hours}h</td>
                <td>{p.daily_limit_per_member}/day</td>
                <td>
                  <Badge status={p.enabled ? "active" : "paused"} />
                </td>
                <td>{members[p.id]?.size ?? "—"}</td>
                <td>
                  <button type="button" onClick={() => togglePodEnabled(p)}>
                    {p.enabled ? "Pause" : "Resume"}
                  </button>
                  <button type="button" onClick={() => setManagePod(p)}>
                    Manage
                  </button>
                  <button type="button" onClick={() => openPosts(p)}>
                    Activity
                  </button>
                  <button type="button" className="danger" onClick={() => removePod(p.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {pods.length === 0 && (
              <tr>
                <td className="empty" colSpan={7}>
                  No pods yet — create one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <Modal title="Create Pod" onClose={() => setShowAdd(false)}>
          <form className="rule-form" onSubmit={addPod}>
            <input placeholder="Pod name" value={name} onChange={(e) => setName(e.target.value)} required />
            <input
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="row">
              {ALL_ACTIONS.map((a) => (
                <label className="hint" key={a}>
                  <input type="checkbox" checked={actions.includes(a)} onChange={() => toggleAction(a)} /> {a}
                </label>
              ))}
            </div>
            <input
              type="number"
              min={1}
              value={windowHours}
              onChange={(e) => setWindowHours(Number(e.target.value))}
              title="hours a new post stays eligible for engagement"
            />
            <input
              type="number"
              min={1}
              value={dailyLimit}
              onChange={(e) => setDailyLimit(Number(e.target.value))}
              title="daily engagement limit per member"
            />
            <input
              type="number"
              min={1}
              value={minDelay}
              onChange={(e) => setMinDelay(Number(e.target.value))}
              title="min delay seconds"
            />
            <input
              type="number"
              min={1}
              value={maxDelay}
              onChange={(e) => setMaxDelay(Number(e.target.value))}
              title="max delay seconds"
            />
            {actions.includes("comment") && (
              <textarea
                placeholder="comment pool, one per line — supports {spintax|variants}"
                value={commentPool}
                onChange={(e) => setCommentPool(e.target.value)}
                rows={2}
              />
            )}
            <button type="submit" className="primary">
              Create Pod
            </button>
          </form>
        </Modal>
      )}

      {managePod && (
        <Modal title={`Manage — ${managePod.name}`} onClose={() => setManagePod(null)} wide>
          <div className="rules-panel">
            <h4>Members</h4>
            <p className="hint">
              Checking a profile enrolls it in this pod — it'll both have its own posts engaged by
              the rest of the pod, and act on the rest of the pod's posts in turn.
            </p>
            <div className="row">
              <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
                <option value="">All profiles</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <table className="mini-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Name</th>
                  <th>Platform</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleProfiles.map((p) => {
                  const isMember = members[managePod.id]?.has(p.id) ?? false;
                  return (
                    <tr key={p.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={isMember}
                          onChange={() => toggleMember(managePod.id, p.id, isMember)}
                        />
                      </td>
                      <td>{p.display_name}</td>
                      <td>{p.platform}</td>
                      <td>
                        <Badge status={p.status} />
                      </td>
                    </tr>
                  );
                })}
                {visibleProfiles.length === 0 && (
                  <tr>
                    <td className="empty" colSpan={4}>
                      No profiles match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {postsPod && (
        <Modal title={`Activity — ${postsPod.name}`} onClose={() => setPostsPod(null)} wide>
          <table className="mini-table">
            <thead>
              <tr>
                <th>Posted by</th>
                <th>URL</th>
                <th>Detected</th>
                <th>Expires</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id}>
                  <td>{profileName(p.member_profile_id)}</td>
                  <td className="truncate">{p.post_url}</td>
                  <td>{new Date(p.detected_at).toLocaleString()}</td>
                  <td>{new Date(p.expires_at).toLocaleString()}</td>
                  <td>
                    <button type="button" onClick={() => openEngagements(p)}>
                      Engagements
                    </button>
                  </td>
                </tr>
              ))}
              {posts.length === 0 && (
                <tr>
                  <td className="empty" colSpan={5}>
                    No posts detected yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Modal>
      )}

      {engagePost && (
        <Modal title="Engagements" onClose={() => setEngagePost(null)}>
          <table className="mini-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Action</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {engagements.map((e) => (
                <tr key={e.id}>
                  <td>{profileName(e.acting_profile_id)}</td>
                  <td>{e.action_type}</td>
                  <td>{e.status}</td>
                  <td>{new Date(e.executed_at).toLocaleString()}</td>
                </tr>
              ))}
              {engagements.length === 0 && (
                <tr>
                  <td className="empty" colSpan={4}>
                    No engagements yet.
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
