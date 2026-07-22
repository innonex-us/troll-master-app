import { Fragment, useEffect, useState, type FormEvent } from "react";
import { api, Platform, Profile, Proxy } from "../api";
import { RulesPanel } from "./RulesPanel";
import { Badge } from "../components/Badge";

export function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [captureStatus, setCaptureStatus] = useState<Record<string, string>>({});

  const [platform, setPlatform] = useState<Platform>("instagram");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [proxyId, setProxyId] = useState<string>("");

  async function refresh() {
    try {
      const [p, px] = await Promise.all([api.listProfiles(), api.listProxies()]);
      setProfiles(p);
      setProxies(px);
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
      await api.createProfile({
        platform,
        display_name: displayName,
        username,
        proxy_id: proxyId || null,
      });
      setDisplayName("");
      setUsername("");
      setProxyId("");
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function assignProxy(profileId: string, newProxyId: string) {
    await api.setProfileProxy(profileId, newProxyId || null);
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

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Profiles</h1>
          <div className="sub">Social accounts under management</div>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <form className="row panel" onSubmit={addProfile}>
        <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
          <option value="instagram">Instagram</option>
          <option value="twitter">Twitter/X</option>
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
            <th>Proxy</th>
            <th>Login</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((p) => (
            <Fragment key={p.id}>
              <tr>
                <td>{p.display_name}</td>
                <td>{p.username}</td>
                <td>{p.platform}</td>
                <td>
                  <Badge status={p.status} />
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
                  <td colSpan={7}>
                    <RulesPanel profileId={p.id} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {profiles.length === 0 && (
            <tr>
              <td className="empty" colSpan={7}>
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
