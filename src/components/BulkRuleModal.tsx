import { useState } from "react";
import { api, Profile } from "../api";
import { Modal } from "./Modal";
import { ACTIONS_BY_PLATFORM, RuleForm, type RuleFormPayload } from "./RuleForm";

export function BulkRuleModal({ profiles, onClose, onDone }: { profiles: Profile[]; onClose: () => void; onDone: () => void }) {
  const [result, setResult] = useState<{ created: number; skipped: string[] } | null>(null);

  const platforms = Array.from(new Set(profiles.map((p) => p.platform)));

  async function handleSubmit(payload: RuleFormPayload) {
    let created = 0;
    const skipped: string[] = [];

    for (const profile of profiles) {
      if (!ACTIONS_BY_PLATFORM[profile.platform].includes(payload.action_type)) {
        skipped.push(`${profile.display_name}: '${payload.action_type}' not supported on ${profile.platform}`);
        continue;
      }
      try {
        await api.createRule({ ...payload, profile_id: profile.id });
        created += 1;
      } catch (err) {
        skipped.push(`${profile.display_name}: ${err}`);
      }
    }

    setResult({ created, skipped });
    onDone();
  }

  return (
    <Modal title={`Create Rule for ${profiles.length} Profiles`} onClose={onClose} wide>
      <p className="hint">
        One rule is created per selected profile, skipping any profile whose platform doesn't
        support the chosen action.
      </p>
      <RuleForm platforms={platforms} onSubmit={handleSubmit} submitLabel="Create Rule for Selected" />
      {result && (
        <div className="hint">
          Created {result.created} rule(s).
          {result.skipped.length > 0 && (
            <ul>
              {result.skipped.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
