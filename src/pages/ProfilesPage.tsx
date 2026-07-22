import { Fragment, useEffect, useState, type FormEvent } from "react";
import { api, Platform, Profile, ProfileGroup, Proxy } from "../api";
import { RulesPanel } from "./RulesPanel";
import { Badge } from "../components/Badge";

export function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [groups, setGroups] = useState<ProfileGroup[]>([]);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [captureStatus, setCaptureStatus] = useState<Record<string, string>>({});

  const [platform, setPlatform] = useState<Platform>("instagram");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [proxyId, setProxyId] = useState<string>("");
  const [groupId, setGroupId] = useState<string>("");

  const [newGroupName, setNewGroupName] = useState("");
  const [groupFilter, setGroupFilter] = useState("");

  async function refresh() {
    try {
      const [p, px, g] = await Promise.all([
        api.listProfiles(),
        api.listProxies(),
        api.listProfileGroups(),
      ]);
      setProfiles(p);
      setProxies(px);
      setGroups(g);
      setError("");
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addProfile(e: FormEvent) {
    e.preventDefault();
    try {
      const created = await api.createProfile({
        platform,
        display_name: displayName,
        username,
        proxy_id: proxyId || null,
      });
      if (groupId) {
        await api.setProfileGroup(created.id, groupId);
      }
      setDisplayName("");
      setUsername("");
      setProxyId("");
      setGroupId("");
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

  const visibleProfiles = groupFilter ? profiles.filter((p) => p.group_id === groupFilter) : profiles;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Profiles</h1>
          <div className="sub">Social accounts under management</div>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

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

      <form className="row panel" onSubmit={addProfile}>
        <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
          <option value="instagram">Instagram</option>
          <option value="twitter">Twitter/X</option>
          <option value="facebook">Facebook</option>
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
        <button type="submit" className="primary">
          Add Profile
        </button>
      </form>

      <div className="panel">
      <table className="mini-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Username</th>
            <th>Platform</th>
            <th>Status</th>
            <th>Group</th>
            <th>Proxy</th>
            <th>Login</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {visibleProfiles.map((p) => (
            <Fragment key={p.id}>
              <tr>
                <td>{p.display_name}</td>
                <td>{p.username}</td>
                <td>{p.platform}</td>
                <td>
                  <Badge status={p.status} />
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
                  <select
                    value={p.proxy_id ?? ""}
                    onChange={(e) => assignProxy(p.id, e.target.value)}
                  >
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
                  <button type="button" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                    {expanded === p.id ? "Hide Rules" : "Rules"}
                  </button>
                  <button type="button" className="danger" onClick={() => removeProfile(p.id)}>
                    Delete
                  </button>
                </td>
              </tr>
              {expanded === p.id && (
                <tr>
                  <td colSpan={8}>
                    <RulesPanel profileId={p.id} platform={p.platform} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {visibleProfiles.length === 0 && (
            <tr>
              <td className="empty" colSpan={8}>
                No profiles yet — add one above to get started.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
