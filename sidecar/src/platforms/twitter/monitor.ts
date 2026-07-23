import type { Page } from "playwright";
import type { PostMetrics, ScrapedComment } from "../../engine/types.js";
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

/**
 * Reads the reply thread rendered below the original tweet — each reply is its
 * own `article[data-testid="tweet"]`, so this skips the first one (the tweet
 * being monitored itself). `id` is a synthetic author+text hash, not a real
 * tweet id, since extracting the numeric status id reliably from the DOM isn't
 * worth the added fragility here. Best-effort, first ~20 replies only.
 */
export async function scrapeComments(page: Page, url: string): Promise<ScrapedComment[]> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const rows = await page.locator('article[data-testid="tweet"]').evaluateAll((els) =>
    els.slice(1, 21).map((el) => ({
      author: el.querySelector('[data-testid="User-Name"]')?.textContent?.trim() ?? "",
      text: el.querySelector('[data-testid="tweetText"]')?.textContent?.trim() ?? "",
    })),
  );

  return rows
    .filter((r) => r.author && r.text)
    .map((r) => ({ id: `${r.author}:${r.text}`.slice(0, 200), author: r.author, text: r.text }));
}
