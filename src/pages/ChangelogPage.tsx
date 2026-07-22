import { useEffect, useState } from "react";
import { MarkdownLite } from "../components/MarkdownLite";

type GithubRelease = {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  prerelease: boolean;
};

const REPO = "innonex-us/jarvee";

export function ChangelogPage() {
  const [releases, setReleases] = useState<GithubRelease[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`https://api.github.com/repos/${REPO}/releases`)
      .then((res) => {
        if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
        return res.json();
      })
      .then((data: GithubRelease[]) => {
        setReleases(data);
        setError("");
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Changelog</h1>
          <div className="sub">Version history, pulled live from GitHub releases</div>
        </div>
        <a
          href={`https://github.com/${REPO}/releases`}
          target="_blank"
          rel="noreferrer"
          className="hint"
        >
          View on GitHub ↗
        </a>
      </div>
      {error && <p className="error">{error}</p>}
      {loading && <p className="hint">Loading…</p>}

      {releases.map((r) => (
        <div className="panel" key={r.tag_name}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <h2>
              {r.name || r.tag_name}
              {r.prerelease && (
                <span className="badge warn" style={{ marginLeft: 8 }}>
                  <span className="dot" />
                  pre-release
                </span>
              )}
            </h2>
            <span className="hint">{new Date(r.published_at).toLocaleDateString()}</span>
          </div>
          <div className="changelog-body">
            {r.body ? <MarkdownLite text={r.body} /> : "No release notes."}
          </div>
        </div>
      ))}

      {!loading && !error && releases.length === 0 && (
        <div className="panel">
          <p className="empty">No releases published yet.</p>
        </div>
      )}
    </div>
  );
}
