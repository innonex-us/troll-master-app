import { closeContext, openContext } from "./browser.js";
import { detectIssue } from "./detection.js";
import * as instagramScrape from "../platforms/instagram/scrape.js";
import * as twitterScrape from "../platforms/twitter/scrape.js";
import * as facebookScrape from "../platforms/facebook/scrape.js";
import { instagramConfig } from "../platforms/instagram/config.js";
import { twitterConfig } from "../platforms/twitter/config.js";
import { facebookConfig } from "../platforms/facebook/config.js";
import type { ScrapeParams, ScrapeResult } from "./types.js";

function baseUrlFor(platform: ScrapeParams["platform"]): string {
  if (platform === "instagram") return instagramConfig.baseUrl;
  if (platform === "twitter") return twitterConfig.baseUrl;
  return facebookConfig.baseUrl;
}

function scraperFor(platform: ScrapeParams["platform"]) {
  if (platform === "instagram") return instagramScrape;
  if (platform === "twitter") return twitterScrape;
  return facebookScrape;
}

export async function runScrape(params: ScrapeParams): Promise<ScrapeResult> {
  const opened = await openContext({
    headless: true,
    proxy: params.proxy,
    fingerprint: params.fingerprint,
    storageStatePlainPath: params.storageStatePlainPath,
  });

  try {
    const page = await opened.context.newPage();
    const baseUrl = baseUrlFor(params.platform);

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
    const issue = await detectIssue(page, params.platform);
    if (issue) {
      return { status: "error", targets: [], message: issue.detail };
    }

    const scraper = scraperFor(params.platform);
    const targets =
      params.sourceType === "hashtag"
        ? await scraper.scrapeHashtag(page, params.seed, params.limit)
        : await scraper.scrapeFollowersOf(page, params.seed, params.limit, params.skipNoAvatar);

    await opened.context.storageState({ path: params.storageStatePlainPath }).catch(() => {});

    return { status: "success", targets, message: `scraped ${targets.length} targets` };
  } catch (err) {
    return { status: "error", targets: [], message: err instanceof Error ? err.message : String(err) };
  } finally {
    await closeContext(opened);
  }
}
