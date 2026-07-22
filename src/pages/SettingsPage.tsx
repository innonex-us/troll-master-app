import { useEffect, useState, type FormEvent } from "react";
import { api, AppSettings } from "../api";

const APP_VERSION = "0.1.0";

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");

  const [dataDir, setDataDir] = useState("");
  const [clearDays, setClearDays] = useState(30);
  const [clearStatus, setClearStatus] = useState("");

  const [pingStatus, setPingStatus] = useState("");

  async function refresh() {
    try {
      const [s, dir] = await Promise.all([api.getSettings(), api.getAppDataDir()]);
      setSettings(s);
      setDataDir(dir);
      setError("");
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    try {
      await api.saveSettings(settings);
      setSaveStatus("saved — scheduler interval change needs an app restart, the rest apply immediately");
    } catch (err) {
      setError(String(err));
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordStatus("");
    if (newPassword !== confirmPassword) {
      setPasswordStatus("new passwords don't match");
      return;
    }
    if (newPassword.length < 4) {
      setPasswordStatus("use at least 4 characters");
      return;
    }
    try {
      const ok = await api.verifyMasterPassword(currentPassword);
      if (!ok) {
        setPasswordStatus("current password is incorrect");
        return;
      }
      await api.setMasterPassword(newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordStatus("password updated");
    } catch (err) {
      setPasswordStatus(String(err));
    }
  }

  async function clearLogs() {
    setClearStatus("clearing…");
    try {
      const count = await api.clearOldLogs(clearDays);
      setClearStatus(`removed ${count} log entries older than ${clearDays} days`);
    } catch (err) {
      setClearStatus(`error: ${err}`);
    }
  }

  async function testSidecar() {
    setPingStatus("pinging…");
    try {
      const result = await api.pingSidecar();
      setPingStatus(result.pong ? "sidecar responding" : "unexpected response");
    } catch (err) {
      setPingStatus(`error: ${err}`);
    }
  }

  if (!settings) {
    return (
      <div>
        <div className="page-header">
          <h1>Settings</h1>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <div className="sub">Engine tuning, security, and data management</div>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <form className="panel" onSubmit={saveSettings}>
        <h3>Engine</h3>
        <div className="row">
          <label className="hint">
            Scheduler tick (seconds, restart required)
            <br />
            <input
              type="number"
              min={5}
              value={settings.scheduler_tick_secs}
              onChange={(e) => setSettings({ ...settings, scheduler_tick_secs: Number(e.target.value) })}
            />
          </label>
          <label className="hint">
            Monitor refresh (minutes)
            <br />
            <input
              type="number"
              min={1}
              value={settings.monitor_refresh_mins}
              onChange={(e) => setSettings({ ...settings, monitor_refresh_mins: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className="row">
          <label className="hint">
            Backoff base (minutes)
            <br />
            <input
              type="number"
              min={1}
              value={settings.backoff_base_mins}
              onChange={(e) => setSettings({ ...settings, backoff_base_mins: Number(e.target.value) })}
            />
          </label>
          <label className="hint">
            Backoff cap (hours)
            <br />
            <input
              type="number"
              min={1}
              value={settings.backoff_cap_hours}
              onChange={(e) => setSettings({ ...settings, backoff_cap_hours: Number(e.target.value) })}
            />
          </label>
          <label className="hint">
            <br />
            <input
              type="checkbox"
              checked={settings.warmup_enabled}
              onChange={(e) => setSettings({ ...settings, warmup_enabled: e.target.checked })}
            />{" "}
            Warmup curve for new profiles
          </label>
        </div>
        <button type="submit" className="primary">
          Save Engine Settings
        </button>
        {saveStatus && <p className="hint">{saveStatus}</p>}
      </form>

      <form className="panel" onSubmit={changePassword}>
        <h3>Security</h3>
        <p className="hint">
          This is a local lock screen only — it deters casual access to an unattended window. Session
          data stays protected by your OS keychain regardless of this password.
        </p>
        <div className="row">
          <input
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
          <button type="submit" className="primary">
            Change Password
          </button>
        </div>
        {passwordStatus && <p className="hint">{passwordStatus}</p>}
      </form>

      <div className="panel">
        <h3>Data</h3>
        <p className="hint">Data directory: {dataDir}</p>
        <div className="row">
          <input
            type="number"
            min={1}
            value={clearDays}
            onChange={(e) => setClearDays(Number(e.target.value))}
            title="days"
          />
          <button type="button" onClick={clearLogs}>
            Clear Logs Older Than N Days
          </button>
          {clearStatus && <span className="hint">{clearStatus}</span>}
        </div>
      </div>

      <div className="panel">
        <h3>Diagnostics</h3>
        <div className="row">
          <button type="button" onClick={testSidecar}>
            Test Sidecar Connection
          </button>
          {pingStatus && <span className="hint">{pingStatus}</span>}
        </div>
        <p className="hint">jarveeAuto v{APP_VERSION} · local automation engine</p>
      </div>
    </div>
  );
}
