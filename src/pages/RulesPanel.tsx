import { useEffect, useState, type FormEvent } from "react";
import { api, ActionRule, ActionType, Platform, SourceType } from "../api";

const ACTIONS_BY_PLATFORM: Record<Platform, ActionType[]> = {
  instagram: ["follow", "unfollow", "like", "unlike", "comment", "save", "view_story", "react_story", "dm"],
  twitter: ["follow", "unfollow", "like", "unlike", "comment", "retweet", "unretweet", "dm"],
  facebook: ["follow", "unfollow", "like", "unlike", "comment", "dm"],
  tiktok: ["follow", "unfollow", "like", "unlike", "comment", "save", "view_story", "react_story", "dm"],
  linkedin: ["follow", "unfollow", "like", "unlike", "comment", "dm"],
  youtube: ["follow", "unfollow", "like", "unlike", "comment", "view_story", "react_story", "dm"],
};

// which non-explicit source(s) make sense for each action, and whether targets are
// usernames or post/tweet URLs (drives placeholder text + explicit textarea framing)
const ACTION_META: Record<ActionType, { sources: SourceType[]; targetKind: "username" | "url" }> = {
  follow: { sources: ["followers_of"], targetKind: "username" },
  unfollow: { sources: ["non_followbacks"], targetKind: "username" },
  like: { sources: ["hashtag"], targetKind: "url" },
  unlike: { sources: [], targetKind: "url" },
  comment: { sources: ["hashtag"], targetKind: "url" },
  save: { sources: ["hashtag"], targetKind: "url" },
  view_story: { sources: ["followers_of"], targetKind: "username" },
  react_story: { sources: ["followers_of"], targetKind: "username" },
  dm: { sources: ["followers_of"], targetKind: "username" },
  retweet: { sources: ["hashtag"], targetKind: "url" },
  unretweet: { sources: [], targetKind: "url" },
};

const SOURCE_LABEL: Record<SourceType, string> = {
  explicit: "Explicit list",
  hashtag: "Hashtag",
  followers_of: "Followers of…",
  non_followbacks: "Non-follow-backs (smart unfollow)",
};

export function RulesPanel({ profileId, platform }: { profileId: string; platform: Platform }) {
  const [rules, setRules] = useState<ActionRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scrapeStatus, setScrapeStatus] = useState<Record<string, string>>({});

  const availableActions = ACTIONS_BY_PLATFORM[platform];
  const [actionType, setActionType] = useState<ActionType>(availableActions[0]);
  const [dailyLimit, setDailyLimit] = useState(20);
  const [minDelay, setMinDelay] = useState(120);
  const [maxDelay, setMaxDelay] = useState(600);
  const [targets, setTargets] = useState("");
  const [comments, setComments] = useState("");
  const [dmMessage, setDmMessage] = useState("");
  const [reactionType, setReactionType] = useState("like");
  const [sourceType, setSourceType] = useState<SourceType>("explicit");
  const [sourceSeed, setSourceSeed] = useState("");
  const [daysThreshold, setDaysThreshold] = useState(3);
  const [skipNoAvatar, setSkipNoAvatar] = useState(false);

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

  function onActionTypeChange(next: ActionType) {
    setActionType(next);
    setSourceType("explicit");
  }

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
        source_type: sourceType,
        source_seed: sourceType === "non_followbacks" ? String(daysThreshold) : sourceSeed,
        dm_message: dmMessage,
        filter_skip_no_avatar: skipNoAvatar,
        reaction_type: reactionType,
      });
      setTargets("");
      setComments("");
      setDmMessage("");
      setSourceSeed("");
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

  const meta = ACTION_META[actionType];
  const sourceOptions: SourceType[] = ["explicit", ...meta.sources];

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
                  <button type="button" className="danger" onClick={() => removeRule(rule.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
          {!loading && rules.length === 0 && (
            <tr>
              <td className="empty" colSpan={8}>
                No rules yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <form className="rule-form" onSubmit={addRule}>
        <select value={actionType} onChange={(e) => onActionTypeChange(e.target.value as ActionType)}>
          {availableActions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={sourceType} onChange={(e) => setSourceType(e.target.value as SourceType)}>
          {sourceOptions.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABEL[s]}
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

        {sourceType === "explicit" && (
          <textarea
            placeholder={
              meta.targetKind === "username"
                ? "usernames, one per line"
                : "post/tweet URLs, one per line"
            }
            value={targets}
            onChange={(e) => setTargets(e.target.value)}
            rows={3}
          />
        )}
        {(sourceType === "hashtag" || sourceType === "followers_of") && (
          <input
            placeholder={sourceType === "hashtag" ? "hashtag, e.g. travel" : "seed username to source from"}
            value={sourceSeed}
            onChange={(e) => setSourceSeed(e.target.value)}
            required
          />
        )}
        {sourceType === "followers_of" && (
          <label className="hint">
            <input
              type="checkbox"
              checked={skipNoAvatar}
              onChange={(e) => setSkipNoAvatar(e.target.checked)}
            />
            {" "}skip accounts with no profile picture
          </label>
        )}
        {sourceType === "non_followbacks" && (
          <input
            type="number"
            min={1}
            value={daysThreshold}
            onChange={(e) => setDaysThreshold(Number(e.target.value))}
            title="days before considering a non-follow-back"
          />
        )}

        {actionType === "react_story" && (
          <select value={reactionType} onChange={(e) => setReactionType(e.target.value)}>
            <option value="like">Quick-react (like/heart)</option>
            <option value="emoji">Quick-react (emoji)</option>
            <option value="comment">Reply with text</option>
          </select>
        )}
        {(actionType === "comment" || (actionType === "react_story" && reactionType === "comment")) && (
          <textarea
            placeholder="comment pool, one per line — supports {spintax|variants}"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={2}
          />
        )}
        {actionType === "dm" && (
          <textarea
            placeholder="DM message template — supports {spintax|variants}"
            value={dmMessage}
            onChange={(e) => setDmMessage(e.target.value)}
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
