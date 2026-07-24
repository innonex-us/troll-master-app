import { useEffect, useState, type FormEvent } from "react";
import { save, open } from "@tauri-apps/plugin-dialog";
import { api, Campaign, Profile, ProfileGroup } from "../api";
import { CampaignRulesPanel } from "./CampaignRulesPanel";
import { Badge } from "../components/Badge";
import { Modal } from "../components/Modal";

export function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<ProfileGroup[]>([]);
  const [error, setError] = useState("");
  const [manageCampaign, setManageCampaign] = useState<Campaign | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [enrolled, setEnrolled] = useState<Record<string, Set<string>>>({});

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");

  const [groupFilter, setGroupFilter] = useState("");
  const [actionStatus, setActionStatus] = useState<Record<string, string>>({});
  const [backupStatus, setBackupStatus] = useState("");

  async function refresh() {
    try {
      const [c, p, g] = await Promise.all([
        api.listCampaigns(),
        api.listProfiles(),
        api.listProfileGroups(),
      ]);
      setCampaigns(c);
      setProfiles(p);
      setGroups(g);
      setError("");
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function refreshEnrollment(campaignId: string) {
    const ids = await api.listEnrolledProfiles(campaignId);
    setEnrolled((prev) => ({ ...prev, [campaignId]: new Set(ids) }));
  }

  useEffect(() => {
    if (manageCampaign) refreshEnrollment(manageCampaign.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manageCampaign?.id]);

  async function exportCampaigns() {
    setBackupStatus("");
    try {
      const path = await save({
        defaultPath: "troll-master-campaigns.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      await api.exportCampaignsBackup(path);
      setBackupStatus(`exported to ${path}`);
    } catch (err) {
      setBackupStatus(`error: ${err}`);
    }
  }

  async function importCampaigns() {
    setBackupStatus("");
    try {
      const path = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (!path || Array.isArray(path)) return;
      const summary = await api.importCampaignsBackup(path);
      setBackupStatus(`imported ${summary.campaigns} campaigns, ${summary.campaign_rules} campaign rules`);
      await refresh();
    } catch (err) {
      setBackupStatus(`error: ${err}`);
    }
  }

  async function addCampaign(e: FormEvent) {
    e.preventDefault();
    try {
      const tagList = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await api.createCampaign({ name, description, tags: tagList });
      setName("");
      setDescription("");
      setTags("");
      setShowAdd(false);
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function removeCampaign(id: string) {
    await api.deleteCampaign(id);
    await refresh();
  }

  async function toggleCampaignEnabled(c: Campaign) {
    await api.setCampaignEnabled(c.id, !c.enabled);
    await refresh();
  }

  async function resetCampaign(id: string) {
    await api.resetCampaign(id);
    setActionStatus((s) => ({ ...s, [id]: "reset — cursor/errors cleared for all enrolled profiles" }));
  }

  async function retryFailed(id: string) {
    await api.retryFailedCampaign(id);
    setActionStatus((s) => ({ ...s, [id]: "backoff cleared for profiles currently in cooldown" }));
  }

  async function toggleEnroll(campaignId: string, profileId: string, isEnrolled: boolean) {
    if (isEnrolled) {
      await api.unenrollProfile(campaignId, profileId);
    } else {
      const result = await api.enrollProfiles(campaignId, [profileId]);
      if (result.skipped.length > 0) {
        setActionStatus((s) => ({ ...s, [campaignId]: result.skipped.join("; ") }));
      }
    }
    await refreshEnrollment(campaignId);
  }

  const visibleProfiles = groupFilter ? profiles.filter((p) => p.group_id === groupFilter) : profiles;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Campaigns</h1>
          <div className="sub">
            Shared rule definitions — enroll profiles to run them live. Editing a campaign updates
            every enrolled profile immediately.
          </div>
        </div>
        <div className="row">
          <button type="button" onClick={exportCampaigns}>
            Export
          </button>
          <button type="button" onClick={importCampaigns}>
            Import
          </button>
          <button type="button" className="primary" onClick={() => setShowAdd(true)}>
            + Create Campaign
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {backupStatus && <p className="hint">{backupStatus}</p>}

      <div className="panel">
        <table className="mini-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Tags</th>
              <th>Status</th>
              <th>Enrolled</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.tags.join(", ")}</td>
                <td>
                  <Badge status={c.enabled ? "active" : "paused"} />
                </td>
                <td>{enrolled[c.id]?.size ?? "—"}</td>
                <td>
                  <button type="button" onClick={() => toggleCampaignEnabled(c)}>
                    {c.enabled ? "Stop" : "Start"}
                  </button>
                  <button type="button" onClick={() => resetCampaign(c.id)}>
                    Reset
                  </button>
                  <button type="button" onClick={() => retryFailed(c.id)}>
                    Retry Failed
                  </button>
                  <button type="button" onClick={() => setManageCampaign(c)}>
                    Manage
                  </button>
                  <button type="button" className="danger" onClick={() => removeCampaign(c.id)}>
                    Delete
                  </button>
                  {actionStatus[c.id] && <div className="hint">{actionStatus[c.id]}</div>}
                </td>
              </tr>
            ))}
            {campaigns.length === 0 && (
              <tr>
                <td className="empty" colSpan={5}>
                  No campaigns yet — create one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <Modal title="Create Campaign" onClose={() => setShowAdd(false)}>
          <form className="row" onSubmit={addCampaign}>
            <input
              placeholder="Campaign name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <input
              placeholder="tags, comma separated"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
            <button type="submit" className="primary">
              Create Campaign
            </button>
          </form>
        </Modal>
      )}

      {manageCampaign && (
        <Modal title={`Manage — ${manageCampaign.name}`} onClose={() => setManageCampaign(null)} wide>
          <CampaignRulesPanel campaignId={manageCampaign.id} />

          <div className="rules-panel">
            <h4>Enrolled Profiles</h4>
            <p className="hint">
              Checking a profile enrolls it in every template rule above (skipping any action not
              supported on its platform). Unchecking removes it from all of them.
            </p>
            <div className="row">
              <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
                <option value="">All profiles</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <table className="mini-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Name</th>
                  <th>Platform</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleProfiles.map((p) => {
                  const isEnrolled = enrolled[manageCampaign.id]?.has(p.id) ?? false;
                  return (
                    <tr key={p.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={isEnrolled}
                          onChange={() => toggleEnroll(manageCampaign.id, p.id, isEnrolled)}
                        />
                      </td>
                      <td>{p.display_name}</td>
                      <td>{p.platform}</td>
                      <td>
                        <Badge status={p.status} />
                      </td>
                    </tr>
                  );
                })}
                {visibleProfiles.length === 0 && (
                  <tr>
                    <td className="empty" colSpan={4}>
                      No profiles match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  );
}
