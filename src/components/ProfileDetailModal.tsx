import { useState } from "react";
import { api, Profile, ProfileGroup, Proxy } from "../api";
import { Modal } from "./Modal";
import { ProfileManagePanel } from "../pages/ProfileManagePanel";
import { RulesPanel } from "../pages/RulesPanel";

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  twitter: "Twitter/X",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
};

type Tab = "info" | "login" | "rules";

export function ProfileDetailModal({
  profile,
  proxies,
  groups,
  onClose,
  onChanged,
}: {
  profile: Profile;
  proxies: Proxy[];
  groups: ProfileGroup[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>("info");

  const [displayName, setDisplayName] = useState(profile.display_name);
  const [username, setUsername] = useState(profile.username);
  const [deviceName, setDeviceName] = useState(profile.device_name);
  const [infoStatus, setInfoStatus] = useState("");

  async function saveDisplayName() {
    await api.setProfileDisplayName(profile.id, displayName);
    setInfoStatus("display name saved");
    onChanged();
  }

  async function saveUsername() {
    await api.setProfileUsername(profile.id, username);
    setInfoStatus("username saved");
    onChanged();
  }

  async function saveDeviceName() {
    await api.setProfileDeviceName(profile.id, deviceName);
    setInfoStatus("device name saved");
    onChanged();
  }

  async function regenerateDeviceId() {
    const newId = await api.regenerateDeviceId(profile.id);
    setInfoStatus(`new device ID: ${newId}`);
    onChanged();
  }

  async function toggleEnabled() {
    await api.setProfileEnabled(profile.id, !profile.enabled);
    onChanged();
  }

  async function changeProxy(proxyId: string) {
    await api.setProfileProxy(profile.id, proxyId || null);
    onChanged();
  }

  async function changeGroup(groupId: string) {
    await api.setProfileGroup(profile.id, groupId || null);
    onChanged();
  }

  return (
    <Modal title={`${profile.display_name} — ${PLATFORM_LABEL[profile.platform] ?? profile.platform}`} onClose={onClose} wide>
      <div className="row" style={{ marginBottom: 12 }}>
        <button type="button" className={tab === "info" ? "primary" : "ghost"} onClick={() => setTab("info")}>
          Info
        </button>
        <button type="button" className={tab === "login" ? "primary" : "ghost"} onClick={() => setTab("login")}>
          Login
        </button>
        <button type="button" className={tab === "rules" ? "primary" : "ghost"} onClick={() => setTab("rules")}>
          Rules
        </button>
      </div>

      {tab === "info" && (
        <div className="rules-panel">
          <h4>Profile</h4>
          {infoStatus && <p className="hint">{infoStatus}</p>}
          <div className="row">
            <label className="hint">
              Display name
              <br />
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </label>
            <button type="button" onClick={saveDisplayName}>
              Save
            </button>
            <label className="hint">
              Username
              <br />
              <input value={username} onChange={(e) => setUsername(e.target.value)} />
            </label>
            <button type="button" onClick={saveUsername}>
              Save
            </button>
          </div>
          <div className="row">
            <label className="hint">
              Proxy
              <br />
              <select value={profile.proxy_id ?? ""} onChange={(e) => changeProxy(e.target.value)}>
                <option value="">No proxy</option>
                {proxies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="hint">
              Group
              <br />
              <select value={profile.group_id ?? ""} onChange={(e) => changeGroup(e.target.value)}>
                <option value="">No group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="hint">
              <br />
              <input type="checkbox" checked={profile.enabled} onChange={toggleEnabled} /> Enabled
            </label>
          </div>

          <h4>Device</h4>
          <div className="row">
            <input
              placeholder="Device name (e.g. Pixel 7)"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
            />
            <button type="button" onClick={saveDeviceName}>
              Save Device Name
            </button>
            <span className="hint">Device ID: {profile.device_id}</span>
            <button type="button" className="ghost" onClick={regenerateDeviceId}>
              Regenerate ID
            </button>
          </div>
          <p className="hint">
            Purely an organizational label — this is browser automation, not a real device, so
            there's no actual IMEI behind it.
          </p>

          <h4>Fingerprint</h4>
          <p className="hint">Timezone: {profile.timezone}</p>
          <p className="hint">Locale: {profile.locale}</p>
          <p className="hint">
            Viewport: {profile.viewport_width}×{profile.viewport_height}
          </p>
          <p className="hint">User agent: {profile.user_agent}</p>
          <p className="hint">Status: {profile.status}</p>
          <p className="hint">Created: {new Date(profile.created_at).toLocaleString()}</p>
        </div>
      )}

      {tab === "login" && <ProfileManagePanel profile={profile} onChanged={onChanged} />}

      {tab === "rules" && <RulesPanel profileId={profile.id} platform={profile.platform} />}
    </Modal>
  );
}
