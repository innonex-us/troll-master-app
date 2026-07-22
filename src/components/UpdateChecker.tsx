import { useEffect, useState } from "react";
import { checkForUpdate, installUpdate, type Update } from "../update";
import { Modal } from "./Modal";

export function UpdateChecker() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(-1);
  const [error, setError] = useState("");

  useEffect(() => {
    checkForUpdate()
      .then(setUpdate)
      .catch(() => {
        // silent — offline or no releases published yet; not worth interrupting the user
      });
  }, []);

  if (!update || dismissed) return null;

  async function install() {
    if (!update) return;
    setInstalling(true);
    setError("");
    try {
      await installUpdate(update, setProgress);
    } catch (err) {
      setError(String(err));
      setInstalling(false);
    }
  }

  return (
    <Modal title="Update Available" onClose={() => setDismissed(true)}>
      <p>
        Version <strong>{update.version}</strong> is available (you're on {update.currentVersion}).
      </p>
      {update.body && <p className="hint">{update.body}</p>}
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="button" className="primary" disabled={installing} onClick={install}>
          {installing ? (progress >= 0 ? `Installing… ${progress}%` : "Installing…") : "Download & Install"}
        </button>
        <button type="button" disabled={installing} onClick={() => setDismissed(true)}>
          Remind Me Later
        </button>
      </div>
    </Modal>
  );
}
