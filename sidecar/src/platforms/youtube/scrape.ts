import type { Page } from "playwright";
import { youtubeConfig } from "./config.js";

export async function scrapeHashtag(page: Page, hashtag: string, limit: number): Promise<string[]> {
  const tag = hashtag.replace(/^#/, "");
  await page.goto(`${youtubeConfig.baseUrl}/hashtag/${encodeURIComponent(tag)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(1500);

  const urls = new Set<string>();
  for (let i = 0; i < 6 && urls.size < limit; i++) {
    const hrefs = await page
      .locator('a#video-title-link, a[href*="/watch?v="]')
      .evaluateAll((els) => els.map((el) => (el as HTMLAnchorElement).href));
    for (const href of hrefs) {
      if (href) urls.add(href.split("&")[0]);
      if (urls.size >= limit) break;
    }
    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(900);
  }
  return Array.from(urls).slice(0, limit);
}

/**
 * YouTube never exposes a subscriber list publicly (subscriber counts are
 * public, the list of subscribers never is), so there is no true equivalent
 * of Instagram's "followers of" scrape. This instead reads the channel's
 * "Channels" tab (creator-curated related-channel picks), the closest
 * available proxy for "accounts related to this seed". Best-effort, often
 * empty for channels that don't feature others.
 */
export async function scrapeFollowersOf(page: Page, username: string, limit: number): Promise<string[]> {
  const handle = username.replace(/^@/, "");
  await page.goto(`${youtubeConfig.baseUrl}/@${handle}/channels`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const handles = new Set<string>();
  for (let i = 0; i < 4 && handles.size < limit; i++) {
    const hrefs = await page
      .locator('a[href^="/@"]')
      .evaluateAll((els) => els.map((el) => (el as HTMLAnchorElement).getAttribute("href")));
    for (const href of hrefs) {
      const match = href?.match(/^\/@([A-Za-z0-9._-]+)/);
      if (match && match[1].toLowerCase() !== handle.toLowerCase()) {
        handles.add(match[1]);
      }
      if (handles.size >= limit) break;
    }
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(700);
  }
  return Array.from(handles).slice(0, limit);
}
