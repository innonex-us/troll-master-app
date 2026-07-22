import type { Page } from "playwright";
import type { PostMetrics } from "../../engine/types.js";
import { parseCount } from "../../engine/parse-count.js";

async function ariaCount(page: Page, testId: string): Promise<number | null> {
  const label = await page.locator(`[data-testid="${testId}"]`).first().getAttribute("aria-label").catch(() => null);
  if (!label) return null;
  const match = label.match(/^([\d,.]+[KMB]?)/i);
  return parseCount(match?.[1]);
}

/**
 * Reads engagement counts from the tweet action bar's aria-labels (e.g.
 * "123 Reposts. Repost"), which X provides for accessibility and tends to be
 * more stable than the abbreviated visible text. Views come from the analytics
 * link near the tweet, when X renders one — heuristic, may return null.
 */
export async function scrapeTweetMetrics(page: Page, url: string): Promise<PostMetrics> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const [comments, shares, likes, bookmarks] = await Promise.all([
    ariaCount(page, "reply"),
    ariaCount(page, "retweet"),
    ariaCount(page, "like"),
    ariaCount(page, "bookmark"),
  ]);

  const viewsText = await page
    .locator('a[href$="/analytics"]')
    .first()
    .innerText()
    .catch(() => null);
  const views = parseCount(viewsText);

  return { likes, comments, shares, views, bookmarks };
}
