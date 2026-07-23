import type { Page } from "playwright";
import type { PostMetrics } from "../../engine/types.js";
import { parseCount } from "../../engine/parse-count.js";

/**
 * Reads YouTube's own rendered counters (like button aria-label, comment
 * section header count, view count text). Internal DOM structure, not a
 * documented API — best-effort, may break if YouTube changes markup.
 */
export async function scrapePostMetrics(page: Page, url: string): Promise<PostMetrics> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const likeLabel = await page
    .locator('#segmented-like-button button, like-button-view-model button')
    .first()
    .getAttribute("aria-label")
    .catch(() => null);
  const likes = parseCount(likeLabel?.match(/^([\d,.]+[KMB]?)/)?.[1]);

  const commentsText = await page
    .locator("#comments #count")
    .first()
    .innerText()
    .catch(() => null);
  const comments = parseCount(commentsText?.match(/([\d,.]+[KMB]?)/)?.[1]);

  const viewsText = await page
    .locator(".view-count, ytd-video-view-count-renderer")
    .first()
    .innerText()
    .catch(() => null);
  const views = parseCount(viewsText?.match(/([\d,.]+[KMB]?)/)?.[1]);

  return { likes, comments, views };
}
