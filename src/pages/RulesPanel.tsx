import { useEffect, useState } from "react";
import { api, ActionRule, DmSequenceProgress, Platform } from "../api";
import { Modal } from "../components/Modal";
import { RuleForm } from "../components/RuleForm";
import { BulkToolbar } from "../components/BulkToolbar";

export function RulesPanel({ profileId, platform }: { profileId: string; platform: Platform }) {
  const [rules, setRules] = useState<ActionRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scrapeStatus, setScrapeStatus] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [progressRule, setProgressRule] = useState<ActionRule | null>(null);
  const [progress, setProgress] = useState<DmSequenceProgress[]>([]);

  async function openProgress(rule: ActionRule) {
    setProgress(await api.listDmSequenceProgress(rule.id));
    setProgressRule(rule);
  }

  async function refresh() {
    setLoading(true);
    try {
      setRules(await api.listRules(profileId));
      setError("");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    setSelected(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  async function toggleRule(rule: ActionRule) {
    await api.setRuleEnabled(rule.id, !rule.enabled);
    await refresh();
  }

  async function removeRule(id: string) {
    await api.deleteRule(id);
    await refresh();
  }

  async function scrapeNow(id: string) {
    setScrapeStatus((s) => ({ ...s, [id]: "working…" }));
    try {
      const count = await api.refillRuleTargets(id);
      setScrapeStatus((s) => ({ ...s, [id]: `+${count} targets` }));
      await refresh();
    } catch (err) {
      setScrapeStatus((s) => ({ ...s, [id]: `error: ${err}` }));
    }
  }

  function toggleSelected(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((s) => (s.size === rules.length ? new Set() : new Set(rules.map((r) => r.id))));
  }

  async function bulkSetEnabled(enabled: boolean) {
    await Promise.all(Array.from(selected).map((id) => api.setRuleEnabled(id, enabled)));
    setSelected(new Set());
    await refresh();
  }

  async function bulkDelete() {
    await Promise.all(Array.from(selected).map((id) => api.deleteRule(id)));
    setSelected(new Set());
    await refresh();
  }

  return (
    <div className="rules-panel">
      <h4>Action Rules</h4>
      {error && <p className="error">{error}</p>}

      {selected.size > 0 && (
        <BulkToolbar count={selected.size}>
          <button type="button" onClick={() => bulkSetEnabled(true)}>
            Enable
          </button>
          <button type="button" onClick={() => bulkSetEnabled(false)}>
            Disable
          </button>
          <button type="button" className="danger" onClick={bulkDelete}>
            Delete
          </button>
        </BulkToolbar>
      )}

      <table className="mini-table">
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                checked={rules.length > 0 && selected.size === rules.length}
                onChange={toggleSelectAll}
              />
            </th>
            <th>Action</th>
            <th>Daily limit</th>
            <th>Delay (s)</th>
            <th>Source</th>
            <th>Targets</th>
            <th>Health</th>
            <th>Enabled</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => {
            const cooling = rule.backoff_until && new Date(rule.backoff_until) > new Date();
            return (
              <tr key={rule.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(rule.id)}
                    onChange={() => toggleSelected(rule.id)}
                  />
                </td>
                <td>{rule.action_type}</td>
                <td>{rule.daily_limit}/day</td>
                <td>
                  {rule.min_delay_sec}-{rule.max_delay_sec}
                </td>
                <td>
                  {rule.source_type === "explicit" ? (
                    "manual list"
                  ) : rule.source_type === "non_followbacks" ? (
                    <>
                      non-followbacks &gt;{rule.source_seed}d
                      <button type="button" className="ghost" onClick={() => scrapeNow(rule.id)}>
                        Check Now
                      </button>
                      {scrapeStatus[rule.id] && <div className="hint">{scrapeStatus[rule.id]}</div>}
                    </>
                  ) : (
                    <>
                      {rule.source_type === "hashtag" ? "#" : "@"}
                      {rule.source_seed}
                      <button type="button" className="ghost" onClick={() => scrapeNow(rule.id)}>
                        Scrape Now
                      </button>
                      {scrapeStatus[rule.id] && <div className="hint">{scrapeStatus[rule.id]}</div>}
                    </>
                  )}
                </td>
                <td>
                  {rule.target_source.length} (cursor {rule.target_cursor})
                </td>
                <td>
                  {cooling ? (
                    <span className="hint">cooling down · {rule.consecutive_errors} errors</span>
                  ) : rule.consecutive_errors > 0 ? (
                    <span className="hint">{rule.consecutive_errors} recent errors</span>
                  ) : (
                    <span className="hint">ok</span>
                  )}
                </td>
                <td>
                  <input type="checkbox" checked={rule.enabled} onChange={() => toggleRule(rule)} />
                </td>
                <td>
                  {rule.action_type === "dm_sequence" && (
                    <button type="button" className="ghost" onClick={() => openProgress(rule)}>
                      View Progress
                    </button>
                  )}
                  <button type="button" className="danger" onClick={() => removeRule(rule.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
          {!loading && rules.length === 0 && (
            <tr>
              <td className="empty" colSpan={9}>
                No rules yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <RuleForm
        platforms={[platform]}
        onSubmit={async (payload) => {
          await api.createRule({ ...payload, profile_id: profileId });
          await refresh();
        }}
      />

      {progressRule && (
        <Modal title="DM Sequence Progress" onClose={() => setProgressRule(null)}>
          <table className="mini-table">
            <thead>
              <tr>
                <th>Target</th>
                <th>Step</th>
                <th>Status</th>
                <th>Next send</th>
              </tr>
            </thead>
            <tbody>
              {progress.map((p) => (
                <tr key={p.id}>
                  <td>{p.target}</td>
                  <td>{p.current_step + 1}</td>
                  <td>{p.status}</td>
                  <td>{p.status === "active" ? new Date(p.next_send_at).toLocaleString() : "—"}</td>
                </tr>
              ))}
              {progress.length === 0 && (
                <tr>
                  <td className="empty" colSpan={4}>
                    No targets enrolled yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}
