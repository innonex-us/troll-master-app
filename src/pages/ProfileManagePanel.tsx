import { useState, type FormEvent } from "react";
import { api, Profile } from "../api";

export function ProfileManagePanel({ profile, onChanged }: { profile: Profile; onChanged: () => void }) {
  const [password, setPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [autoLoginStatus, setAutoLoginStatus] = useState("");

  const [cookiesJson, setCookiesJson] = useState("");
  const [cookieStatus, setCookieStatus] = useState("");

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (!password) return;
    try {
      await api.setProfilePassword(profile.id, password);
      setPassword("");
      setPasswordStatus("password stored (encrypted)");
      onChanged();
    } catch (err) {
      setPasswordStatus(`error: ${err}`);
    }
  }

  async function clearPassword() {
    await api.clearProfilePassword(profile.id);
    setPasswordStatus("password cleared");
    onChanged();
  }

  async function runAutoLogin() {
    setAutoLoginStatus("opening browser, filling login…");
    try {
      await api.autoLogin(profile.id);
      setAutoLoginStatus("login succeeded");
      onChanged();
    } catch (err) {
      setAutoLoginStatus(`error: ${err}`);
    }
  }

  async function importCookies(e: FormEvent) {
    e.preventDefault();
    try {
      await api.importCookies(profile.id, cookiesJson);
      setCookiesJson("");
      setCookieStatus("cookies imported, session active");
      onChanged();
    } catch (err) {
      setCookieStatus(`error: ${err}`);
    }
  }

  return (
    <div className="rules-panel">
      <h4>Login — Auto Login (password)</h4>
      <p className="hint">
        Stores an encrypted password, then opens a real (visible) browser and fills the login form
        for you. Still headed so you can step in for 2FA/captcha if the platform asks.
      </p>
      <form className="row" onSubmit={savePassword}>
        <input
          type="password"
          placeholder={profile.has_password ? "Replace stored password" : "Password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="primary">
          Save Password
        </button>
        {profile.has_password && (
          <button type="button" className="danger" onClick={clearPassword}>
            Clear Password
          </button>
        )}
        <button type="button" disabled={!profile.has_password} onClick={runAutoLogin}>
          Auto Login
        </button>
      </form>
      {passwordStatus && <p className="hint">{passwordStatus}</p>}
      {autoLoginStatus && <p className="hint">{autoLoginStatus}</p>}

      <h4>Login — Import Cookies</h4>
      <p className="hint">
        Paste a JSON cookie export (e.g. from a browser extension) instead of logging in fresh —
        useful when a brand-new login would itself look suspicious to the platform.
      </p>
      <form className="row" onSubmit={importCookies}>
        <textarea
          placeholder='[{"name":"sessionid","value":"...","domain":".instagram.com","path":"/"}]'
          value={cookiesJson}
          onChange={(e) => setCookiesJson(e.target.value)}
          rows={3}
          style={{ flex: "1 1 100%" }}
          required
        />
        <button type="submit" className="primary">
          Import Cookies
        </button>
      </form>
      {cookieStatus && <p className="hint">{cookieStatus}</p>}
    </div>
  );
}
