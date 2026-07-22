import type { Page } from "playwright";
import type { PostMetrics } from "../../engine/types.js";
import { parseCount } from "../../engine/parse-count.js";

/**
 * Facebook doesn't consistently populate og:description with engagement counts
 * the way Instagram does, so this is even more best-effort — falls back to
 * scanning for aria-labels on the reaction/comment/share buttons.
 */
export async function scrapePostMetrics(page: Page, url: string): Promise<PostMetrics> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const likeLabel = await page
    .locator('div[aria-label*="Like"][role="button"]')
    .first()
    .getAttribute("aria-label")
    .catch(() => null);
  const likes = parseCount(likeLabel?.match(/^([\d,.]+[KMB]?)/)?.[1]);

  const commentText = await page
    .getByText(/comments?$/i)
    .first()
    .innerText()
    .catch(() => null);
  const comments = parseCount(commentText?.match(/^([\d,.]+[KMB]?)/)?.[1]);

  const shareText = await page
    .getByText(/shares?$/i)
    .first()
    .innerText()
    .catch(() => null);
  const shares = parseCount(shareText?.match(/^([\d,.]+[KMB]?)/)?.[1]);

  return { likes, comments, shares };
}
