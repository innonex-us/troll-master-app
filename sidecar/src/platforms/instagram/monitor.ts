import type { Page } from "playwright";
import type { PostMetrics } from "../../engine/types.js";
import { parseCount } from "../../engine/parse-count.js";

/**
 * Instagram doesn't expose a stable engagement API for anonymous/session scraping,
 * so this reads the public `og:description` meta tag, which Instagram populates
 * with text like "1,234 likes, 56 comments - username on Instagram: ...". This is
 * a heuristic against a format Instagram controls and could change without notice.
 */
export async function scrapePostMetrics(page: Page, url: string): Promise<PostMetrics> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  const content = await page
    .locator('meta[property="og:description"]')
    .getAttribute("content")
    .catch(() => null);

  if (!content) return {};

  const likesMatch = content.match(/([\d,.]+[KMB]?)\s+likes?/i);
  const commentsMatch = content.match(/([\d,.]+[KMB]?)\s+comments?/i);

  return {
    likes: parseCount(likesMatch?.[1]),
    comments: parseCount(commentsMatch?.[1]),
  };
}
