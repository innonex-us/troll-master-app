import { useEffect, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { api, Profile } from "../api";
import { InfoButton } from "../components/InfoButton";

type ScrapeKind = "followers_of" | "hashtag";

const KINDS: { id: ScrapeKind; label: string; seedLabel: string; yields: string }[] = [
  { id: "followers_of", label: "Followers of an account", seedLabel: "seed username", yields: "usernames" },
  { id: "hashtag", label: "Posts under a hashtag", seedLabel: "hashtag (no #)", yields: "post URLs" },
];

export function ToolsPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState("");
  const [kind, setKind] = useState<ScrapeKind>("followers_of");
  const [seed, setSeed] = useState("");
  const [limit, setLimit] = useState(200);
  const [skipNoAvatar, setSkipNoAvatar] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    api.listProfiles().then((p) => {
      const active = p.filter((x) => x.status === "active");
      setProfiles(active);
      if (active[0]) setProfileId(active[0].id);
    });
  }, []);

  const activeKind = KINDS.find((k) => k.id === kind)!;

  async function run() {
    if (!profileId || !seed.trim()) return;
    setRunning(true);
    setStatus("scraping…");
    setResults([]);
    try {
      const out = await api.scrapeExport(profileId, kind, seed.trim(), limit, skipNoAvatar);
      setResults(out);
      setStatus(`${out.length} ${activeKind.yields} scraped`);
    } catch (err) {
      setStatus(`error: ${err}`);
    } finally {
      setRunning(false);
    }
  }

  async function exportCsv() {
    if (results.length === 0) return;
    const path = await save({
      defaultPath: `troll-master-${kind}-${seed.trim()}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!path) return;
    const header = kind === "hashtag" ? "url" : "username";
    await api.writeTextFile(path, `${header}\n${results.join("\n")}\n`);
    setStatus(`exported ${results.length} rows to ${path}`);
  }

  async function copyList() {
    await navigator.clipboard.writeText(results.join("\n"));
    setStatus(`copied ${results.length} to clipboard`);
  }

  const selectedProfile = profiles.find((p) => p.id === profileId);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Tools</h1>
          <div className="sub">Scrape audiences and hashtag posts, then export to CSV</div>
        </div>
      </div>

      <div className="panel">
        <div className="title-row">
          <h3>Scrape &amp; Export</h3>
          <InfoButton>
            Runs under a chosen active profile's logged-in session. Best-effort per platform —
            private or rate-limited accounts may return fewer results.
          </InfoButton>
        </div>
        <div className="row">
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            <option value="">Select active profile…</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name} ({p.platform})
              </option>
            ))}
          </select>
          <select value={kind} onChange={(e) => setKind(e.target.value as ScrapeKind)}>
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
          <input placeholder={activeKind.seedLabel} value={seed} onChange={(e) => setSeed(e.target.value)} />
          <input
            type="number"
            min={1}
            max={1000}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            title="max results"
          />
          {kind === "followers_of" && (
            <label className="hint">
              <input type="checkbox" checked={skipNoAvatar} onChange={(e) => setSkipNoAvatar(e.target.checked)} />{" "}
              skip no-avatar
            </label>
          )}
          <button type="button" className="primary" onClick={run} disabled={running || !profileId}>
            {running ? "Scraping…" : "Scrape"}
          </button>
        </div>
        {!selectedProfile && profiles.length === 0 && (
          <p className="hint">No active profiles — capture a login first on the Profiles page.</p>
        )}
        {status && <p className="hint">{status}</p>}
      </div>

      {results.length > 0 && (
        <div className="panel">
          <div className="row">
            <button type="button" className="primary" onClick={exportCsv}>
              Export CSV
            </button>
            <button type="button" onClick={copyList}>
              Copy to clipboard
            </button>
          </div>
          <table className="mini-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{kind === "hashtag" ? "Post URL" : "Username"}</th>
              </tr>
            </thead>
            <tbody>
              {results.slice(0, 500).map((r, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{r}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {results.length > 500 && <p className="hint">Showing first 500 of {results.length} — export for the full list.</p>}
        </div>
      )}
    </div>
  );
}
