import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { save, open } from "@tauri-apps/plugin-dialog";
import { api, Campaign, Platform, Pod, Profile, ProfileGroup, Proxy } from "../api";
import { RulesPanel } from "./RulesPanel";
import { ProfileManagePanel } from "./ProfileManagePanel";
import { Badge } from "../components/Badge";
import { Modal } from "../components/Modal";
import { BulkToolbar } from "../components/BulkToolbar";
import { BulkRuleModal } from "../components/BulkRuleModal";

const VALID_PLATFORMS: Platform[] = ["instagram", "twitter", "facebook", "tiktok", "linkedin", "youtube"];

/** CSV with a header row: platform,username,display_name,proxy_label,group_name,device_name
 * (only platform+username are required; the rest are optional). Column order is
 * free — matched by header name, not position. Fields must not contain commas. */
function parseProfilesCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  if (lines.length === 0) return [];

  const cols = lines[0].toLowerCase().split(",").map((c) => c.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const get = (name: string) => {
      const i = cols.indexOf(name);
      return i >= 0 ? cells[i] ?? "" : "";
    };
    return {
      platform: get("platform").toLowerCase(),
      username: get("username"),
      display_name: get("display_name") || get("username"),
      proxy_label: get("proxy_label"),
      group_name: get("group_name"),
      device_name: get("device_name"),
    };
  });
}

export function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [groups, setGroups] = useState<ProfileGroup[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [pods, setPods] = useState<Pod[]>([]);
  const [error, setError] = useState("");
  const [rulesModal, setRulesModal] = useState<Profile | null>(null);
  const [manageModal, setManageModal] = useState<Profile | null>(null);
  const [showAddProfile, setShowAddProfile] = useState(false);
  const [showBulkRule, setShowBulkRule] = useState(false);
  const [captureStatus, setCaptureStatus] = useState<Record<string, string>>({});
  const [bulkStatus, setBulkStatus] = useState("");
  const [backupStatus, setBackupStatus] = useState("");

  const [platform, setPlatform] = useState<Platform>("instagram");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [proxyId, setProxyId] = useState<string>("");
  const [groupId, setGroupId] = useState<string>("");
  const [deviceName, setDeviceName] = useState("");

  const [newGroupName, setNewGroupName] = useState("");
  const [groupFilter, setGroupFilter] = useState("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkGroupId, setBulkGroupId] = useState("");
  const [bulkProxyId, setBulkProxyId] = useState("");
  const [bulkCampaignId, setBulkCampaignId] = useState("");
  const [bulkPodId, setBulkPodId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      const [p, px, g, c, pd] = await Promise.all([
        api.listProfiles(),
        api.listProxies(),
        api.listProfileGroups(),
        api.listCampaigns(),
        api.listPods(),
      ]);
      setProfiles(p);
      setProxies(px);
      setGroups(g);
      setCampaigns(c);
      setPods(pd);
      setError("");
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  // keep modal profile data in sync after actions elsewhere refresh the list
  useEffect(() => {
    if (rulesModal) setRulesModal(profiles.find((p) => p.id === rulesModal.id) ?? null);
    if (manageModal) setManageModal(profiles.find((p) => p.id === manageModal.id) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles]);

  async function addProfile(e: FormEvent) {
    e.preventDefault();
    try {
      const created = await api.createProfile({
        platform,
        display_name: displayName,
        username,
        proxy_id: proxyId || null,
        device_name: deviceName,
      });
      if (groupId) {
        await api.setProfileGroup(created.id, groupId);
      }
      setDisplayName("");
      setUsername("");
      setProxyId("");
      setGroupId("");
      setDeviceName("");
      setShowAddProfile(false);
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function addGroup(e: FormEvent) {
    e.preventDefault();
    try {
      await api.createProfileGroup({ name: newGroupName, description: "" });
      setNewGroupName("");
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function removeGroup(id: string) {
    await api.deleteProfileGroup(id);
    if (groupFilter === id) setGroupFilter("");
    await refresh();
  }

  async function assignProxy(profileId: string, newProxyId: string) {
    await api.setProfileProxy(profileId, newProxyId || null);
    await refresh();
  }

  async function assignGroup(profileId: string, newGroupId: string) {
    await api.setProfileGroup(profileId, newGroupId || null);
    await refresh();
  }

  async function captureLogin(profileId: string) {
    setCaptureStatus((s) => ({ ...s, [profileId]: "waiting for you to log in in the browser window…" }));
    try {
      await api.captureLogin(profileId);
      setCaptureStatus((s) => ({ ...s, [profileId]: "login captured" }));
      await refresh();
    } catch (err) {
      setCaptureStatus((s) => ({ ...s, [profileId]: `error: ${err}` }));
    }
  }

  async function removeProfile(id: string) {
    await api.deleteProfile(id);
    await refresh();
  }

  async function exportProfiles() {
    setBackupStatus("");
    try {
      const path = await save({
        defaultPath: "troll-master-profiles.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      await api.exportProfilesBackup(path);
      setBackupStatus(`exported to ${path}`);
    } catch (err) {
      setBackupStatus(`error: ${err}`);
    }
  }

  async function importProfiles() {
    setBackupStatus("");
    try {
      const path = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (!path || Array.isArray(path)) return;
      const summary = await api.importProfilesBackup(path);
      setBackupStatus(`imported ${summary.profiles} profiles, ${summary.rules} rules`);
      await refresh();
    } catch (err) {
      setBackupStatus(`error: ${err}`);
    }
  }

  async function importProfilesCsv(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBackupStatus("");
    try {
      const rows = parseProfilesCsv(await file.text());
      let created = 0;
      const skipped: string[] = [];
      for (const row of rows) {
        if (!row.username || !VALID_PLATFORMS.includes(row.platform as Platform)) {
          skipped.push(`${row.username || "(blank)"}: invalid or missing platform "${row.platform}"`);
          continue;
        }
        const matchedProxy = row.proxy_label
          ? proxies.find((p) => p.label.toLowerCase() === row.proxy_label.toLowerCase())
          : undefined;
        const matchedGroup = row.group_name
          ? groups.find((g) => g.name.toLowerCase() === row.group_name.toLowerCase())
          : undefined;
        const createdProfile = await api.createProfile({
          platform: row.platform as Platform,
          display_name: row.display_name,
          username: row.username,
          proxy_id: matchedProxy?.id ?? null,
          device_name: row.device_name,
        });
        if (matchedGroup) {
          await api.setProfileGroup(createdProfile.id, matchedGroup.id);
        }
        created += 1;
      }
      setBackupStatus(
        `created ${created} profile(s) from CSV` + (skipped.length > 0 ? `; skipped: ${skipped.join("; ")}` : ""),
      );
      await refresh();
    } catch (err) {
      setBackupStatus(`error: ${err}`);
    }
  }

  async function duplicateProfile(id: string) {
    try {
      await api.duplicateProfile(id);
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  const visibleProfiles = groupFilter ? profiles.filter((p) => p.group_id === groupFilter) : profiles;
  const selectedProfiles = profiles.filter((p) => selected.has(p.id));

  function toggleSelected(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((s) =>
      s.size === visibleProfiles.length ? new Set() : new Set(visibleProfiles.map((p) => p.id)),
    );
  }

  async function bulkSetEnabled(enabled: boolean) {
    await Promise.all(Array.from(selected).map((id) => api.setProfileEnabled(id, enabled)));
    setSelected(new Set());
    await refresh();
  }

  async function bulkDelete() {
    await Promise.all(Array.from(selected).map((id) => api.deleteProfile(id)));
    setSelected(new Set());
    await refresh();
  }

  async function bulkAssignGroup() {
    await Promise.all(Array.from(selected).map((id) => api.setProfileGroup(id, bulkGroupId || null)));
    await refresh();
  }

  async function bulkAssignProxy() {
    await Promise.all(Array.from(selected).map((id) => api.setProfileProxy(id, bulkProxyId || null)));
    await refresh();
  }

  async function bulkAddToCampaign() {
    if (!bulkCampaignId) return;
    const result = await api.enrollProfiles(bulkCampaignId, Array.from(selected));
    setBulkStatus(
      result.skipped.length > 0 ? `Enrolled ${result.enrolled}; skipped: ${result.skipped.join("; ")}` : `Enrolled ${result.enrolled}`,
    );
  }

  async function bulkAddToPod() {
    if (!bulkPodId) return;
    await Promise.all(Array.from(selected).map((id) => api.addPodMember(bulkPodId, id)));
    setBulkStatus(`Added ${selected.size} profile(s) to pod`);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Profiles</h1>
          <div className="sub">Social accounts under management</div>
        </div>
        <div className="row">
          <button type="button" onClick={exportProfiles}>
            Export
          </button>
          <button type="button" onClick={importProfiles}>
            Import JSON
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            Import CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            style={{ display: "none" }}
            onChange={importProfilesCsv}
          />
          <button type="button" className="primary" onClick={() => setShowAddProfile(true)}>
            + Add Profile
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {backupStatus && <p className="hint">{backupStatus}</p>}
      <p className="sub">
        CSV: header row platform,username,display_name,proxy_label,group_name,device_name (only
        platform+username required) — creates profile shells needing individual login after.
      </p>

      <div className="panel">
        <h3>Groups</h3>
        <form className="row" onSubmit={addGroup}>
          <input
            placeholder="New group name"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            required
          />
          <button type="submit" className="primary">
            Create Group
          </button>
          <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
            <option value="">Show all profiles</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </form>
        {groups.length > 0 && (
          <div className="row">
            {groups.map((g) => (
              <span key={g.id} className="badge info">
                {g.name}
                <button type="button" className="ghost" onClick={() => removeGroup(g.id)}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {selected.size > 0 && (
        <BulkToolbar count={selected.size}>
          <button type="button" onClick={() => bulkSetEnabled(true)}>
            Enable
          </button>
          <button type="button" onClick={() => bulkSetEnabled(false)}>
            Disable
          </button>
          <select value={bulkGroupId} onChange={(e) => setBulkGroupId(e.target.value)}>
            <option value="">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={bulkAssignGroup}>
            Assign Group
          </button>
          <select value={bulkProxyId} onChange={(e) => setBulkProxyId(e.target.value)}>
            <option value="">No proxy</option>
            {proxies.map((px) => (
              <option key={px.id} value={px.id}>
                {px.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={bulkAssignProxy}>
            Assign Proxy
          </button>
          <select value={bulkCampaignId} onChange={(e) => setBulkCampaignId(e.target.value)}>
            <option value="">Choose campaign…</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={bulkAddToCampaign}>
            Add to Campaign
          </button>
          <select value={bulkPodId} onChange={(e) => setBulkPodId(e.target.value)}>
            <option value="">Choose pod…</option>
            {pods.map((pd) => (
              <option key={pd.id} value={pd.id}>
                {pd.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={bulkAddToPod}>
            Add to Pod
          </button>
          <button type="button" onClick={() => setShowBulkRule(true)}>
            Create Rule for Selected
          </button>
          <button type="button" className="danger" onClick={bulkDelete}>
            Delete
          </button>
        </BulkToolbar>
      )}
      {bulkStatus && <p className="hint">{bulkStatus}</p>}

      <div className="panel">
      <table className="mini-table">
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                checked={visibleProfiles.length > 0 && selected.size === visibleProfiles.length}
                onChange={toggleSelectAll}
              />
            </th>
            <th>Name</th>
            <th>Username</th>
            <th>Platform</th>
            <th>Status</th>
            <th>Device</th>
            <th>Group</th>
            <th>Proxy</th>
            <th>Login</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {visibleProfiles.map((p) => (
            <tr key={p.id}>
              <td>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelected(p.id)} />
              </td>
              <td>{p.display_name}</td>
              <td>{p.username}</td>
              <td>{p.platform}</td>
              <td>
                <Badge status={p.enabled ? p.status : "paused"} />
              </td>
              <td>
                <div className="hint">{p.device_name || "unnamed"}</div>
                <div className="hint">{p.device_id}</div>
              </td>
              <td>
                <select value={p.group_id ?? ""} onChange={(e) => assignGroup(p.id, e.target.value)}>
                  <option value="">No group</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <select value={p.proxy_id ?? ""} onChange={(e) => assignProxy(p.id, e.target.value)}>
                  <option value="">No proxy</option>
                  {proxies.map((px) => (
                    <option key={px.id} value={px.id}>
                      {px.label}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <button type="button" onClick={() => captureLogin(p.id)}>
                  Capture Login
                </button>
                {captureStatus[p.id] && <div className="hint">{captureStatus[p.id]}</div>}
              </td>
              <td>
                <button type="button" onClick={() => setRulesModal(p)}>
                  Rules
                </button>
                <button type="button" onClick={() => setManageModal(p)}>
                  Manage
                </button>
                <button type="button" onClick={() => duplicateProfile(p.id)}>
                  Duplicate
                </button>
                <button type="button" className="danger" onClick={() => removeProfile(p.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {visibleProfiles.length === 0 && (
            <tr>
              <td className="empty" colSpan={10}>
                No profiles yet — add one to get started.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      {showAddProfile && (
        <Modal title="Add Profile" onClose={() => setShowAddProfile(false)}>
          <form className="row" onSubmit={addProfile}>
            <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
              <option value="instagram">Instagram</option>
              <option value="twitter">Twitter/X</option>
              <option value="facebook">Facebook</option>
              <option value="tiktok">TikTok</option>
              <option value="linkedin">LinkedIn</option>
              <option value="youtube">YouTube</option>
            </select>
            <input
              placeholder="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
            <input
              placeholder="Username (on platform)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <select value={proxyId} onChange={(e) => setProxyId(e.target.value)}>
              <option value="">No proxy</option>
              {proxies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">No group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Device name (optional)"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
            />
            <button type="submit" className="primary">
              Add Profile
            </button>
          </form>
        </Modal>
      )}

      {rulesModal && (
        <Modal title={`Rules — ${rulesModal.display_name}`} onClose={() => setRulesModal(null)} wide>
          <RulesPanel profileId={rulesModal.id} platform={rulesModal.platform} />
        </Modal>
      )}

      {manageModal && (
        <Modal title={`Manage — ${manageModal.display_name}`} onClose={() => setManageModal(null)} wide>
          <ProfileManagePanel profile={manageModal} onChanged={refresh} />
        </Modal>
      )}

      {showBulkRule && (
        <BulkRuleModal
          profiles={selectedProfiles}
          onClose={() => setShowBulkRule(false)}
          onDone={() => {
            setSelected(new Set());
          }}
        />
      )}
    </div>
  );
}
