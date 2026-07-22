import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [checking, setChecking] = useState(true);
  const [firstRun, setFirstRun] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .hasMasterPassword()
      .then((has) => setFirstRun(!has))
      .catch((err) => setError(String(err)))
      .finally(() => setChecking(false));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (firstRun) {
        if (password.length < 4) {
          setError("Use at least 4 characters.");
          return;
        }
        if (password !== confirm) {
          setError("Passwords don't match.");
          return;
        }
        await api.setMasterPassword(password);
        onUnlock();
      } else {
        const ok = await api.verifyMasterPassword(password);
        if (ok) {
          onUnlock();
        } else {
          setError("Incorrect password.");
        }
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return <div className="lock-screen" />;
  }

  return (
    <div className="lock-screen">
      <form className="lock-card" onSubmit={submit}>
        <div className="brand">
          <span className="dot" />
          JARVEE//AUTO
        </div>
        <h2>{firstRun ? "Set a master password" : "Unlock"}</h2>
        {error && <p className="error">{error}</p>}

        <input
          type="password"
          autoFocus
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {firstRun && (
          <input
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        )}

        <button type="submit" className="primary" disabled={busy}>
          {firstRun ? "Set Password" : "Unlock"}
        </button>

        <p className="hint">
          Local lock screen only — deters casual access to an unattended window. Session data stays
          protected by your OS keychain regardless of this password.
        </p>
      </form>
    </div>
  );
}
