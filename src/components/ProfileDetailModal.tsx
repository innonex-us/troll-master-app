import { useEffect, useState } from "react";
import { api, Profile, ProfileGroup, Proxy, WelcomeDmConfig } from "../api";
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

type Tab = "info" | "login" | "rules" | "welcome";

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

  const [welcome, setWelcome] = useState<WelcomeDmConfig | null>(null);
  const [welcomeEnabled, setWelcomeEnabled] = useState(false);
  const [welcomePool, setWelcomePool] = useState("");
  const [welcomeDaily, setWelcomeDaily] = useState(10);
  const [welcomeMin, setWelcomeMin] = useState(120);
  const [welcomeMax, setWelcomeMax] = useState(600);
  const [welcomeStatus, setWelcomeStatus] = useState("");

  useEffect(() => {
    if (tab !== "welcome") return;
    api.getWelcomeDmConfig(profile.id).then((c) => {
      setWelcome(c);
      setWelcomeEnabled(c?.enabled ?? false);
      setWelcomePool(c?.message_pool.join("\n") ?? "");
      setWelcomeDaily(c?.daily_limit ?? 10);
      setWelcomeMin(c?.min_delay_sec ?? 120);
      setWelcomeMax(c?.max_delay_sec ?? 600);
    });
  }, [tab, profile.id]);

  async function saveWelcome() {
    const message_pool = welcomePool
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    try {
      const saved = await api.upsertWelcomeDmConfig({
        profile_id: profile.id,
        enabled: welcomeEnabled,
        message_pool,
        daily_limit: welcomeDaily,
        min_delay_sec: welcomeMin,
        max_delay_sec: welcomeMax,
      });
      setWelcome(saved);
      setWelcomeStatus("saved");
    } catch (err) {
      setWelcomeStatus(`error: ${err}`);
    }
  }

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
        <button type="button" className={tab === "welcome" ? "primary" : "ghost"} onClick={() => setTab("welcome")}>
          Welcome DM
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

      {tab === "welcome" && (
        <div className="rules-panel">
          <h4>Welcome DM to new followers</h4>
          <p className="hint">
            Periodically scans this profile's followers and DMs anyone new. The first scan just
            captures your existing followers (they're never messaged) — only followers gained after
            that get a welcome. Respects the daily limit, delay window, and blacklist.
          </p>
          <label className="hint">
            <input
              type="checkbox"
              checked={welcomeEnabled}
              onChange={(e) => setWelcomeEnabled(e.target.checked)}
            />{" "}
            Enabled
          </label>
          <textarea
            placeholder="message pool, one per line — supports {spintax|variants}"
            value={welcomePool}
            onChange={(e) => setWelcomePool(e.target.value)}
            rows={3}
            style={{ width: "100%", marginTop: 8 }}
          />
          <div className="row">
            <label className="hint">
              Daily limit
              <br />
              <input
                type="number"
                min={1}
                value={welcomeDaily}
                onChange={(e) => setWelcomeDaily(Number(e.target.value))}
              />
            </label>
            <label className="hint">
              Min delay (s)
              <br />
              <input
                type="number"
                min={1}
                value={welcomeMin}
                onChange={(e) => setWelcomeMin(Number(e.target.value))}
              />
            </label>
            <label className="hint">
              Max delay (s)
              <br />
              <input
                type="number"
                min={1}
                value={welcomeMax}
                onChange={(e) => setWelcomeMax(Number(e.target.value))}
              />
            </label>
          </div>
          <div className="row">
            <button type="button" className="primary" onClick={saveWelcome}>
              Save
            </button>
            {welcome && (
              <span className="hint">
                {welcome.seeded ? "baseline captured — welcoming new followers" : "not yet seeded — first scan will capture your current followers"}
              </span>
            )}
            {welcomeStatus && <span className="hint">{welcomeStatus}</span>}
          </div>
        </div>
      )}
    </Modal>
  );
}
