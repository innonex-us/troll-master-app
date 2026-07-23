import { closeContext, openContext } from "./browser.js";
import { detectIssue } from "./detection.js";
import { scrapeLatestOwnPost as instagramLatest } from "../platforms/instagram/scrape.js";
import { scrapeLatestOwnPost as twitterLatest } from "../platforms/twitter/scrape.js";
import { scrapeLatestOwnPost as facebookLatest } from "../platforms/facebook/scrape.js";
import { scrapeLatestOwnPost as tiktokLatest } from "../platforms/tiktok/scrape.js";
import { scrapeLatestOwnPost as linkedinLatest } from "../platforms/linkedin/scrape.js";
import { scrapeLatestOwnPost as youtubeLatest } from "../platforms/youtube/scrape.js";
import { instagramConfig } from "../platforms/instagram/config.js";
import { twitterConfig } from "../platforms/twitter/config.js";
import { facebookConfig } from "../platforms/facebook/config.js";
import { tiktokConfig } from "../platforms/tiktok/config.js";
import { linkedinConfig } from "../platforms/linkedin/config.js";
import { youtubeConfig } from "../platforms/youtube/config.js";
import type { OwnPostParams, OwnPostResult, Platform } from "./types.js";

const BASE_URL: Record<Platform, string> = {
  instagram: instagramConfig.baseUrl,
  twitter: twitterConfig.baseUrl,
  facebook: facebookConfig.baseUrl,
  tiktok: tiktokConfig.baseUrl,
  linkedin: linkedinConfig.baseUrl,
  youtube: youtubeConfig.baseUrl,
};

const LATEST_OWN_POST: Record<Platform, typeof instagramLatest> = {
  instagram: instagramLatest,
  twitter: twitterLatest,
  facebook: facebookLatest,
  tiktok: tiktokLatest,
  linkedin: linkedinLatest,
  youtube: youtubeLatest,
};

/** Fetches whatever the sidecar can find as a profile's single newest post/video —
 * used by Engagement Pods to auto-detect when a pod member has published something
 * new, without the user manually registering each post like Monitor does. */
export async function runOwnLatestPost(params: OwnPostParams): Promise<OwnPostResult> {
  const opened = await openContext({
    headless: true,
    proxy: params.proxy,
    fingerprint: params.fingerprint,
    storageStatePlainPath: params.storageStatePlainPath,
  });

  try {
    const page = await opened.context.newPage();
    await page.goto(BASE_URL[params.platform], { waitUntil: "domcontentloaded" }).catch(() => {});
    const issue = await detectIssue(page, params.platform);
    if (issue) {
      return { status: "error", url: null, message: issue.detail };
    }

    const url = await LATEST_OWN_POST[params.platform](page, params.username);
    return { status: "success", url, message: url ? "found latest post" : "no posts found" };
  } catch (err) {
    return { status: "error", url: null, message: err instanceof Error ? err.message : String(err) };
  } finally {
    await closeContext(opened);
  }
}
