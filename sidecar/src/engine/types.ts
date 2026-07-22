export type ProxyConfig = {
  protocol: string;
  host: string;
  port: number;
  username?: string | null;
  password?: string | null;
};

export type FingerprintConfig = {
  userAgent: string;
  timezone: string;
  locale: string;
  viewportWidth: number;
  viewportHeight: number;
};

export type LoginCaptureParams = {
  profileId: string;
  platform: "instagram" | "twitter" | "facebook";
  proxy?: ProxyConfig | null;
  fingerprint: FingerprintConfig;
  storageStatePlainPath: string;
};

export type AutoLoginParams = LoginCaptureParams & {
  username: string;
  password: string;
};

export type InstagramActionType =
  | "follow"
  | "unfollow"
  | "like"
  | "unlike"
  | "comment"
  | "dm"
  | "save"
  | "view_story";

export type TwitterActionType =
  | "follow"
  | "unfollow"
  | "like"
  | "unlike"
  | "comment"
  | "dm"
  | "retweet"
  | "unretweet";

export type FacebookActionType = "follow" | "unfollow" | "like" | "unlike" | "comment" | "dm";

export type ActionRunParams = {
  profileId: string;
  platform: "instagram" | "twitter" | "facebook";
  actionType: InstagramActionType | TwitterActionType | FacebookActionType;
  target: string;
  proxy?: ProxyConfig | null;
  fingerprint: FingerprintConfig;
  storageStatePlainPath: string;
  commentPool?: string[];
  dmMessage?: string;
};

export type ActionResult = {
  status: "success" | "error" | "skipped" | "challenged" | "banned";
  message: string;
};

export type ScrapeParams = {
  profileId: string;
  platform: "instagram" | "twitter" | "facebook";
  sourceType: "hashtag" | "followers_of";
  seed: string;
  limit: number;
  skipNoAvatar?: boolean;
  proxy?: ProxyConfig | null;
  fingerprint: FingerprintConfig;
  storageStatePlainPath: string;
};

export type ScrapeResult = {
  status: "success" | "error";
  targets: string[];
  message: string;
};

export type PostMetrics = {
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  views?: number | null;
  bookmarks?: number | null;
};

export type MonitorParams = {
  platform: "instagram" | "twitter" | "facebook";
  url: string;
  proxy?: ProxyConfig | null;
  fingerprint: FingerprintConfig;
  storageStatePlainPath: string;
};

export type MonitorResult = {
  status: "success" | "error";
  metrics: PostMetrics;
  message: string;
};
