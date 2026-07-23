import { closeContext, openContext } from "./browser.js";
import { detectIssue } from "./detection.js";
import { scrapePostMetrics as scrapeInstagramMetrics } from "../platforms/instagram/monitor.js";
import { scrapeTweetMetrics } from "../platforms/twitter/monitor.js";
import { scrapePostMetrics as scrapeFacebookMetrics } from "../platforms/facebook/monitor.js";
import { scrapePostMetrics as scrapeTiktokMetrics } from "../platforms/tiktok/monitor.js";
import { scrapePostMetrics as scrapeLinkedinMetrics } from "../platforms/linkedin/monitor.js";
import { scrapePostMetrics as scrapeYoutubeMetrics } from "../platforms/youtube/monitor.js";
import { instagramConfig } from "../platforms/instagram/config.js";
import { twitterConfig } from "../platforms/twitter/config.js";
import { facebookConfig } from "../platforms/facebook/config.js";
import { tiktokConfig } from "../platforms/tiktok/config.js";
import { linkedinConfig } from "../platforms/linkedin/config.js";
import { youtubeConfig } from "../platforms/youtube/config.js";
import type { MonitorParams, MonitorResult, Platform, PostMetrics } from "./types.js";

const BASE_URL: Record<Platform, string> = {
  instagram: instagramConfig.baseUrl,
  twitter: twitterConfig.baseUrl,
  facebook: facebookConfig.baseUrl,
  tiktok: tiktokConfig.baseUrl,
  linkedin: linkedinConfig.baseUrl,
  youtube: youtubeConfig.baseUrl,
};

const SCRAPE_METRICS: Record<Platform, typeof scrapeInstagramMetrics> = {
  instagram: scrapeInstagramMetrics,
  twitter: scrapeTweetMetrics,
  facebook: scrapeFacebookMetrics,
  tiktok: scrapeTiktokMetrics,
  linkedin: scrapeLinkedinMetrics,
  youtube: scrapeYoutubeMetrics,
};

function baseUrlFor(platform: Platform): string {
  return BASE_URL[platform];
}

async function scrapeFor(platform: Platform, page: Parameters<typeof scrapeInstagramMetrics>[0], url: string): Promise<PostMetrics> {
  return SCRAPE_METRICS[platform](page, url);
}

export async function runMonitorScrape(params: MonitorParams): Promise<MonitorResult> {
  const opened = await openContext({
    headless: true,
    proxy: params.proxy,
    fingerprint: params.fingerprint,
    storageStatePlainPath: params.storageStatePlainPath,
  });

  try {
    const page = await opened.context.newPage();
    await page.goto(baseUrlFor(params.platform), { waitUntil: "domcontentloaded" }).catch(() => {});
    const issue = await detectIssue(page, params.platform);
    if (issue) {
      return { status: "error", metrics: {}, message: issue.detail };
    }

    const metrics = await scrapeFor(params.platform, page, params.url);
    return { status: "success", metrics, message: "scraped" };
  } catch (err) {
    return { status: "error", metrics: {}, message: err instanceof Error ? err.message : String(err) };
  } finally {
    await closeContext(opened);
  }
}
