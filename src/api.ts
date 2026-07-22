import { invoke } from "@tauri-apps/api/core";

export type Platform = "instagram" | "twitter" | "facebook";
export type ActionType =
  | "follow"
  | "unfollow"
  | "like"
  | "unlike"
  | "comment"
  | "dm"
  | "save"
  | "view_story"
  | "retweet"
  | "unretweet";

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
  group_id: string | null;
  device_name: string;
  device_id: string;
  has_password: boolean;
  created_at: string;
  updated_at: string;
};

export type NewProfile = {
  platform: Platform;
  display_name: string;
  username: string;
  proxy_id: string | null;
  device_name: string;
};

export type ProfileGroup = {
  id: string;
  name: string;
  description: string;
  created_at: string;
};

export type NewProfileGroup = {
  name: string;
  description: string;
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

export type SourceType = "explicit" | "hashtag" | "followers_of" | "non_followbacks";

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
  source_type: SourceType;
  source_seed: string;
  consecutive_errors: number;
  backoff_until: string | null;
  dm_message: string;
  filter_skip_no_avatar: boolean;
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
  source_type: SourceType;
  source_seed: string;
  dm_message: string;
  filter_skip_no_avatar: boolean;
};

export type PostMetrics = {
  likes: number | null;
  comments: number | null;
  shares: number | null;
  views: number | null;
  bookmarks: number | null;
};

export type MonitoredPost = {
  id: string;
  platform: Platform;
  url: string;
  label: string;
  viewer_profile_id: string;
  created_at: string;
};

export type NewMonitoredPost = {
  platform: Platform;
  url: string;
  label: string;
  viewer_profile_id: string;
};

export type MonitoredPostSnapshot = PostMetrics & {
  id: string;
  monitored_post_id: string;
  captured_at: string;
};

export type AppSettings = {
  scheduler_tick_secs: number;
  monitor_refresh_mins: number;
  backoff_base_mins: number;
  backoff_cap_hours: number;
  warmup_enabled: boolean;
};

export type BlacklistEntry = {
  id: string;
  profile_id: string | null;
  username: string;
  created_at: string;
};

export type Campaign = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
};

export type NewCampaign = {
  name: string;
  description: string;
  tags: string[];
};

export type CampaignRule = {
  id: string;
  campaign_id: string;
  action_type: ActionType;
  daily_limit: number;
  min_delay_sec: number;
  max_delay_sec: number;
  target_source: string[];
  comment_pool: string[];
  source_type: SourceType;
  source_seed: string;
  dm_message: string;
  filter_skip_no_avatar: boolean;
  created_at: string;
};

export type NewCampaignRule = {
  campaign_id: string;
  action_type: ActionType;
  daily_limit: number;
  min_delay_sec: number;
  max_delay_sec: number;
  target_source: string[];
  comment_pool: string[];
  source_type: SourceType;
  source_seed: string;
  dm_message: string;
  filter_skip_no_avatar: boolean;
};

export type EnrollResult = {
  enrolled: number;
  skipped: string[];
};

export type CampaignRuleState = {
  id: string;
  campaign_rule_id: string;
  profile_id: string;
  enabled: boolean;
  target_cursor: number;
  consecutive_errors: number;
  backoff_until: string | null;
  created_at: string;
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
  setProfileDeviceName: (id: string, deviceName: string) =>
    invoke<void>("set_profile_device_name_cmd", { id, deviceName }),
  regenerateDeviceId: (id: string) => invoke<string>("regenerate_device_id_cmd", { id }),
  setProfilePassword: (id: string, password: string) =>
    invoke<void>("set_profile_password_cmd", { id, password }),
  clearProfilePassword: (id: string) => invoke<void>("clear_profile_password_cmd", { id }),
  autoLogin: (profileId: string) => invoke<void>("auto_login_cmd", { profileId }),
  importCookies: (profileId: string, cookiesJson: string) =>
    invoke<void>("import_cookies_cmd", { profileId, cookiesJson }),

  listProxies: () => invoke<Proxy[]>("list_proxies_cmd"),
  createProxy: (newProxy: NewProxy) => invoke<Proxy>("create_proxy_cmd", { newProxy }),
  deleteProxy: (id: string) => invoke<void>("delete_proxy_cmd", { id }),

  listRules: (profileId: string) => invoke<ActionRule[]>("list_rules_cmd", { profileId }),
  createRule: (newRule: NewActionRule) => invoke<ActionRule>("create_rule_cmd", { newRule }),
  setRuleEnabled: (id: string, enabled: boolean) =>
    invoke<void>("set_rule_enabled_cmd", { id, enabled }),
  deleteRule: (id: string) => invoke<void>("delete_rule_cmd", { id }),
  refillRuleTargets: (ruleId: string) => invoke<number>("refill_rule_targets_cmd", { ruleId }),

  listLogs: (limit: number) => invoke<ActionLogEntry[]>("list_logs_cmd", { limit }),

  listBlacklist: () => invoke<BlacklistEntry[]>("list_blacklist_cmd"),
  addBlacklistEntry: (profileId: string | null, username: string) =>
    invoke<BlacklistEntry>("add_blacklist_entry_cmd", { profileId, username }),
  removeBlacklistEntry: (id: string) => invoke<void>("remove_blacklist_entry_cmd", { id }),

  listProfileGroups: () => invoke<ProfileGroup[]>("list_profile_groups_cmd"),
  createProfileGroup: (newGroup: NewProfileGroup) =>
    invoke<ProfileGroup>("create_profile_group_cmd", { newGroup }),
  deleteProfileGroup: (id: string) => invoke<void>("delete_profile_group_cmd", { id }),
  setProfileGroup: (id: string, groupId: string | null) =>
    invoke<void>("set_profile_group_cmd", { id, groupId }),

  listCampaigns: () => invoke<Campaign[]>("list_campaigns_cmd"),
  createCampaign: (newCampaign: NewCampaign) => invoke<Campaign>("create_campaign_cmd", { newCampaign }),
  deleteCampaign: (id: string) => invoke<void>("delete_campaign_cmd", { id }),

  listCampaignRules: (campaignId: string) =>
    invoke<CampaignRule[]>("list_campaign_rules_cmd", { campaignId }),
  createCampaignRule: (newRule: NewCampaignRule) =>
    invoke<CampaignRule>("create_campaign_rule_cmd", { newRule }),
  deleteCampaignRule: (id: string) => invoke<void>("delete_campaign_rule_cmd", { id }),
  listCampaignRuleStates: (campaignRuleId: string) =>
    invoke<CampaignRuleState[]>("list_campaign_rule_states_cmd", { campaignRuleId }),

  setCampaignEnabled: (id: string, enabled: boolean) =>
    invoke<void>("set_campaign_enabled_cmd", { id, enabled }),
  resetCampaign: (id: string) => invoke<void>("reset_campaign_cmd", { id }),
  retryFailedCampaign: (id: string) => invoke<void>("retry_failed_campaign_cmd", { id }),
  listEnrolledProfiles: (campaignId: string) =>
    invoke<string[]>("list_enrolled_profiles_cmd", { campaignId }),
  enrollProfiles: (campaignId: string, profileIds: string[]) =>
    invoke<EnrollResult>("enroll_profiles_cmd", { campaignId, profileIds }),
  unenrollProfile: (campaignId: string, profileId: string) =>
    invoke<void>("unenroll_profile_cmd", { campaignId, profileId }),

  listMonitoredPosts: () => invoke<MonitoredPost[]>("list_monitored_posts_cmd"),
  createMonitoredPost: (newPost: NewMonitoredPost) =>
    invoke<MonitoredPost>("create_monitored_post_cmd", { newPost }),
  deleteMonitoredPost: (id: string) => invoke<void>("delete_monitored_post_cmd", { id }),
  listPostSnapshots: (monitoredPostId: string, limit: number) =>
    invoke<MonitoredPostSnapshot[]>("list_post_snapshots_cmd", { monitoredPostId, limit }),
  scrapePostNow: (monitoredPostId: string) => invoke<PostMetrics>("scrape_post_now_cmd", { monitoredPostId }),

  hasMasterPassword: () => invoke<boolean>("has_master_password_cmd"),
  setMasterPassword: (password: string) => invoke<void>("set_master_password_cmd", { password }),
  verifyMasterPassword: (password: string) => invoke<boolean>("verify_master_password_cmd", { password }),

  getSettings: () => invoke<AppSettings>("get_settings_cmd"),
  saveSettings: (settings: AppSettings) => invoke<void>("save_settings_cmd", { settings }),
  clearOldLogs: (days: number) => invoke<number>("clear_old_logs_cmd", { days }),
  getAppDataDir: () => invoke<string>("get_app_data_dir_cmd"),
  pingSidecar: () => invoke<{ pong: boolean; ts: number }>("ping_sidecar"),
};
