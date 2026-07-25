import { invoke } from "@tauri-apps/api/core";

export type Platform = "instagram" | "twitter" | "facebook" | "tiktok" | "linkedin" | "youtube";
export type ActionType =
  | "follow"
  | "unfollow"
  | "like"
  | "unlike"
  | "comment"
  | "dm"
  | "save"
  | "view_story"
  | "react_story"
  | "reply_comment"
  | "dm_sequence"
  | "retweet"
  | "unretweet"
  | "block"
  | "mute"
  | "watch_video";

export type DmSequenceStep = {
  order: number;
  delay_hours: number;
  message: string;
};

export type DmSequenceProgress = {
  id: string;
  rule_id: string;
  target: string;
  current_step: number;
  status: string;
  next_send_at: string;
  started_at: string;
  updated_at: string;
};

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
  enabled: boolean;
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
  reaction_type: string;
  sequence_steps: DmSequenceStep[];
  active_hours_start: number;
  active_hours_end: number;
  active_days: number[];
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
  reaction_type: string;
  sequence_steps: DmSequenceStep[];
  active_hours_start: number;
  active_hours_end: number;
  active_days: number[];
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

export type CommentReplyRule = {
  id: string;
  monitored_post_id: string;
  enabled: boolean;
  daily_limit: number;
  min_delay_sec: number;
  max_delay_sec: number;
  reply_pool: string[];
  consecutive_errors: number;
  backoff_until: string | null;
  last_checked_at: string | null;
  created_at: string;
};

export type NewCommentReplyRule = {
  monitored_post_id: string;
  daily_limit: number;
  min_delay_sec: number;
  max_delay_sec: number;
  reply_pool: string[];
};

export type AppSettings = {
  scheduler_tick_secs: number;
  monitor_refresh_mins: number;
  backoff_base_mins: number;
  backoff_cap_hours: number;
  warmup_enabled: boolean;
  max_pending_follows: number;
};

export type ProfileStat = {
  id: string;
  profile_id: string;
  followers: number | null;
  following: number | null;
  posts: number | null;
  captured_at: string;
};

export type WelcomeDmConfig = {
  profile_id: string;
  enabled: boolean;
  message_pool: string[];
  daily_limit: number;
  min_delay_sec: number;
  max_delay_sec: number;
  last_scan_at: string | null;
  seeded: boolean;
};

export type NewWelcomeDmConfig = {
  profile_id: string;
  enabled: boolean;
  message_pool: string[];
  daily_limit: number;
  min_delay_sec: number;
  max_delay_sec: number;
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
  reaction_type: string;
  active_hours_start: number;
  active_hours_end: number;
  active_days: number[];
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
  reaction_type: string;
  active_hours_start: number;
  active_hours_end: number;
  active_days: number[];
};

export type EnrollResult = {
  enrolled: number;
  skipped: string[];
};

export type ImportSummary = {
  proxies: number;
  groups: number;
  profiles: number;
  rules: number;
  campaigns: number;
  campaign_rules: number;
  pods: number;
  pod_members: number;
  blacklist: number;
  settings_imported: boolean;
};

export type ProfilesImportSummary = { profiles: number; rules: number };
export type CampaignsImportSummary = { campaigns: number; campaign_rules: number };
export type PodsImportSummary = { pods: number; pod_members: number };
export type ProxiesImportSummary = { proxies: number };
export type BlacklistImportSummary = { blacklist: number };

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

export type Pod = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  window_hours: number;
  daily_limit_per_member: number;
  min_delay_sec: number;
  max_delay_sec: number;
  actions: string[];
  comment_pool: string[];
  created_at: string;
};

export type NewPod = {
  name: string;
  description: string;
  window_hours: number;
  daily_limit_per_member: number;
  min_delay_sec: number;
  max_delay_sec: number;
  actions: string[];
  comment_pool: string[];
};

export type PodMember = {
  id: string;
  pod_id: string;
  profile_id: string;
  enabled: boolean;
  last_checked_at: string | null;
  created_at: string;
};

export type PodPost = {
  id: string;
  pod_id: string;
  member_profile_id: string;
  post_url: string;
  detected_at: string;
  expires_at: string;
};

export type PodEngagement = {
  id: string;
  pod_post_id: string;
  acting_profile_id: string;
  action_type: string;
  status: string;
  executed_at: string;
};

export const api = {
  listProfiles: () => invoke<Profile[]>("list_profiles_cmd"),
  createProfile: (newProfile: NewProfile, password?: string) =>
    invoke<Profile>("create_profile_cmd", { newProfile, password: password || null }),
  deleteProfile: (id: string) => invoke<void>("delete_profile_cmd", { id }),
  setProfileProxy: (id: string, proxyId: string | null) =>
    invoke<void>("set_profile_proxy_cmd", { id, proxyId }),
  setProfileEnabled: (id: string, enabled: boolean) =>
    invoke<void>("set_profile_enabled_cmd", { id, enabled }),
  duplicateProfile: (id: string) => invoke<Profile>("duplicate_profile_cmd", { id }),
  listProfileStats: (profileId: string, limit: number) =>
    invoke<ProfileStat[]>("list_profile_stats_cmd", { profileId, limit }),
  getWelcomeDmConfig: (profileId: string) =>
    invoke<WelcomeDmConfig | null>("get_welcome_dm_config_cmd", { profileId }),
  upsertWelcomeDmConfig: (config: NewWelcomeDmConfig) =>
    invoke<WelcomeDmConfig>("upsert_welcome_dm_config_cmd", { config }),
  captureLogin: (profileId: string) => invoke<void>("capture_login_cmd", { profileId }),
  setProfileDisplayName: (id: string, displayName: string) =>
    invoke<void>("set_profile_display_name_cmd", { id, displayName }),
  setProfileUsername: (id: string, username: string) =>
    invoke<void>("set_profile_username_cmd", { id, username }),
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
  scrapeExport: (profileId: string, sourceType: string, seed: string, limit: number, skipNoAvatar: boolean) =>
    invoke<string[]>("scrape_export_cmd", { profileId, sourceType, seed, limit, skipNoAvatar }),
  writeTextFile: (path: string, content: string) => invoke<void>("write_text_file_cmd", { path, content }),
  listDmSequenceProgress: (ruleId: string) =>
    invoke<DmSequenceProgress[]>("list_dm_sequence_progress_cmd", { ruleId }),

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

  getReplyRule: (monitoredPostId: string) =>
    invoke<CommentReplyRule | null>("get_reply_rule_cmd", { monitoredPostId }),
  upsertReplyRule: (newRule: NewCommentReplyRule) =>
    invoke<CommentReplyRule>("upsert_reply_rule_cmd", { newRule }),
  setReplyRuleEnabled: (id: string, enabled: boolean) =>
    invoke<void>("set_reply_rule_enabled_cmd", { id, enabled }),
  deleteReplyRule: (id: string) => invoke<void>("delete_reply_rule_cmd", { id }),

  listPods: () => invoke<Pod[]>("list_pods_cmd"),
  createPod: (newPod: NewPod) => invoke<Pod>("create_pod_cmd", { newPod }),
  setPodEnabled: (id: string, enabled: boolean) => invoke<void>("set_pod_enabled_cmd", { id, enabled }),
  deletePod: (id: string) => invoke<void>("delete_pod_cmd", { id }),
  listPodMembers: (podId: string) => invoke<PodMember[]>("list_pod_members_cmd", { podId }),
  addPodMember: (podId: string, profileId: string) =>
    invoke<PodMember>("add_pod_member_cmd", { podId, profileId }),
  removePodMember: (podId: string, profileId: string) =>
    invoke<void>("remove_pod_member_cmd", { podId, profileId }),
  listPodPosts: (podId: string, limit: number) => invoke<PodPost[]>("list_pod_posts_cmd", { podId, limit }),
  listPodEngagements: (podPostId: string) =>
    invoke<PodEngagement[]>("list_pod_engagements_cmd", { podPostId }),

  hasMasterPassword: () => invoke<boolean>("has_master_password_cmd"),
  setMasterPassword: (password: string) => invoke<void>("set_master_password_cmd", { password }),
  verifyMasterPassword: (password: string) => invoke<boolean>("verify_master_password_cmd", { password }),

  getSettings: () => invoke<AppSettings>("get_settings_cmd"),
  saveSettings: (settings: AppSettings) => invoke<void>("save_settings_cmd", { settings }),
  clearOldLogs: (days: number) => invoke<number>("clear_old_logs_cmd", { days }),
  getAppDataDir: () => invoke<string>("get_app_data_dir_cmd"),
  pingSidecar: () => invoke<{ pong: boolean; ts: number }>("ping_sidecar"),

  exportBackup: (path: string) => invoke<void>("export_backup_cmd", { path }),
  importBackup: (path: string, includeSettings: boolean) =>
    invoke<ImportSummary>("import_backup_cmd", { path, includeSettings }),

  exportProfilesBackup: (path: string) => invoke<void>("export_profiles_backup_cmd", { path }),
  importProfilesBackup: (path: string) =>
    invoke<ProfilesImportSummary>("import_profiles_backup_cmd", { path }),
  exportCampaignsBackup: (path: string) => invoke<void>("export_campaigns_backup_cmd", { path }),
  importCampaignsBackup: (path: string) =>
    invoke<CampaignsImportSummary>("import_campaigns_backup_cmd", { path }),
  exportPodsBackup: (path: string) => invoke<void>("export_pods_backup_cmd", { path }),
  importPodsBackup: (path: string) => invoke<PodsImportSummary>("import_pods_backup_cmd", { path }),
  exportProxiesBackup: (path: string) => invoke<void>("export_proxies_backup_cmd", { path }),
  importProxiesBackup: (path: string) =>
    invoke<ProxiesImportSummary>("import_proxies_backup_cmd", { path }),
  exportBlacklistBackup: (path: string) => invoke<void>("export_blacklist_backup_cmd", { path }),
  importBlacklistBackup: (path: string) =>
    invoke<BlacklistImportSummary>("import_blacklist_backup_cmd", { path }),
};
