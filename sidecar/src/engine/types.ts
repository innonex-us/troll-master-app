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

export type Platform = "instagram" | "twitter" | "facebook" | "tiktok" | "linkedin" | "youtube";

export type LoginCaptureParams = {
  profileId: string;
  platform: Platform;
  proxy?: ProxyConfig | null;
  fingerprint: FingerprintConfig;
  storageStatePlainPath: string;
  captchaProvider?: string;
  captchaApiKey?: string;
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
  | "view_story"
  | "react_story"
  | "reply_comment"
  | "block"
  | "mute";

export type TwitterActionType =
  | "follow"
  | "unfollow"
  | "like"
  | "unlike"
  | "comment"
  | "dm"
  | "retweet"
  | "unretweet"
  | "reply_comment"
  | "block"
  | "mute";

export type FacebookActionType =
  | "follow"
  | "unfollow"
  | "like"
  | "unlike"
  | "comment"
  | "dm"
  | "reply_comment"
  | "block";

export type TiktokActionType =
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
  | "block"
  | "watch_video";

export type LinkedinActionType =
  | "follow"
  | "unfollow"
  | "like"
  | "unlike"
  | "comment"
  | "dm"
  | "reply_comment";

export type YoutubeActionType =
  | "follow"
  | "unfollow"
  | "like"
  | "unlike"
  | "comment"
  | "dm"
  | "view_story"
  | "react_story"
  | "reply_comment"
  | "watch_video";

export type ActionRunParams = {
  profileId: string;
  platform: Platform;
  actionType:
    | InstagramActionType
    | TwitterActionType
    | FacebookActionType
    | TiktokActionType
    | LinkedinActionType
    | YoutubeActionType;
  target: string;
  proxy?: ProxyConfig | null;
  fingerprint: FingerprintConfig;
  storageStatePlainPath: string;
  commentPool?: string[];
  dmMessage?: string;
  reactionType?: string;
  humanize?: boolean;
};

export type ActionResult = {
  status: "success" | "error" | "skipped" | "challenged" | "banned";
  message: string;
};

export type ScrapeParams = {
  profileId: string;
  platform: Platform;
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
  platform: Platform;
  url: string;
  proxy?: ProxyConfig | null;
  fingerprint: FingerprintConfig;
  storageStatePlainPath: string;
  includeComments?: boolean;
};

export type ScrapedComment = {
  /** Synthetic id derived from author+text — these platforms don't reliably
   * expose a real stable comment id via DOM scraping. */
  id: string;
  author: string;
  text: string;
};

export type MonitorResult = {
  status: "success" | "error";
  metrics: PostMetrics;
  message: string;
  comments?: ScrapedComment[];
};

export type OwnPostParams = {
  platform: Platform;
  username: string;
  proxy?: ProxyConfig | null;
  fingerprint: FingerprintConfig;
  storageStatePlainPath: string;
};

export type OwnPostResult = {
  status: "success" | "error";
  url: string | null;
  message: string;
};

export type OwnStatsParams = OwnPostParams;

export type OwnStats = {
  followers: number | null;
  following: number | null;
  posts: number | null;
};

export type OwnStatsResult = OwnStats & {
  status: "success" | "error";
  message: string;
};

export type PublishPostParams = {
  platform: Platform;
  mediaPath: string;
  caption: string;
  proxy?: ProxyConfig | null;
  fingerprint: FingerprintConfig;
  storageStatePlainPath: string;
};

export type PublishPostResult = {
  status: "success" | "error" | "skipped";
  message: string;
};
