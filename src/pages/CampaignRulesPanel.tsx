import { useEffect, useState, type FormEvent } from "react";
import { api, ActionType, CampaignRule, SourceType } from "../api";

const ALL_ACTIONS: ActionType[] = [
  "follow",
  "unfollow",
  "like",
  "unlike",
  "comment",
  "dm",
  "save",
  "view_story",
  "react_story",
  "retweet",
  "unretweet",
];

const SOURCE_LABEL: Record<SourceType, string> = {
  explicit: "Explicit list",
  hashtag: "Hashtag",
  followers_of: "Followers of…",
  non_followbacks: "Non-follow-backs (smart unfollow)",
};

export function CampaignRulesPanel({ campaignId }: { campaignId: string }) {
  const [rules, setRules] = useState<CampaignRule[]>([]);
  const [error, setError] = useState("");

  const [actionType, setActionType] = useState<ActionType>("follow");
  const [dailyLimit, setDailyLimit] = useState(20);
  const [minDelay, setMinDelay] = useState(120);
  const [maxDelay, setMaxDelay] = useState(600);
  const [targets, setTargets] = useState("");
  const [comments, setComments] = useState("");
  const [dmMessage, setDmMessage] = useState("");
  const [reactionType, setReactionType] = useState("like");
  const [sourceType, setSourceType] = useState<SourceType>("explicit");
  const [sourceSeed, setSourceSeed] = useState("");
  const [skipNoAvatar, setSkipNoAvatar] = useState(false);

  async function refresh() {
    try {
      setRules(await api.listCampaignRules(campaignId));
      setError("");
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

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
      await api.createCampaignRule({
        campaign_id: campaignId,
        action_type: actionType,
        daily_limit: dailyLimit,
        min_delay_sec: minDelay,
        max_delay_sec: maxDelay,
        target_source,
        comment_pool,
        source_type: sourceType,
        source_seed: sourceSeed,
        dm_message: dmMessage,
        filter_skip_no_avatar: skipNoAvatar,
        reaction_type: reactionType,
        active_hours_start: 0,
        active_hours_end: 24,
        active_days: [1, 2, 3, 4, 5, 6, 7],
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

  async function removeRule(id: string) {
    await api.deleteCampaignRule(id);
    await refresh();
  }

  return (
    <div className="rules-panel">
      <h4>Template Rules</h4>
      <p className="hint">
        Rules here are a blueprint only — nothing runs until you apply this campaign to profiles below.
        An action not supported by a profile's platform (e.g. "retweet" on Instagram) is skipped for that
        profile when applied.
      </p>
      {error && <p className="error">{error}</p>}

      <table className="mini-table">
        <thead>
          <tr>
            <th>Action</th>
            <th>Daily limit</th>
            <th>Delay (s)</th>
            <th>Source</th>
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
              <td>
                {rule.source_type === "explicit"
                  ? `manual list (${rule.target_source.length})`
                  : `${SOURCE_LABEL[rule.source_type]}: ${rule.source_seed}`}
              </td>
              <td>
                <button type="button" className="danger" onClick={() => removeRule(rule.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {rules.length === 0 && (
            <tr>
              <td className="empty" colSpan={5}>
                No template rules yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <form className="rule-form" onSubmit={addRule}>
        <select value={actionType} onChange={(e) => setActionType(e.target.value as ActionType)}>
          {ALL_ACTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={sourceType} onChange={(e) => setSourceType(e.target.value as SourceType)}>
          {(Object.keys(SOURCE_LABEL) as SourceType[]).map((s) => (
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
            placeholder="targets, one per line (usernames or post/tweet URLs)"
            value={targets}
            onChange={(e) => setTargets(e.target.value)}
            rows={3}
          />
        )}
        {(sourceType === "hashtag" || sourceType === "followers_of") && (
          <input
            placeholder={sourceType === "hashtag" ? "hashtag, e.g. travel" : "seed username"}
            value={sourceSeed}
            onChange={(e) => setSourceSeed(e.target.value)}
          />
        )}
        {sourceType === "non_followbacks" && (
          <input
            placeholder="days threshold, e.g. 3"
            value={sourceSeed}
            onChange={(e) => setSourceSeed(e.target.value)}
          />
        )}
        {sourceType === "followers_of" && (
          <label className="hint">
            <input
              type="checkbox"
              checked={skipNoAvatar}
              onChange={(e) => setSkipNoAvatar(e.target.checked)}
            />{" "}
            skip accounts with no profile picture
          </label>
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
          Add Template Rule
        </button>
      </form>
    </div>
  );
}
