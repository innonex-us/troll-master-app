import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { save, open } from "@tauri-apps/plugin-dialog";
import { api, NewProxy, Proxy } from "../api";
import { Modal } from "../components/Modal";

/**
 * Accepts either a header CSV ("label,protocol,host,port,username,password")
 * or a plain list — one proxy per line as "host:port" or
 * "host:port:username:password" (the common format proxy providers export).
 */
function parseProxyFile(text: string): NewProxy[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  if (lines.length === 0) return [];

  const header = lines[0].toLowerCase();
  if (header.includes("host") && header.includes("port") && header.includes(",")) {
    const cols = header.split(",").map((c) => c.trim());
    return lines.slice(1).map((line) => {
      const cells = line.split(",").map((c) => c.trim());
      const get = (name: string) => {
        const i = cols.indexOf(name);
        return i >= 0 ? cells[i] ?? "" : "";
      };
      const host = get("host");
      const port = get("port");
      return {
        label: get("label") || `${host}:${port}`,
        protocol: get("protocol") || "http",
        host,
        port: Number(port) || 0,
        username: get("username") || null,
        password: get("password") || null,
      };
    });
  }

  return lines.map((line) => {
    const [host, port, username, password] = line.split(":");
    return {
      label: `${host}:${port}`,
      protocol: "http",
      host,
      port: Number(port) || 0,
      username: username || null,
      password: password || null,
    };
  });
}

export function ProxiesPage() {
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [error, setError] = useState("");
  const [backupStatus, setBackupStatus] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [label, setLabel] = useState("");
  const [protocol, setProtocol] = useState("http");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(8080);
  const [proxyUser, setProxyUser] = useState("");
  const [proxyPass, setProxyPass] = useState("");

  async function refresh() {
    try {
      setProxies(await api.listProxies());
      setError("");
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addProxy(e: FormEvent) {
    e.preventDefault();
    try {
      await api.createProxy({
        label,
        protocol,
        host,
        port,
        username: proxyUser || null,
        password: proxyPass || null,
      });
      setLabel("");
      setHost("");
      setProxyUser("");
      setProxyPass("");
      setShowAdd(false);
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function removeProxy(id: string) {
    await api.deleteProxy(id);
    await refresh();
  }

  async function exportProxies() {
    setBackupStatus("");
    try {
      const path = await save({
        defaultPath: "jarveeauto-proxies.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      await api.exportProxiesBackup(path);
      setBackupStatus(`exported to ${path}`);
    } catch (err) {
      setBackupStatus(`error: ${err}`);
    }
  }

  async function importProxies() {
    setBackupStatus("");
    try {
      const path = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (!path || Array.isArray(path)) return;
      const summary = await api.importProxiesBackup(path);
      setBackupStatus(`imported ${summary.proxies} proxies`);
      await refresh();
    } catch (err) {
      setBackupStatus(`error: ${err}`);
    }
  }

  async function importProxyFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBackupStatus("");
    try {
      const parsed = parseProxyFile(await file.text()).filter((p) => p.host && p.port);
      let created = 0;
      for (const p of parsed) {
        await api.createProxy(p);
        created += 1;
      }
      setBackupStatus(`imported ${created} of ${parsed.length} proxies from file`);
      await refresh();
    } catch (err) {
      setBackupStatus(`error: ${err}`);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Proxies</h1>
          <div className="sub">Assign one proxy per profile to keep sessions isolated</div>
          <div className="sub">Export includes proxy credentials in plaintext — handle the file accordingly.</div>
        </div>
        <div className="row">
          <button type="button" onClick={exportProxies}>
            Export
          </button>
          <button type="button" onClick={importProxies}>
            Import JSON
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            Import CSV/TXT
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            style={{ display: "none" }}
            onChange={importProxyFile}
          />
          <button type="button" className="primary" onClick={() => setShowAdd(true)}>
            + Add Proxy
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {backupStatus && <p className="hint">{backupStatus}</p>}
      <p className="sub">
        CSV/TXT: one proxy per line as "host:port" or "host:port:username:password", or a CSV with a
        header row (label,protocol,host,port,username,password).
      </p>

      <div className="panel">
      <table className="mini-table">
        <thead>
          <tr>
            <th>Label</th>
            <th>Protocol</th>
            <th>Host</th>
            <th>Port</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {proxies.map((p) => (
            <tr key={p.id}>
              <td>{p.label}</td>
              <td>{p.protocol}</td>
              <td>{p.host}</td>
              <td>{p.port}</td>
              <td>
                <button type="button" className="danger" onClick={() => removeProxy(p.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {proxies.length === 0 && (
            <tr>
              <td className="empty" colSpan={5}>
                No proxies yet — add one to get started.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      {showAdd && (
        <Modal title="Add Proxy" onClose={() => setShowAdd(false)}>
          <form className="row" onSubmit={addProxy}>
            <input placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} required />
            <select value={protocol} onChange={(e) => setProtocol(e.target.value)}>
              <option value="http">HTTP</option>
              <option value="socks5">SOCKS5</option>
            </select>
            <input placeholder="Host" value={host} onChange={(e) => setHost(e.target.value)} required />
            <input
              type="number"
              placeholder="Port"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              required
            />
            <input
              placeholder="Username (optional)"
              value={proxyUser}
              onChange={(e) => setProxyUser(e.target.value)}
            />
            <input
              placeholder="Password (optional)"
              type="password"
              value={proxyPass}
              onChange={(e) => setProxyPass(e.target.value)}
            />
            <button type="submit" className="primary">
              Add Proxy
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
