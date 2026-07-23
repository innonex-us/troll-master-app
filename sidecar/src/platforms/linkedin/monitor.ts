import type { Page } from "playwright";
import type { PostMetrics } from "../../engine/types.js";
import { parseCount } from "../../engine/parse-count.js";

/**
 * LinkedIn doesn't populate a stable engagement API for anonymous scraping,
 * so this reads the social-counts bar rendered under a post (reactions text
 * + "N comments" text). Best-effort — class names/text formats can change.
 */
export async function scrapePostMetrics(page: Page, url: string): Promise<PostMetrics> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const reactionsText = await page
    .locator('.social-details-social-counts__reactions-count, [aria-label*="reactions"]')
    .first()
    .innerText()
    .catch(() => null);
  const likes = parseCount(reactionsText ?? undefined);

  const commentsText = await page
    .getByText(/comments?$/i)
    .first()
    .innerText()
    .catch(() => null);
  const comments = parseCount(commentsText?.match(/^([\d,.]+[KMB]?)/)?.[1]);

  return { likes, comments };
}
