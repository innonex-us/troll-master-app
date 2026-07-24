import { useEffect, useState, type FormEvent } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { save, open } from "@tauri-apps/plugin-dialog";
import { api, AppSettings } from "../api";
import { checkForUpdate, installUpdate, type Update } from "../update";
import { getTheme, setTheme, type Theme } from "../theme";

const THEMES: { id: Theme; label: string }[] = [
  { id: "system", label: "Auto (follow OS)" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [appVersion, setAppVersion] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");

  const [dataDir, setDataDir] = useState("");
  const [clearDays, setClearDays] = useState(30);
  const [clearStatus, setClearStatus] = useState("");

  const [pingStatus, setPingStatus] = useState("");
  const [theme, setThemeState] = useState<Theme>(getTheme());

  const [backupStatus, setBackupStatus] = useState("");
  const [includeSettingsOnImport, setIncludeSettingsOnImport] = useState(false);

  const [updateStatus, setUpdateStatus] = useState("");
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(-1);

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
    getVersion().then(setAppVersion).catch(() => {});
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

  async function exportBackup() {
    setBackupStatus("");
    try {
      const path = await save({
        defaultPath: "troll-master-backup.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      await api.exportBackup(path);
      setBackupStatus(`exported to ${path}`);
    } catch (err) {
      setBackupStatus(`error: ${err}`);
    }
  }

  async function importBackup() {
    setBackupStatus("");
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path || Array.isArray(path)) return;
      const summary = await api.importBackup(path, includeSettingsOnImport);
      setBackupStatus(
        `imported ${summary.proxies} proxies, ${summary.groups} groups, ${summary.profiles} profiles, ` +
          `${summary.rules} rules, ${summary.campaigns} campaigns, ${summary.campaign_rules} campaign rules, ` +
          `${summary.pods} pods, ${summary.pod_members} pod members, ${summary.blacklist} blacklist entries` +
          (summary.settings_imported ? " — global settings replaced" : ""),
      );
      await refresh();
    } catch (err) {
      setBackupStatus(`error: ${err}`);
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

  async function checkUpdate() {
    setUpdateStatus("checking…");
    setPendingUpdate(null);
    try {
      const update = await checkForUpdate();
      if (update) {
        setPendingUpdate(update);
        setUpdateStatus(`v${update.version} available`);
      } else {
        setUpdateStatus("you're on the latest version");
      }
    } catch (err) {
      setUpdateStatus(`error: ${err}`);
    }
  }

  async function installPendingUpdate() {
    if (!pendingUpdate) return;
    setInstalling(true);
    try {
      await installUpdate(pendingUpdate, setProgress);
    } catch (err) {
      setUpdateStatus(`error: ${err}`);
      setInstalling(false);
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

      <div className="panel">
        <h3>Appearance</h3>
        <p className="hint">Theme preference is stored locally on this machine.</p>
        <div className="row">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={theme === t.id ? "primary" : ""}
              onClick={() => {
                setTheme(t.id);
                setThemeState(t.id);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

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
        <div className="row">
          <label className="hint">
            Max pending (un-returned) follows per profile — 0 = unlimited
            <br />
            <input
              type="number"
              min={0}
              value={settings.max_pending_follows}
              onChange={(e) => setSettings({ ...settings, max_pending_follows: Number(e.target.value) })}
            />
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
        <h3>Backup</h3>
        <p className="hint">
          Export profiles, proxies, groups, rules, campaigns, pods, and blacklist to a JSON file —
          everything is created as new records on import, never overwriting existing data. Session
          logins and stored passwords are never included (they're tied to this machine's keychain);
          restored profiles need a fresh login.
        </p>
        <div className="row">
          <button type="button" className="primary" onClick={exportBackup}>
            Export Backup
          </button>
        </div>
        <div className="row">
          <label className="hint">
            <input
              type="checkbox"
              checked={includeSettingsOnImport}
              onChange={(e) => setIncludeSettingsOnImport(e.target.checked)}
            />{" "}
            also replace global engine settings with the imported file's
          </label>
        </div>
        <div className="row">
          <button type="button" onClick={importBackup}>
            Import Backup
          </button>
        </div>
        {backupStatus && <p className="hint">{backupStatus}</p>}
      </div>

      <div className="panel">
        <h3>Diagnostics</h3>
        <div className="row">
          <button type="button" onClick={testSidecar}>
            Test Sidecar Connection
          </button>
          {pingStatus && <span className="hint">{pingStatus}</span>}
        </div>
        <p className="hint">Troll Master v{appVersion} · local automation engine</p>
      </div>

      <div className="panel">
        <h3>Updates</h3>
        <div className="row">
          <button type="button" onClick={checkUpdate} disabled={installing}>
            Check for Updates
          </button>
          {pendingUpdate && (
            <button type="button" className="primary" onClick={installPendingUpdate} disabled={installing}>
              {installing ? (progress >= 0 ? `Installing… ${progress}%` : "Installing…") : "Download & Install"}
            </button>
          )}
          {updateStatus && <span className="hint">{updateStatus}</span>}
        </div>
      </div>
    </div>
  );
}
