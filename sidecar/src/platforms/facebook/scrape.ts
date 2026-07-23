import type { Page } from "playwright";
import { facebookConfig } from "./config.js";

/**
 * Facebook post URLs are far less uniform than Instagram/Twitter's (permalink.php,
 * /posts/, /videos/, /photo/, story_fbid= query params all occur), so this hashtag
 * scraper is a best-effort pass over the most common link shapes and may miss posts.
 */
export async function scrapeHashtag(page: Page, hashtag: string, limit: number): Promise<string[]> {
  const tag = hashtag.replace(/^#/, "");
  await page.goto(`${facebookConfig.baseUrl}/hashtag/${encodeURIComponent(tag)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(1500);

  const urls = new Set<string>();
  for (let i = 0; i < 6 && urls.size < limit; i++) {
    const hrefs = await page
      .locator('a[href*="/posts/"], a[href*="/videos/"], a[href*="/photo/"]')
      .evaluateAll((els) => els.map((el) => (el as HTMLAnchorElement).href));
    for (const href of hrefs) {
      if (href) urls.add(href);
      if (urls.size >= limit) break;
    }
    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(800);
  }
  return Array.from(urls).slice(0, limit);
}

/**
 * Facebook doesn't expose a public "followers" list the way Instagram/Twitter do —
 * this reads a profile's Friends tab, which is frequently privacy-restricted and
 * may return an empty list even for real accounts. Best-effort only.
 */
export async function scrapeFollowersOf(page: Page, username: string, limit: number): Promise<string[]> {
  const handle = username.replace(/^@/, "");
  await page.goto(`${facebookConfig.baseUrl}/${handle}/friends`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const handles = new Set<string>();
  for (let i = 0; i < 10 && handles.size < limit; i++) {
    const hrefs = await page.locator('a[href^="https://www.facebook.com/"]').evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute("href")),
    );
    for (const href of hrefs) {
      const match = href?.match(/^https:\/\/www\.facebook\.com\/([A-Za-z0-9.]+)\/?$/);
      if (match && match[1].toLowerCase() !== handle.toLowerCase() && !match[1].startsWith("hashtag")) {
        handles.add(match[1]);
      }
      if (handles.size >= limit) break;
    }
    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(800);
  }
  return Array.from(handles).slice(0, limit);
}

/** Reads a profile's timeline and returns the newest post URL, if any — used
 * by Engagement Pods to detect a member's newest own post. Same fragile
 * link-shape heuristic as `scrapeHashtag`. */
export async function scrapeLatestOwnPost(page: Page, username: string): Promise<string | null> {
  const handle = username.replace(/^@/, "");
  await page.goto(`${facebookConfig.baseUrl}/${handle}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const href = await page
    .locator('a[href*="/posts/"], a[href*="/videos/"], a[href*="/photo/"]')
    .first()
    .evaluate((el) => (el as HTMLAnchorElement).href)
    .catch(() => null);
  return href ?? null;
}
