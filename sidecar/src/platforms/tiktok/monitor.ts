import type { Page } from "playwright";
import type { PostMetrics } from "../../engine/types.js";
import { parseCount } from "../../engine/parse-count.js";

/**
 * Reads TikTok's own `data-e2e` counter attributes on the video's action bar
 * (like/comment/share/favorite). These are internal TikTok test hooks, not a
 * documented API — best-effort, may break if TikTok renames them.
 */
export async function scrapePostMetrics(page: Page, url: string): Promise<PostMetrics> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  async function countFor(selector: string): Promise<number | null> {
    const text = await page.locator(selector).first().innerText().catch(() => null);
    return parseCount(text ?? undefined);
  }

  const likes = await countFor('[data-e2e="like-count"]');
  const comments = await countFor('[data-e2e="comment-count"]');
  const shares = await countFor('[data-e2e="share-count"]');
  const bookmarks = await countFor('[data-e2e="undefined-count"], [data-e2e="favorite-count"]');

  return { likes, comments, shares, bookmarks };
}
