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
  platform: "instagram" | "twitter";
  proxy?: ProxyConfig | null;
  fingerprint: FingerprintConfig;
  storageStatePlainPath: string;
};

export type ActionRunParams = {
  profileId: string;
  platform: "instagram" | "twitter";
  actionType: "follow" | "unfollow" | "like" | "comment";
  target: string;
  proxy?: ProxyConfig | null;
  fingerprint: FingerprintConfig;
  storageStatePlainPath: string;
  commentPool?: string[];
};

export type ActionResult = {
  status: "success" | "error" | "skipped";
  message: string;
};
