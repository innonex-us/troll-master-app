import { closeContext, openContext } from "./browser.js";
import { detectIssue } from "./detection.js";
import { scrapeOwnStats as igStats } from "../platforms/instagram/scrape.js";
import { scrapeOwnStats as twStats } from "../platforms/twitter/scrape.js";
import { scrapeOwnStats as fbStats } from "../platforms/facebook/scrape.js";
import { scrapeOwnStats as ttStats } from "../platforms/tiktok/scrape.js";
import { scrapeOwnStats as liStats } from "../platforms/linkedin/scrape.js";
import { scrapeOwnStats as ytStats } from "../platforms/youtube/scrape.js";
import { instagramConfig } from "../platforms/instagram/config.js";
import { twitterConfig } from "../platforms/twitter/config.js";
import { facebookConfig } from "../platforms/facebook/config.js";
import { tiktokConfig } from "../platforms/tiktok/config.js";
import { linkedinConfig } from "../platforms/linkedin/config.js";
import { youtubeConfig } from "../platforms/youtube/config.js";
import type { OwnStatsParams, OwnStatsResult, Platform } from "./types.js";

const BASE_URL: Record<Platform, string> = {
  instagram: instagramConfig.baseUrl,
  twitter: twitterConfig.baseUrl,
  facebook: facebookConfig.baseUrl,
  tiktok: tiktokConfig.baseUrl,
  linkedin: linkedinConfig.baseUrl,
  youtube: youtubeConfig.baseUrl,
};

const OWN_STATS: Record<Platform, typeof igStats> = {
  instagram: igStats,
  twitter: twStats,
  facebook: fbStats,
  tiktok: ttStats,
  linkedin: liStats,
  youtube: ytStats,
};

/** Reads the logged-in profile's own follower/following/post counts for growth
 * analytics. Best-effort per platform (some return nulls). */
export async function runOwnStats(params: OwnStatsParams): Promise<OwnStatsResult> {
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
      return { status: "error", followers: null, following: null, posts: null, message: issue.detail };
    }
    const stats = await OWN_STATS[params.platform](page, params.username);
    return { status: "success", ...stats, message: "scraped stats" };
  } catch (err) {
    return {
      status: "error",
      followers: null,
      following: null,
      posts: null,
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await closeContext(opened);
  }
}
