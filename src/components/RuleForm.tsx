import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ActionType, DmSequenceStep, NewActionRule, Platform, SourceType } from "../api";

export const ACTIONS_BY_PLATFORM: Record<Platform, ActionType[]> = {
  instagram: ["follow", "unfollow", "like", "unlike", "comment", "save", "view_story", "react_story", "dm", "dm_sequence"],
  twitter: ["follow", "unfollow", "like", "unlike", "comment", "retweet", "unretweet", "dm", "dm_sequence"],
  facebook: ["follow", "unfollow", "like", "unlike", "comment", "dm", "dm_sequence"],
  tiktok: ["follow", "unfollow", "like", "unlike", "comment", "save", "view_story", "react_story", "dm", "dm_sequence"],
  linkedin: ["follow", "unfollow", "like", "unlike", "comment", "dm", "dm_sequence"],
  youtube: ["follow", "unfollow", "like", "unlike", "comment", "view_story", "react_story", "dm", "dm_sequence"],
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
  dm_sequence: { sources: ["followers_of"], targetKind: "username" },
  reply_comment: { sources: [], targetKind: "url" },
  retweet: { sources: ["hashtag"], targetKind: "url" },
  unretweet: { sources: [], targetKind: "url" },
};

const SOURCE_LABEL: Record<SourceType, string> = {
  explicit: "Explicit list",
  hashtag: "Hashtag",
  followers_of: "Followers of…",
  non_followbacks: "Non-follow-backs (smart unfollow)",
};

export type RuleFormPayload = Omit<NewActionRule, "profile_id">;

const WEEKDAYS: { day: number; label: string }[] = [
  { day: 1, label: "Mon" },
  { day: 2, label: "Tue" },
  { day: 3, label: "Wed" },
  { day: 4, label: "Thu" },
  { day: 5, label: "Fri" },
  { day: 6, label: "Sat" },
  { day: 7, label: "Sun" },
];

export function RuleForm({
  platforms,
  onSubmit,
  submitLabel = "Add Rule",
}: {
  platforms: Platform[];
  onSubmit: (payload: RuleFormPayload) => Promise<void> | void;
  submitLabel?: string;
}) {
  const availableActions = Array.from(new Set(platforms.flatMap((p) => ACTIONS_BY_PLATFORM[p])));
  const [error, setError] = useState("");
  const targetsFileRef = useRef<HTMLInputElement>(null);

  const [actionType, setActionType] = useState<ActionType>(availableActions[0]);
  const [dailyLimit, setDailyLimit] = useState(20);
  const [minDelay, setMinDelay] = useState(120);
  const [maxDelay, setMaxDelay] = useState(600);
  const [targets, setTargets] = useState("");
  const [comments, setComments] = useState("");
  const [dmMessage, setDmMessage] = useState("");
  const [reactionType, setReactionType] = useState("like");
  const [sequenceSteps, setSequenceSteps] = useState<DmSequenceStep[]>([{ order: 0, delay_hours: 0, message: "" }]);
  const [sourceType, setSourceType] = useState<SourceType>("explicit");
  const [sourceSeed, setSourceSeed] = useState("");
  const [daysThreshold, setDaysThreshold] = useState(3);
  const [skipNoAvatar, setSkipNoAvatar] = useState(false);

  const [scheduled, setScheduled] = useState(false);
  const [hoursStart, setHoursStart] = useState(9);
  const [hoursEnd, setHoursEnd] = useState(23);
  const [activeDays, setActiveDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);

  function toggleDay(day: number) {
    setActiveDays((d) => (d.includes(day) ? d.filter((x) => x !== day) : [...d, day].sort()));
  }

  function addStep() {
    setSequenceSteps((steps) => [...steps, { order: steps.length, delay_hours: 24, message: "" }]);
  }

  function updateStep(index: number, patch: Partial<DmSequenceStep>) {
    setSequenceSteps((steps) => steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function removeStep(index: number) {
    setSequenceSteps((steps) => steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i })));
  }

  function onActionTypeChange(next: ActionType) {
    setActionType(next);
    setSourceType("explicit");
  }

  async function loadTargetsFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const lines = (await file.text())
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    setTargets((prev) => (prev ? `${prev}\n${lines.join("\n")}` : lines.join("\n")));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const target_source = targets
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);
    const comment_pool = comments
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);

    const payload: RuleFormPayload = {
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
      sequence_steps: actionType === "dm_sequence" ? sequenceSteps.filter((s) => s.message.trim()) : [],
      active_hours_start: scheduled ? hoursStart : 0,
      active_hours_end: scheduled ? hoursEnd : 24,
      active_days: scheduled ? activeDays : [1, 2, 3, 4, 5, 6, 7],
    };

    try {
      await onSubmit(payload);
      setTargets("");
      setComments("");
      setDmMessage("");
      setSourceSeed("");
      setSequenceSteps([{ order: 0, delay_hours: 0, message: "" }]);
      setError("");
    } catch (err) {
      setError(String(err));
    }
  }

  const meta = ACTION_META[actionType];
  const sourceOptions: SourceType[] = ["explicit", ...meta.sources];

  return (
    <form className="rule-form" onSubmit={submit}>
      {error && <p className="error">{error}</p>}
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
        <>
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
          <button type="button" className="ghost" onClick={() => targetsFileRef.current?.click()}>
            Load from file
          </button>
          <input
            ref={targetsFileRef}
            type="file"
            accept=".csv,.txt"
            style={{ display: "none" }}
            onChange={loadTargetsFile}
          />
        </>
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
      {actionType === "dm_sequence" && (
        <div className="sequence-editor">
          <p className="hint">
            Each target walks these steps in order — a delay in hours after the previous
            step before the next message sends.
          </p>
          {sequenceSteps.map((step, i) => (
            <div className="row" key={i}>
              <span className="hint">Step {i + 1}</span>
              <input
                type="number"
                min={0}
                value={step.delay_hours}
                onChange={(e) => updateStep(i, { delay_hours: Number(e.target.value) })}
                title="delay in hours after previous step"
              />
              <textarea
                placeholder="message template — supports {spintax|variants}"
                value={step.message}
                onChange={(e) => updateStep(i, { message: e.target.value })}
                rows={2}
              />
              {sequenceSteps.length > 1 && (
                <button type="button" className="ghost" onClick={() => removeStep(i)}>
                  Remove
                </button>
              )}
            </div>
          ))}
          <button type="button" className="ghost" onClick={addStep}>
            + Add Step
          </button>
        </div>
      )}

      <div className="schedule-editor">
        <label className="hint">
          <input type="checkbox" checked={scheduled} onChange={(e) => setScheduled(e.target.checked)} />{" "}
          Restrict to a schedule (working hours + weekdays)
        </label>
        {scheduled && (
          <>
            <div className="row">
              <label className="hint">
                Active from hour
                <br />
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={hoursStart}
                  onChange={(e) => setHoursStart(Number(e.target.value))}
                />
              </label>
              <label className="hint">
                to hour (exclusive, 24 = midnight)
                <br />
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={hoursEnd}
                  onChange={(e) => setHoursEnd(Number(e.target.value))}
                />
              </label>
            </div>
            <div className="row">
              {WEEKDAYS.map((w) => (
                <label className="hint" key={w.day}>
                  <input
                    type="checkbox"
                    checked={activeDays.includes(w.day)}
                    onChange={() => toggleDay(w.day)}
                  />{" "}
                  {w.label}
                </label>
              ))}
            </div>
            <p className="hint">Uses this machine's local time. Outside the window the rule sleeps.</p>
          </>
        )}
      </div>

      <button type="submit" className="primary">
        {submitLabel}
      </button>
    </form>
  );
}
