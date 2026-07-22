import { invoke } from "@tauri-apps/api/core";

export type Platform = "instagram" | "twitter";
export type ActionType = "follow" | "unfollow" | "like" | "comment";

export type Profile = {
  id: string;
  platform: Platform;
  display_name: string;
  username: string;
  proxy_id: string | null;
  timezone: string;
  locale: string;
  user_agent: string;
  viewport_width: number;
  viewport_height: number;
  storage_state_enc_path: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type NewProfile = {
  platform: Platform;
  display_name: string;
  username: string;
  proxy_id: string | null;
};

export type Proxy = {
  id: string;
  label: string;
  protocol: string;
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  created_at: string;
};

export type NewProxy = {
  label: string;
  protocol: string;
  host: string;
  port: number;
  username: string | null;
  password: string | null;
};

export type ActionRule = {
  id: string;
  profile_id: string;
  action_type: ActionType;
  enabled: boolean;
  daily_limit: number;
  min_delay_sec: number;
  max_delay_sec: number;
  target_source: string[];
  target_cursor: number;
  comment_pool: string[];
  created_at: string;
};

export type NewActionRule = {
  profile_id: string;
  action_type: ActionType;
  daily_limit: number;
  min_delay_sec: number;
  max_delay_sec: number;
  target_source: string[];
  comment_pool: string[];
};

export type ActionLogEntry = {
  id: string;
  profile_id: string;
  action_type: ActionType;
  target: string;
  status: string;
  message: string | null;
  executed_at: string;
};

export const api = {
  listProfiles: () => invoke<Profile[]>("list_profiles_cmd"),
  createProfile: (newProfile: NewProfile) => invoke<Profile>("create_profile_cmd", { newProfile }),
  deleteProfile: (id: string) => invoke<void>("delete_profile_cmd", { id }),
  setProfileProxy: (id: string, proxyId: string | null) =>
    invoke<void>("set_profile_proxy_cmd", { id, proxyId }),
  captureLogin: (profileId: string) => invoke<void>("capture_login_cmd", { profileId }),

  listProxies: () => invoke<Proxy[]>("list_proxies_cmd"),
  createProxy: (newProxy: NewProxy) => invoke<Proxy>("create_proxy_cmd", { newProxy }),
  deleteProxy: (id: string) => invoke<void>("delete_proxy_cmd", { id }),

  listRules: (profileId: string) => invoke<ActionRule[]>("list_rules_cmd", { profileId }),
  createRule: (newRule: NewActionRule) => invoke<ActionRule>("create_rule_cmd", { newRule }),
  setRuleEnabled: (id: string, enabled: boolean) =>
    invoke<void>("set_rule_enabled_cmd", { id, enabled }),
  deleteRule: (id: string) => invoke<void>("delete_rule_cmd", { id }),

  listLogs: (limit: number) => invoke<ActionLogEntry[]>("list_logs_cmd", { limit }),
};
