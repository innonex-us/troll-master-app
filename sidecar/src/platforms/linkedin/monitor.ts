import type { Page } from "playwright";
import type { PostMetrics, ScrapedComment } from "../../engine/types.js";
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

/** Reads visible comments under a LinkedIn post (`.comments-comment-item`
 * blocks). `id` is a synthetic author+text hash. Best-effort, first ~20
 * visible comments only. */
export async function scrapeComments(page: Page, url: string): Promise<ScrapedComment[]> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const rows = await page.locator(".comments-comment-item, article.comments-comment-entity").evaluateAll((els) =>
    els.slice(0, 20).map((el) => ({
      author: el.querySelector(".comments-comment-meta__description-title")?.textContent?.trim() ?? "",
      text: el.querySelector(".comments-comment-item__main-content, .update-components-text")?.textContent?.trim() ?? "",
    })),
  );

  return rows
    .filter((r) => r.author && r.text)
    .map((r) => ({ id: `${r.author}:${r.text}`.slice(0, 200), author: r.author, text: r.text }));
}
