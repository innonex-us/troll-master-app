import { useEffect, useState, type FormEvent } from "react";
import { api, ActionRule, ActionType } from "../api";

const ACTION_TYPES: ActionType[] = ["follow", "unfollow", "like", "comment"];

export function RulesPanel({ profileId }: { profileId: string }) {
  const [rules, setRules] = useState<ActionRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [actionType, setActionType] = useState<ActionType>("follow");
  const [dailyLimit, setDailyLimit] = useState(20);
  const [minDelay, setMinDelay] = useState(120);
  const [maxDelay, setMaxDelay] = useState(600);
  const [targets, setTargets] = useState("");
  const [comments, setComments] = useState("");

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  async function addRule(e: FormEvent) {
    e.preventDefault();
    const target_source = targets
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);
    const comment_pool = comments
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      await api.createRule({
        profile_id: profileId,
        action_type: actionType,
        daily_limit: dailyLimit,
        min_delay_sec: minDelay,
        max_delay_sec: maxDelay,
        target_source,
        comment_pool,
      });
      setTargets("");
      setComments("");
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function toggleRule(rule: ActionRule) {
    await api.setRuleEnabled(rule.id, !rule.enabled);
    await refresh();
  }

  async function removeRule(id: string) {
    await api.deleteRule(id);
    await refresh();
  }

  return (
    <div className="rules-panel">
      <h4>Action Rules</h4>
      {error && <p className="error">{error}</p>}

      <table className="mini-table">
        <thead>
          <tr>
            <th>Action</th>
            <th>Daily limit</th>
            <th>Delay (s)</th>
            <th>Targets</th>
            <th>Cursor</th>
            <th>Enabled</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr key={rule.id}>
              <td>{rule.action_type}</td>
              <td>{rule.daily_limit}/day</td>
              <td>
                {rule.min_delay_sec}-{rule.max_delay_sec}
              </td>
              <td>{rule.target_source.length}</td>
              <td>{rule.target_cursor}</td>
              <td>
                <input type="checkbox" checked={rule.enabled} onChange={() => toggleRule(rule)} />
              </td>
              <td>
                <button type="button" className="danger" onClick={() => removeRule(rule.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {!loading && rules.length === 0 && (
            <tr>
              <td className="empty" colSpan={7}>
                No rules yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <form className="rule-form" onSubmit={addRule}>
        <select value={actionType} onChange={(e) => setActionType(e.target.value as ActionType)}>
          {ACTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          value={dailyLimit}
          onChange={(e) => setDailyLimit(Number(e.target.value))}
          title="daily limit"
        />
        <input
          type="number"
          min={1}
          value={minDelay}
          onChange={(e) => setMinDelay(Number(e.target.value))}
          title="min delay seconds"
        />
        <input
          type="number"
          min={1}
          value={maxDelay}
          onChange={(e) => setMaxDelay(Number(e.target.value))}
          title="max delay seconds"
        />
        <textarea
          placeholder="targets, one per line (username or post/tweet URL)"
          value={targets}
          onChange={(e) => setTargets(e.target.value)}
          rows={3}
        />
        {actionType === "comment" && (
          <textarea
            placeholder="comment pool, one per line"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={2}
          />
        )}
        <button type="submit" className="primary">
          Add Rule
        </button>
      </form>
    </div>
  );
}
