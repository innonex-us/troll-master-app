import type { Page } from "playwright";
import type { PostMetrics, ScrapedComment } from "../../engine/types.js";
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

/**
 * Reads the visible comment thread under a post. Instagram's comment DOM has no
 * stable per-comment id exposed to scraping, so `id` is a synthetic hash of
 * author+text used only for local de-duplication — an edited comment will be
 * (mis)treated as a new one. Best-effort, first ~20 visible comments only.
 */
export async function scrapeComments(page: Page, url: string): Promise<ScrapedComment[]> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const rows = await page.locator("ul ul li").evaluateAll((els) =>
    els.slice(0, 20).map((el) => ({
      author: el.querySelector("a[role='link']")?.textContent?.trim() ?? "",
      text: el.querySelector("span")?.textContent?.trim() ?? "",
    })),
  );

  return rows
    .filter((r) => r.author && r.text)
    .map((r) => ({ id: `${r.author}:${r.text}`.slice(0, 200), author: r.author, text: r.text }));
}
