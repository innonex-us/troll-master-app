import { closeContext, openContext } from "./browser.js";
import { detectIssue } from "./detection.js";
import { scrapePostMetrics as scrapeInstagramMetrics } from "../platforms/instagram/monitor.js";
import { scrapeTweetMetrics } from "../platforms/twitter/monitor.js";
import { scrapePostMetrics as scrapeFacebookMetrics } from "../platforms/facebook/monitor.js";
import { instagramConfig } from "../platforms/instagram/config.js";
import { twitterConfig } from "../platforms/twitter/config.js";
import { facebookConfig } from "../platforms/facebook/config.js";
import type { MonitorParams, MonitorResult, PostMetrics } from "./types.js";

function baseUrlFor(platform: MonitorParams["platform"]): string {
  if (platform === "instagram") return instagramConfig.baseUrl;
  if (platform === "twitter") return twitterConfig.baseUrl;
  return facebookConfig.baseUrl;
}

async function scrapeFor(platform: MonitorParams["platform"], page: Parameters<typeof scrapeInstagramMetrics>[0], url: string): Promise<PostMetrics> {
  if (platform === "instagram") return scrapeInstagramMetrics(page, url);
  if (platform === "twitter") return scrapeTweetMetrics(page, url);
  return scrapeFacebookMetrics(page, url);
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
