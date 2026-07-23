import type { Page } from "playwright";
import type { PostMetrics, ScrapedComment } from "../../engine/types.js";
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

/**
 * Reads visible comments under a Facebook post. Facebook's comment DOM is
 * heavily obfuscated/class-hashed, so this leans on `aria-label`-bearing
 * elements Facebook renders for accessibility. `id` is a synthetic author+text
 * hash. Even more best-effort than the rest of this file — may return nothing.
 */
export async function scrapeComments(page: Page, url: string): Promise<ScrapedComment[]> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const rows = await page.locator('div[aria-label][role="article"]').evaluateAll((els) =>
    els.slice(0, 20).map((el) => ({
      author: el.querySelector("a[role='link'] span")?.textContent?.trim() ?? "",
      text: el.querySelector("div[dir='auto']")?.textContent?.trim() ?? "",
    })),
  );

  return rows
    .filter((r) => r.author && r.text)
    .map((r) => ({ id: `${r.author}:${r.text}`.slice(0, 200), author: r.author, text: r.text }));
}
